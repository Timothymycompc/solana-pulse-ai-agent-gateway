// Measures token_safety against what really happened, so its accuracy is measured instead of assumed (PRINCIPLES.md).
// The questions it answers:
//   1. Does the verdict mean something? Of the tokens called AVOID, CAUTION and SAFE, how many cost their buyers
//      most of their money within a week?
//   2. Of the tokens that did cost buyers most of their money, how many did it call AVOID, and how many SAFE?
//   3. Which checks carry the signal? For each check, how often a token it flagged lost most, against one it passed.
//   4. False alarms on well-known tokens: of established, liquid, verified tokens, how many does it call SAFE?
// It runs on Google Cloud, not on anyone's computer: Cloud Scheduler calls POST /api/owner/accuracy/tick every
// 10 minutes (scripts/accuracy-setup.sh). Each tick does a small, bounded amount of work:
//   - Sample (questions 1-3): until SAMPLE_GOAL are recorded, take tokens under YOUNG_DAYS old with at least
//     MIN_LIQUIDITY_USD of liquidity from Jupiter's activity lists, the tokens people are buying right now. Below that
//     liquidity the liquidity rule alone decides. Record the verdict, every check's result, liquidity and price.
//   - Queue (question 4): tokens added by hand (POST /api/owner/accuracy/add, e.g. npm run accuracy-rerun).
//   - Follow up: FOLLOW_UP_DAYS after a sampled token's verdict, record its price, liquidity and RugCheck's flag.
// "Lost most" means the price fell 90% or more, the liquidity fell 90% or more (no longer listed by Jupiter while
// Jupiter answers counts as none left), or RugCheck marks it rugged. With no answer from any source the outcome is
// unknown and left out; nothing is guessed. GET /api/owner/accuracy shows the answers.
import { pool } from "./db";
import { jupiterHost, jupLookup, rugReport, type JupToken } from "./tools/lib";
import type { ToolContext } from "./tools/types";

export const SAMPLE_COHORT = "young-tokens-2026-10";
export const SAMPLE_GOAL = 100;
export const MIN_LIQUIDITY_USD = 10_000;
export const YOUNG_DAYS = 3;
export const FOLLOW_UP_DAYS = 7;
// Measured 2026-10-16: together these lists held 10-20 tokens under 3 days old with $10k+ liquidity at a time.
export const SAMPLE_LISTS = ["toptraded/1h", "toporganicscore/1h", "toptrending/5m"];
const PER_TICK = { sample: 5, queue: 15, followUp: 15 };
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DAY = 864e5;

type Verdict = (mint: string) => Promise<{ verdict: string; checks: { name: string; result: string }[] }>;
type Row = Record<string, any>;

export function outcome(r: { rugcheck_rugged: boolean | null; liquidity_then: number | null; liquidity_now: number | null; price_then: number | null; price_now: number | null }) {
  const fell = (then: number | null, now: number | null) => (then !== null && then > 0 && now !== null ? now <= then * 0.1 : null);
  const liquidityCollapsed = fell(r.liquidity_then, r.liquidity_now);
  const priceCollapsed = fell(r.price_then, r.price_now);
  const signs = [r.rugcheck_rugged, liquidityCollapsed, priceCollapsed];
  const lostMost = signs.includes(true) ? true : liquidityCollapsed === false || priceCollapsed === false ? false : null;
  return { lostMost, liquidityCollapsed, priceCollapsed, rugcheckRugged: r.rugcheck_rugged };
}

const ageDays = (firstPoolAt: string | null | undefined, at = Date.now()) => (firstPoolAt ? (at - Date.parse(firstPoolAt)) / DAY : null);

async function market(ctx: ToolContext, mint: string) {
  const { tokens, ok } = await jupLookup(ctx, mint);
  const j = tokens.find((t) => t.id === mint);
  return { j, liquidity: j ? (j.liquidity ?? null) : ok ? 0 : null, price: j?.usdPrice ?? null };
}

// A verdict made while Jupiter or RugCheck couldn't be reached is partial (those checks were skipped), so it is retried
// instead of counted: otherwise the test would measure the data sources' rate limits, not token_safety. In the first
// live run 2 of 5 verdicts were partial. RugCheck's "info" for verified tokens it can't report on is permanent, so it counts.
const PARTIAL = ["market_data", "rugcheck_data"];

async function check(ctx: ToolContext, verdict: Verdict, cohort: string, mint: string, followUp: boolean, listed?: JupToken) {
  try {
    const r = await verdict(mint);
    const partial = r.checks.filter((c) => PARTIAL.includes(c.name) && c.result === "warn").map((c) => c.name);
    if (partial.length) throw new Error(`Partial verdict (${partial.join(", ")} unavailable); retried later.`);
    // The list entry already holds the token's numbers at this moment; look them up only for tokens added by hand.
    const { j, liquidity, price } = listed ? { j: listed, liquidity: listed.liquidity ?? null, price: listed.usdPrice ?? null } : await market(ctx, mint);
    await pool.query(
      `UPDATE accuracy_tokens SET checked_at = NOW(), verdict = $3, checks = $4, verified = $5, tags = $6, first_pool_at = $7,
         liquidity_then = $8, price_then = $9, follow_up_due = $10, error = NULL WHERE cohort = $1 AND mint = $2`,
      [cohort, mint, r.verdict, JSON.stringify(Object.fromEntries(r.checks.map((c) => [c.name, c.result]))), j ? j.isVerified === true : null,
        j?.tags ?? null, j?.firstPool?.createdAt ?? null, liquidity, price, followUp ? new Date(Date.now() + FOLLOW_UP_DAYS * DAY) : null]);
  } catch (error: any) {
    await pool.query(`UPDATE accuracy_tokens SET error = $3, attempts = attempts + 1 WHERE cohort = $1 AND mint = $2`, [cohort, mint, String(error?.message ?? error).slice(0, 300)]);
  }
}

export async function addToQueue(cohort: string, mints: string[]): Promise<number> {
  const clean = [...new Set(mints.map(String).filter((m) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(m)))];
  for (const mint of clean) await pool.query(`INSERT INTO accuracy_tokens (cohort, mint, found_in) VALUES ($1, $2, 'added by hand') ON CONFLICT DO NOTHING`, [cohort, mint]);
  return clean.length;
}

// Young, liquid tokens from Jupiter's activity lists, taking turns between the lists so no one list dominates, each
// with the list it was found in.
async function sampleCandidates(ctx: ToolContext): Promise<{ token: JupToken; list: string }[]> {
  const perList = await Promise.all(SAMPLE_LISTS.map(async (list) => {
    const tokens: JupToken[] = await ctx.fetchJson(`${jupiterHost()}/tokens/v2/${list}?limit=100`, 8000).catch(() => []);
    return (Array.isArray(tokens) ? tokens : []).filter((t) => {
      const age = ageDays(t.firstPool?.createdAt);
      return age !== null && age < YOUNG_DAYS && (t.liquidity ?? 0) >= MIN_LIQUIDITY_USD;
    }).map((token) => ({ token, list }));
  }));
  const seen = new Map<string, { token: JupToken; list: string }>();
  for (let i = 0; perList.some((l) => i < l.length); i++) for (const l of perList) if (l[i] && !seen.has(l[i].token.id)) seen.set(l[i].token.id, l[i]);
  return [...seen.values()];
}

export async function accuracyTick(ctx: ToolContext, verdict: Verdict) {
  const done = { sampled: 0, checked: 0, followedUp: 0 };
  const have = Number((await pool.query(`SELECT COUNT(*) AS n FROM accuracy_tokens WHERE cohort = $1`, [SAMPLE_COHORT])).rows[0].n);
  if (have < SAMPLE_GOAL) {
    for (const { token, list } of await sampleCandidates(ctx)) {
      if (done.sampled >= Math.min(PER_TICK.sample, SAMPLE_GOAL - have)) break;
      const added = await pool.query(`INSERT INTO accuracy_tokens (cohort, mint, found_in) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [SAMPLE_COHORT, token.id, list]);
      if (!added.rowCount) continue;
      await check(ctx, verdict, SAMPLE_COHORT, token.id, true, token);
      done.sampled++;
      await pause(500);
    }
  }
  // Tokens queued by hand, and sampled ones whose check failed or was partial, oldest first. Each gets 3 tries, then
  // stays an error (and is reported as one).
  const queued = (await pool.query(`SELECT cohort, mint FROM accuracy_tokens WHERE checked_at IS NULL AND attempts < 3 ORDER BY added_at LIMIT $1`, [PER_TICK.queue])).rows;
  for (const q of queued) { await check(ctx, verdict, q.cohort, q.mint, q.cohort === SAMPLE_COHORT); done.checked++; await pause(500); }
  const due = (await pool.query(`SELECT cohort, mint FROM accuracy_tokens WHERE follow_up_due <= NOW() AND followed_at IS NULL ORDER BY follow_up_due LIMIT $1`, [PER_TICK.followUp])).rows;
  for (const d of due) {
    const [rug, m] = await Promise.all([rugReport(ctx, d.mint), market(ctx, d.mint)]);
    await pool.query(`UPDATE accuracy_tokens SET followed_at = NOW(), rugcheck_rugged = $3, liquidity_now = $4, price_now = $5 WHERE cohort = $1 AND mint = $2`,
      [d.cohort, d.mint, rug.ok && rug.report ? rug.report.rugged === true : null, m.liquidity, m.price]);
    done.followedUp++;
    await pause(500);
  }
  return done;
}

const rate = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}% (${part} of ${whole})` : "no data yet");
const VERDICTS = ["AVOID", "CAUTION", "SAFE"];

// Established, liquid and verified, judged without Pulse's own checks: Jupiter-verified, not a stock or real-world
// asset, over $1M of liquidity and trading for 90+ days when checked.
export const knownGood = (r: Row) => r.verified === true && !(r.tags ?? []).some((t: string) => t === "rwa" || t === "stocks") &&
  (r.liquidity_then ?? 0) >= 1_000_000 && (ageDays(r.first_pool_at, Date.parse(r.checked_at)) ?? 0) >= 90;

function sampledAnswers(rows: Row[]) {
  const known = rows.map((r) => ({ r, o: outcome(r as Parameters<typeof outcome>[0]) })).filter((x) => x.o.lostMost !== null);
  const lost = known.filter((x) => x.o.lostMost);
  const lossByVerdict = Object.fromEntries(VERDICTS.map((v) => { const g = known.filter((x) => x.r.verdict === v); return [v, rate(g.filter((x) => x.o.lostMost).length, g.length)]; }));
  const names = [...new Set(known.flatMap((x) => Object.keys(x.r.checks ?? {})))];
  const byCheck = names.map((name) => {
    const flagged = known.filter((x) => ["fail", "warn"].includes(x.r.checks?.[name]));
    const passed = known.filter((x) => ["pass", "info"].includes(x.r.checks?.[name]));
    return { check: name, lostMostWhenFlagged: rate(flagged.filter((x) => x.o.lostMost).length, flagged.length), lostMostWhenPassed: rate(passed.filter((x) => x.o.lostMost).length, passed.length) };
  });
  const count = (f: (x: { r: Row; o: ReturnType<typeof outcome> }) => boolean) => known.filter(f).length;
  return {
    followedUp: rows.filter((r) => r.followed_at).length,
    outcomeKnown: known.length,
    "1_lostMostByVerdict": lossByVerdict,
    "2_ofTokensThatLostMost": { calledAvoid: rate(lost.filter((x) => x.r.verdict === "AVOID").length, lost.length), calledSafe: rate(lost.filter((x) => x.r.verdict === "SAFE").length, lost.length) },
    "3_byCheck": byCheck,
    howTheyLostIt: { priceDown90: count((x) => x.o.priceCollapsed === true), liquidityDown90: count((x) => x.o.liquidityCollapsed === true), rugcheckRugged: count((x) => x.o.rugcheckRugged === true) },
  };
}

export async function accuracyReport() {
  const rows: Row[] = (await pool.query(`SELECT * FROM accuracy_tokens ORDER BY cohort, added_at`)).rows;
  const cohorts: Record<string, any> = {};
  for (const name of [...new Set(rows.map((r) => r.cohort))]) {
    const all = rows.filter((r) => r.cohort === name);
    const checked = all.filter((r) => r.verdict);
    const good = checked.filter(knownGood);
    cohorts[name] = {
      tokens: all.length, checked: checked.length, errors: all.filter((r) => !r.checked_at && r.attempts >= 3).length,
      verdicts: Object.fromEntries(VERDICTS.map((v) => [v, checked.filter((r) => r.verdict === v).length])),
      foundIn: Object.fromEntries([...new Set(all.map((r) => r.found_in))].map((l) => [l, all.filter((r) => r.found_in === l).length])),
      ...(name === SAMPLE_COHORT ? sampledAnswers(checked) : {}),
      "4_knownGood": { tokens: good.length, calledSafe: rate(good.filter((r) => r.verdict === "SAFE").length, good.length), calledAvoid: rate(good.filter((r) => r.verdict === "AVOID").length, good.length) },
    };
  }
  return {
    about: `Sampled cohort ${SAMPLE_COHORT}: ${SAMPLE_GOAL} tokens under ${YOUNG_DAYS} days old with at least $${MIN_LIQUIDITY_USD.toLocaleString("en-US")} of liquidity from Jupiter's activity lists, followed up after ${FOLLOW_UP_DAYS} days. Lost most = price or liquidity down 90%+, or RugCheck marks it rugged; unknown outcomes are left out. Known good = Jupiter-verified, not a stock, over $1M of liquidity, trading 90+ days. Tokens under a day old can't be SAFE (the age check warns), so for young tokens the question is whether AVOID separates the losers from the rest. With 100 tokens, a rate is good to about plus or minus 10 points.`,
    cohorts,
  };
}
