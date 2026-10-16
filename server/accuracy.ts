// Measures token_safety against what really happened, so its accuracy is measured instead of assumed (PRINCIPLES.md).
// It runs on Google Cloud, not on anyone's computer: Cloud Scheduler calls POST /api/owner/accuracy/tick every
// 10 minutes (scripts/accuracy-setup.sh), and each tick does a small, bounded amount of work:
//   1. Sample: until SAMPLE_GOAL are recorded, take tokens from Jupiter's newest list that have at least
//      MIN_LIQUIDITY_USD of liquidity (below that the liquidity rule alone decides, which would flatter the result),
//      and record token_safety's verdict with the liquidity and price at that moment.
//   2. Queue: tokens added by hand (POST /api/owner/accuracy/add, e.g. re-running an audit) get a verdict.
//   3. Follow up: FOLLOW_UP_DAYS after a sampled token's verdict, record whether it rugged.
// Rugged means RugCheck marks it rugged, or its liquidity fell by 90% or more (a token Jupiter no longer lists while
// Jupiter is answering counts as no liquidity left). When neither source answers, the
// outcome is unknown and left out of the rates; nothing is guessed. GET /api/owner/accuracy shows the results.
import { pool } from "./db";
import { jupiterHost, jupLookup, rugReport } from "./tools/lib";
import type { ToolContext } from "./tools/types";

export const SAMPLE_COHORT = "new-tokens-2026-10";
export const SAMPLE_GOAL = 100;
export const MIN_LIQUIDITY_USD = 10_000;
export const FOLLOW_UP_DAYS = 7;
const PER_TICK = { sample: 3, queue: 15, followUp: 15 };
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Verdict = (mint: string) => Promise<{ verdict: string; checks: { name: string; result: string }[] }>;

// Rugged from the two sources; null when neither can say.
export function ruggedOutcome(o: { rugcheckRugged: boolean | null; liquidityThen: number | null; liquidityNow: number | null }): boolean | null {
  if (o.rugcheckRugged === true) return true;
  const liquidityKnown = o.liquidityNow !== null && o.liquidityThen !== null && o.liquidityThen > 0;
  if (liquidityKnown && o.liquidityNow! <= o.liquidityThen! * 0.1) return true;
  if (liquidityKnown || o.rugcheckRugged === false) return false;
  return null;
}

async function market(ctx: ToolContext, mint: string) {
  const { tokens, ok } = await jupLookup(ctx, mint);
  const j = tokens.find((t) => t.id === mint);
  // Not found while Jupiter answered: no pools left, so no liquidity. Jupiter down: unknown.
  return { ok, liquidity: j ? (j.liquidity ?? null) : ok ? 0 : null, price: j?.usdPrice ?? null, verified: j ? j.isVerified === true : null };
}

async function check(ctx: ToolContext, verdict: Verdict, cohort: string, mint: string, followUp: boolean) {
  try {
    const r = await verdict(mint);
    const m = await market(ctx, mint);
    await pool.query(
      `UPDATE accuracy_tokens SET checked_at = NOW(), verdict = $3, failed_checks = $4, warned_checks = $5, verified = $6,
         liquidity_then = $7, price_then = $8, follow_up_due = $9, error = NULL WHERE cohort = $1 AND mint = $2`,
      [cohort, mint, r.verdict, r.checks.filter((c) => c.result === "fail").map((c) => c.name), r.checks.filter((c) => c.result === "warn").map((c) => c.name),
        m.verified, m.liquidity, m.price, followUp ? new Date(Date.now() + FOLLOW_UP_DAYS * 864e5) : null]);
  } catch (error: any) {
    await pool.query(`UPDATE accuracy_tokens SET error = $3, attempts = attempts + 1 WHERE cohort = $1 AND mint = $2`, [cohort, mint, String(error?.message ?? error).slice(0, 300)]);
  }
}

export async function addToQueue(cohort: string, mints: string[]): Promise<number> {
  const clean = [...new Set(mints.map(String).filter((m) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(m)))];
  for (const mint of clean) await pool.query(`INSERT INTO accuracy_tokens (cohort, mint) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [cohort, mint]);
  return clean.length;
}

export async function accuracyTick(ctx: ToolContext, verdict: Verdict) {
  const done = { sampled: 0, checked: 0, followedUp: 0 };
  // 1. Sample new tokens.
  const have = Number((await pool.query(`SELECT COUNT(*) AS n FROM accuracy_tokens WHERE cohort = $1`, [SAMPLE_COHORT])).rows[0].n);
  if (have < SAMPLE_GOAL) {
    const recent: any[] = await ctx.fetchJson(`${jupiterHost()}/tokens/v2/recent`, 8000).catch(() => []);
    for (const t of (Array.isArray(recent) ? recent : []).filter((t) => (t.liquidity ?? 0) >= MIN_LIQUIDITY_USD)) {
      if (done.sampled >= Math.min(PER_TICK.sample, SAMPLE_GOAL - have)) break;
      const added = await pool.query(`INSERT INTO accuracy_tokens (cohort, mint) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [SAMPLE_COHORT, t.id]);
      if (!added.rowCount) continue;
      await check(ctx, verdict, SAMPLE_COHORT, t.id, true);
      done.sampled++;
      await pause(500);
    }
  }
  // 2. Tokens queued by hand, and sampled ones whose check failed, oldest first. A token gets 3 tries, then stays an error.
  const queued = (await pool.query(`SELECT cohort, mint FROM accuracy_tokens WHERE checked_at IS NULL AND attempts < 3 ORDER BY added_at LIMIT $1`, [PER_TICK.queue])).rows;
  for (const q of queued) { await check(ctx, verdict, q.cohort, q.mint, q.cohort === SAMPLE_COHORT); done.checked++; await pause(500); }
  // 3. Follow-ups that are due.
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

export async function accuracyReport() {
  const rows = (await pool.query(`SELECT * FROM accuracy_tokens ORDER BY cohort, added_at`)).rows;
  const cohorts: Record<string, any> = {};
  for (const r of rows) {
    const c = (cohorts[r.cohort] ??= { tokens: 0, checked: 0, errors: 0, verdicts: {}, followedUp: 0, outcomes: { rugged: {}, notRugged: {}, unknown: 0 }, priceDown90: {} });
    c.tokens++;
    if (r.error && !r.checked_at) c.errors++;
    if (!r.verdict) continue;
    c.checked++;
    c.verdicts[r.verdict] = (c.verdicts[r.verdict] ?? 0) + 1;
    if (!r.followed_at) continue;
    c.followedUp++;
    const rugged = ruggedOutcome({ rugcheckRugged: r.rugcheck_rugged, liquidityThen: r.liquidity_then, liquidityNow: r.liquidity_now });
    if (rugged === null) { c.outcomes.unknown++; continue; }
    const bucket = rugged ? c.outcomes.rugged : c.outcomes.notRugged;
    bucket[r.verdict] = (bucket[r.verdict] ?? 0) + 1;
    if (r.price_then > 0 && r.price_now !== null && r.price_now <= r.price_then * 0.1) c.priceDown90[r.verdict] = (c.priceDown90[r.verdict] ?? 0) + 1;
  }
  const rate = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}% (${part} of ${whole})` : "no data yet");
  for (const c of Object.values(cohorts)) {
    const sum = (o: Record<string, number>) => Object.values(o).reduce((a, n) => a + n, 0);
    const rug = c.outcomes.rugged, ok = c.outcomes.notRugged;
    c.caughtAsAvoid = rate(rug.AVOID ?? 0, sum(rug));
    c.caughtAsAvoidOrCaution = rate((rug.AVOID ?? 0) + (rug.CAUTION ?? 0), sum(rug));
    c.ruggedButSafe = rate(rug.SAFE ?? 0, sum(rug));
    c.avoidButDidNotRug = rate(ok.AVOID ?? 0, sum(ok));
  }
  return {
    about: `Sampled cohort ${SAMPLE_COHORT}: ${SAMPLE_GOAL} new tokens with at least $${MIN_LIQUIDITY_USD.toLocaleString("en-US")} liquidity, followed up after ${FOLLOW_UP_DAYS} days. Rugged = RugCheck marks it rugged or its liquidity fell 90% or more (no longer listed by Jupiter counts as none left); unknown outcomes are left out. "Did not rug in a week" doesn't make a token good, so avoidButDidNotRug is an upper bound on false alarms.`,
    cohorts,
  };
}
