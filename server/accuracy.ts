// Measures token_safety against what really happened, so its accuracy is measured instead of assumed (PRINCIPLES.md).
// The questions it answers:
//   1. Does the verdict mean something? Of the tokens called AVOID, CAUTION and SAFE, how many cost their buyers
//      most of their money within a week?
//   2. Of the tokens that did cost buyers most of their money, how many did it call AVOID, and how many SAFE?
//   3. Which checks carry the signal? For each check, how often a token it flagged lost most, against one it passed.
//   4. False alarms on well-known tokens: of established, liquid, verified tokens, how many does it call SAFE?
// It runs on Google Cloud, not on anyone's computer: Cloud Scheduler calls POST /api/owner/accuracy/tick every
// 10 minutes (scripts/accuracy-setup.sh). Each tick does a small, bounded amount of work:
//   - Sample (questions 1-3): in batches of SAMPLE_GOAL (not counting ones whose check gave up); when a batch is full the
//     next one starts by itself, named young-tokens-<start date>. Take tokens under YOUNG_DAYS old with at least
//     MIN_LIQUIDITY_USD of liquidity from Jupiter's activity lists, the tokens people are buying right now. Below that
//     liquidity the liquidity rule alone decides. Record the verdict, every check's result, liquidity and price.
//   - Queue (question 4): tokens added by hand (POST /api/owner/accuracy/add, e.g. npm run accuracy-rerun).
//   - Follow up: FOLLOW_UP_DAYS after a sampled token's verdict, record its price, liquidity and RugCheck's flag.
//   - Keep watching: LATER_CHECK_DAYS after the verdict, record them again (accuracy_rechecks), for every batch.
// "Lost most" means the price fell 90% or more, the liquidity fell 90% or more (no longer listed by Jupiter while
// Jupiter answers counts as none left), or RugCheck marks it rugged. With no answer from any source the outcome is
// unknown and left out; nothing is guessed. GET /api/owner/accuracy shows the answers.
import { pool } from "./db";
import { jupiterHost, jupLookup, rugReport, type JupToken } from "./tools/lib";
import type { ToolContext } from "./tools/types";

export const SAMPLE_COHORT = "young-tokens-2026-10"; // the first batch; later ones are young-tokens-<start date>
export const SAMPLE_PREFIX = "young-tokens-";
export const isSampled = (cohort: string) => cohort.startsWith(SAMPLE_PREFIX);
export const LATER_CHECK_DAYS = [30, 90];
export const SAMPLE_GOAL = 100;
export const MIN_LIQUIDITY_USD = 10_000;
export const YOUNG_DAYS = 3;
export const FOLLOW_UP_DAYS = 7;
// Measured 2026-10-16: together these lists held 10-20 tokens under 3 days old with $10k+ liquidity at a time.
export const SAMPLE_LISTS = ["toptraded/1h", "toporganicscore/1h", "toptrending/5m"];
const PER_TICK = { sample: 5, queue: 15, followUp: 15, later: 15 };
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
export async function sampleCandidates(ctx: ToolContext): Promise<{ token: JupToken; list: string }[]> {
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
  // Tokens whose check gave up (3 tries) don't count toward the goal, so new ones replace them. In Oct 2026, 59 of the
  // first 100 gave up because Jupiter's keyless API rate-limited token_safety (market data unavailable).
  const { cohort, have } = await currentBatch();
  if (have < SAMPLE_GOAL) {
    for (const { token, list } of await sampleCandidates(ctx)) {
      if (done.sampled >= Math.min(PER_TICK.sample, SAMPLE_GOAL - have)) break;
      // A token already in an earlier batch isn't sampled again, so every batch is new tokens.
      if ((await pool.query(`SELECT 1 FROM accuracy_tokens WHERE mint = $1 AND cohort LIKE $2`, [token.id, `${SAMPLE_PREFIX}%`])).rowCount) continue;
      const added = await pool.query(`INSERT INTO accuracy_tokens (cohort, mint, found_in) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [cohort, token.id, list]);
      if (!added.rowCount) continue;
      await check(ctx, verdict, cohort, token.id, true, token);
      done.sampled++;
      await pause(500);
    }
  }
  // Tokens queued by hand, and sampled ones whose check failed or was partial, oldest first. Each gets 3 tries, then
  // stays an error (and is reported as one).
  const queued = (await pool.query(`SELECT cohort, mint FROM accuracy_tokens WHERE checked_at IS NULL AND attempts < 3 ORDER BY added_at LIMIT $1`, [PER_TICK.queue])).rows;
  for (const q of queued) { await check(ctx, verdict, q.cohort, q.mint, isSampled(q.cohort)); done.checked++; await pause(500); }
  const due = (await pool.query(`SELECT cohort, mint FROM accuracy_tokens WHERE follow_up_due <= NOW() AND followed_at IS NULL ORDER BY follow_up_due LIMIT $1`, [PER_TICK.followUp])).rows;
  for (const d of due) {
    const [rug, m] = await Promise.all([rugReport(ctx, d.mint), market(ctx, d.mint)]);
    await pool.query(`UPDATE accuracy_tokens SET followed_at = NOW(), rugcheck_rugged = $3, liquidity_now = $4, price_now = $5 WHERE cohort = $1 AND mint = $2`,
      [d.cohort, d.mint, rug.ok && rug.report ? rug.report.rugged === true : null, m.liquidity, m.price]);
    done.followedUp++;
    await pause(500);
  }
  // Keep eyes on every earlier batch: each sampled token is read again LATER_CHECK_DAYS after its verdict.
  let later = 0;
  for (const days of LATER_CHECK_DAYS) {
    const dueLater = (await pool.query(`SELECT t.cohort, t.mint FROM accuracy_tokens t WHERE t.cohort LIKE $1 AND t.checked_at IS NOT NULL AND t.checked_at <= NOW() - ($2 || ' days')::interval
      AND NOT EXISTS (SELECT 1 FROM accuracy_rechecks r WHERE r.cohort = t.cohort AND r.mint = t.mint AND r.after_days = $3) ORDER BY t.checked_at LIMIT $4`,
      [`${SAMPLE_PREFIX}%`, String(days), days, PER_TICK.later - later])).rows;
    for (const d of dueLater) {
      const [rug, m] = await Promise.all([rugReport(ctx, d.mint), market(ctx, d.mint)]);
      await pool.query(`INSERT INTO accuracy_rechecks (cohort, mint, after_days, rugcheck_rugged, liquidity, price) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
        [d.cohort, d.mint, days, rug.ok && rug.report ? rug.report.rugged === true : null, m.liquidity, m.price]);
      later++;
      await pause(500);
    }
  }
  return { ...done, rechecked: later };
}

// The batch being filled: the newest one until it holds SAMPLE_GOAL real verdicts, then a new one named by today's date.
async function currentBatch(now = new Date()) {
  const counts = (await pool.query(`SELECT cohort, MIN(added_at) AS started, COUNT(*) FILTER (WHERE checked_at IS NOT NULL OR attempts < 3) AS n
    FROM accuracy_tokens WHERE cohort LIKE $1 GROUP BY cohort ORDER BY started DESC`, [`${SAMPLE_PREFIX}%`])).rows;
  if (!counts.length) return { cohort: SAMPLE_COHORT, have: 0 };
  if (Number(counts[0].n) < SAMPLE_GOAL) return { cohort: counts[0].cohort as string, have: Number(counts[0].n) };
  const name = `${SAMPLE_PREFIX}${now.toISOString().slice(0, 10)}`;
  return { cohort: counts.some((c) => c.cohort === name) ? `${name}-${counts.length + 1}` : name, have: 0 };
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

// How the batch looks LATER_CHECK_DAYS on: the same "lost most" rule, from the verdict-day numbers to the later reading.
function laterAnswers(checked: Row[], rechecks: Row[]) {
  return Object.fromEntries(LATER_CHECK_DAYS.map((days) => {
    const known = rechecks.filter((r) => r.after_days === days).map((r) => {
      const t = checked.find((c) => c.mint === r.mint);
      return t ? outcome({ rugcheck_rugged: r.rugcheck_rugged, liquidity_then: t.liquidity_then, liquidity_now: r.liquidity, price_then: t.price_then, price_now: r.price }).lostMost : null;
    }).filter((x) => x !== null);
    return [`after${days}Days`, { readAgain: rechecks.filter((r) => r.after_days === days).length, lostMost: rate(known.filter(Boolean).length, known.length) }];
  }));
}

export async function accuracyReport() {
  const rows: Row[] = (await pool.query(`SELECT * FROM accuracy_tokens ORDER BY cohort, added_at`)).rows;
  const rechecks: Row[] = (await pool.query(`SELECT * FROM accuracy_rechecks`)).rows;
  const cohorts: Record<string, any> = {};
  for (const name of [...new Set(rows.map((r) => r.cohort))]) {
    const all = rows.filter((r) => r.cohort === name);
    const checked = all.filter((r) => r.verdict);
    const good = checked.filter(knownGood);
    cohorts[name] = {
      tokens: all.length, checked: checked.length, errors: all.filter((r) => !r.checked_at && r.attempts >= 3).length,
      verdicts: Object.fromEntries(VERDICTS.map((v) => [v, checked.filter((r) => r.verdict === v).length])),
      foundIn: Object.fromEntries([...new Set(all.map((r) => r.found_in))].map((l) => [l, all.filter((r) => r.found_in === l).length])),
      ...(isSampled(name) ? { ...sampledAnswers(checked), laterChecks: laterAnswers(checked, rechecks.filter((r) => r.cohort === name)) } : {}),
      "4_knownGood": { tokens: good.length, calledSafe: rate(good.filter((r) => r.verdict === "SAFE").length, good.length), calledAvoid: rate(good.filter((r) => r.verdict === "AVOID").length, good.length) },
    };
  }
  return {
    about: `Sampled batches (young-tokens-*), each ${SAMPLE_GOAL} tokens; when one is full the next starts. Each batch: under ${YOUNG_DAYS} days old with at least $${MIN_LIQUIDITY_USD.toLocaleString("en-US")} of liquidity from Jupiter's activity lists, followed up after ${FOLLOW_UP_DAYS} days and read again after ${LATER_CHECK_DAYS.join(" and ")} days. Lost most = price or liquidity down 90%+, or RugCheck marks it rugged; unknown outcomes are left out. Known good = Jupiter-verified, not a stock, over $1M of liquidity, trading 90+ days. Tokens under a day old can't be SAFE (the age check warns), so for young tokens the question is whether AVOID separates the losers from the rest. With 100 tokens, a rate is good to about plus or minus 10 points.`,
    cohorts,
  };
}
