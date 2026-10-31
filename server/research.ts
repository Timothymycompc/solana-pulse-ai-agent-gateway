// What new tokens that did well, and new tokens that lost most, had in common when Pulse first checked them. Worked out
// again once a day (inside the accuracy tick on Cloud Scheduler) from everything collected so far, so it sharpens as the
// token watch and each new batch of 100 add finished tokens. Every run is kept, and every 7 days a weekly report says
// what changed since the week before.
//
// Fixed rules, written before looking (PRINCIPLES.md: measure, never assume):
//   - Lost most: the same rule as the accuracy test (accuracy.ts outcome()): price or liquidity down 90%+, or RugCheck
//     marks it rugged. A token Jupiter no longer lists counts as liquidity gone.
//   - Did well: a week later the price is at least DID_WELL_PRICE times the price at the check AND at least half the
//     liquidity is still there (so the price is real, not a thin pool).
//   - A pattern "holds up" only if tokens with it beat tokens without it by at least MIN_GAP_POINTS, in the older half
//     of the tokens AND again in the newer half, with at least MIN_PER_HALF tokens on each side in each half. Anything
//     else may be luck and is labelled that way. (Comparing with the average was too easy: on the real data a trait
//     nearly every token has "held up" for doing well and for losing most at once.)
// Missing data is left out, never filled in.
import { outcome } from "./accuracy";
import { pool } from "./db";
import type { Reading } from "./watch";

export const DID_WELL_PRICE = 2;
export const MIN_PER_HALF = 8;
export const MIN_GAP_POINTS = 10;
const DAY = 864e5;

export type Result = "did well" | "lost most" | "in between";
export type Sample = {
  mint: string; symbol: string | null; source: "first-week test" | "token watch"; checkedAt: string;
  checks: Record<string, string>; verdict: string | null; ageHours: number | null;
  liquidityThen: number | null; holdersThen: number | null; top10Then: number | null;
  priceThen: number; priceAfter: number; result: Result;
};

export function resultOf(r: { rugcheck_rugged: boolean | null; liquidity_then: number | null; liquidity_now: number | null; price_then: number | null; price_now: number | null }): Result | null {
  const lost = outcome(r).lostMost;
  if (lost === true) return "lost most";
  if (lost === null || !r.price_then || r.price_now === null || r.liquidity_then === null || r.liquidity_now === null) return null;
  return r.price_now >= r.price_then * DID_WELL_PRICE && r.liquidity_now >= r.liquidity_then * 0.5 ? "did well" : "in between";
}

// 95% Wilson interval, so small groups show how unsure they are.
export function interval(k: number, n: number): [number, number] {
  if (!n) return [0, 0];
  const z = 1.96, p = k / n, d = 1 + (z * z) / n;
  const mid = (p + (z * z) / (2 * n)) / d, half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, mid - half), Math.min(1, mid + half)];
}

// The yes/no traits each token had at its first check.
function traits(s: Sample): string[] {
  const t = Object.entries(s.checks).map(([name, result]) => `${name}: ${result}`);
  if (s.verdict) t.push(`verdict: ${s.verdict}`);
  if (s.ageHours !== null) t.push(`age at check: ${s.ageHours < 1 ? "under 1 hour" : s.ageHours < 24 ? "1 to 24 hours" : "1 day or more"}`);
  if (s.liquidityThen !== null) t.push(`liquidity at check: ${s.liquidityThen < 25_000 ? "under $25k" : s.liquidityThen < 100_000 ? "$25k to $100k" : "$100k or more"}`);
  if (s.holdersThen !== null) t.push(`holders at check: ${s.holdersThen < 500 ? "under 500" : s.holdersThen < 2_000 ? "500 to 2,000" : "2,000 or more"}`);
  if (s.top10Then !== null) t.push(`top 10 hold: ${s.top10Then < 20 ? "under 20%" : s.top10Then < 40 ? "20% to 40%" : "40% or more"}`);
  return t;
}

const pct = (k: number, n: number) => (n ? Math.round((k / n) * 1000) / 10 : null);

export function research(samples: Sample[], now = new Date()) {
  const sorted = [...samples].sort((a, b) => Date.parse(a.checkedAt) - Date.parse(b.checkedAt));
  const older = sorted.slice(0, Math.floor(sorted.length / 2)), newer = sorted.slice(Math.floor(sorted.length / 2));
  const count = (g: Sample[], r: Result) => g.filter((s) => s.result === r).length;
  const base = (g: Sample[], r: Result) => (g.length ? count(g, r) / g.length : 0);
  const names = [...new Set(sorted.flatMap(traits))].sort();
  const patterns = names.map((trait) => {
    const has = (g: Sample[]) => g.filter((s) => traits(s).includes(trait));
    const all = has(sorted), o = has(older), n = has(newer);
    const side = (r: Result) => {
      const [lo, hi] = interval(count(all, r), all.length);
      const beats = (g: Sample[], whole: Sample[]) => {
        const rest = whole.filter((x) => !g.includes(x));
        return g.length >= MIN_PER_HALF && rest.length >= MIN_PER_HALF && (base(g, r) - base(rest, r)) * 100 >= MIN_GAP_POINTS;
      };
      return {
        pct: pct(count(all, r), all.length), range: [Math.round(lo * 100), Math.round(hi * 100)],
        olderPct: pct(count(o, r), o.length), newerPct: pct(count(n, r), n.length),
        holdsUp: beats(o, older) && beats(n, newer),
      };
    };
    return { trait, tokens: all.length, olderTokens: o.length, newerTokens: n.length, didWell: side("did well"), lostMost: side("lost most") };
  }).filter((p) => p.tokens >= MIN_PER_HALF);
  const rank = (r: "didWell" | "lostMost") => patterns.filter((p) => p[r].holdsUp).sort((a, b) => (b[r].pct ?? 0) - (a[r].pct ?? 0)).map((p) => p.trait);
  return {
    ranAt: now.toISOString(),
    rules: {
      didWell: `A week after the check the price is at least ${DID_WELL_PRICE}x and at least half the liquidity is still there.`,
      lostMost: "Price or liquidity down 90% or more, or RugCheck marks it rugged (Jupiter no longer listing it counts as liquidity gone).",
      holdsUp: `Tokens with it beat tokens without it by at least ${MIN_GAP_POINTS} points in the older half of the tokens and again in the newer half, with at least ${MIN_PER_HALF} tokens on each side. Anything else may be luck.`,
    },
    tokens: sorted.length,
    bySource: { "first-week test": sorted.filter((s) => s.source === "first-week test").length, "token watch": sorted.filter((s) => s.source === "token watch").length },
    checkedFrom: sorted[0]?.checkedAt ?? null, checkedTo: sorted.at(-1)?.checkedAt ?? null,
    base: { didWell: pct(count(sorted, "did well"), sorted.length), lostMost: pct(count(sorted, "lost most"), sorted.length) },
    holdsUp: { didWell: rank("didWell"), lostMost: rank("lostMost") },
    patterns,
    didWell: sorted.filter((s) => s.result === "did well").map((s) => ({ mint: s.mint, symbol: s.symbol, source: s.source, checkedAt: s.checkedAt, times: Math.round((s.priceAfter / s.priceThen) * 10) / 10, ageHours: s.ageHours === null ? null : Math.round(s.ageHours), traits: traits(s) })),
  };
}

const hours = (from: string | Date | null, to: string | Date) => (from ? (new Date(to).getTime() - new Date(from).getTime()) / 3.6e6 : null);
const liquidityOf = (r: Reading) => (r.listed === false ? 0 : r.liquidity_usd);

// Every token with a known week-later result: the first-week test, and token-watch tokens that finished their week.
export async function loadSamples(): Promise<Sample[]> {
  const out: Sample[] = [];
  const tested = (await pool.query(`SELECT * FROM accuracy_tokens WHERE cohort LIKE 'young-tokens-%' AND followed_at IS NOT NULL AND checks IS NOT NULL`)).rows;
  for (const r of tested) {
    const result = resultOf(r);
    if (!result) continue;
    out.push({
      mint: r.mint, symbol: null, source: "first-week test", checkedAt: new Date(r.checked_at).toISOString(), checks: r.checks, verdict: r.verdict,
      ageHours: hours(r.first_pool_at, r.checked_at), liquidityThen: r.liquidity_then, holdersThen: null, top10Then: null,
      priceThen: r.price_then ?? 0, priceAfter: r.price_now ?? 0, result,
    });
  }
  const watched = (await pool.query(`SELECT * FROM token_watch WHERE watch_until < NOW() AND checks_then IS NOT NULL AND reading_then IS NOT NULL`)).rows;
  for (const w of watched) {
    // The week-later reading: the last one taken at least 6 days into the watch.
    const last = (await pool.query(`SELECT at, reading FROM token_watch_readings WHERE mint = $1 AND at >= $2 ORDER BY at DESC LIMIT 1`, [w.mint, new Date(new Date(w.added_at).getTime() + 6 * DAY)])).rows[0];
    if (!last) continue;
    const then: Reading = w.reading_then, later: Reading = last.reading;
    const result = resultOf({ rugcheck_rugged: null, liquidity_then: liquidityOf(then), liquidity_now: liquidityOf(later), price_then: then.usd_price, price_now: later.usd_price });
    if (!result) continue;
    out.push({
      mint: w.mint, symbol: w.symbol, source: "token watch", checkedAt: new Date(w.added_at).toISOString(), checks: w.checks_then, verdict: w.verdict_then,
      ageHours: hours(w.first_pool_at, w.added_at), liquidityThen: liquidityOf(then), holdersThen: then.holders, top10Then: then.top10_share_pct,
      priceThen: then.usd_price ?? 0, priceAfter: later.usd_price ?? 0, result,
    });
  }
  // A token in both sets counts once, from the first-week test (it was checked first).
  const seen = new Set<string>();
  return out.filter((s) => (seen.has(s.mint) ? false : (seen.add(s.mint), true)));
}

// Once a day: work it out again and keep the run.
export async function researchTick(now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  if ((await pool.query(`SELECT 1 FROM research_runs WHERE day = $1`, [day])).rowCount) return { ran: false };
  const result = research(await loadSamples(), now);
  await pool.query(`INSERT INTO research_runs (day, result) VALUES ($1, $2) ON CONFLICT (day) DO NOTHING`, [day, result]);
  return { ran: true, tokens: result.tokens };
}

// The newest run, plus a report for each week: one run every 7 days from the first, each saying what changed since the
// week before (tokens added, base rates, patterns that started or stopped holding up).
export function weekly(runs: { day: string; result: ReturnType<typeof research> }[]) {
  const sorted = [...runs].sort((a, b) => a.day.localeCompare(b.day));
  const first = sorted[0] ? Date.parse(sorted[0].day) : 0;
  const weeks = sorted.filter((r) => Math.round((Date.parse(r.day) - first) / DAY) % 7 === 0);
  return weeks.map((w, i) => {
    const prev = weeks[i - 1]?.result;
    const diff = (k: "didWell" | "lostMost") => ({
      startedHolding: w.result.holdsUp[k].filter((t) => !prev || !prev.holdsUp[k].includes(t)),
      stoppedHolding: prev ? prev.holdsUp[k].filter((t) => !w.result.holdsUp[k].includes(t)) : [],
    });
    return {
      week: i + 1, day: w.day, tokens: w.result.tokens, newTokens: w.result.tokens - (prev?.tokens ?? 0), base: w.result.base,
      holdsUp: w.result.holdsUp, didWell: diff("didWell"), lostMost: diff("lostMost"),
    };
  }).reverse();
}

export async function latestResearch() {
  const runs = (await pool.query(`SELECT day, result FROM research_runs ORDER BY day`)).rows
    .map((r: any) => ({ day: r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day), result: r.result }));
  if (!runs.length) return null;
  return { ...runs.at(-1)!.result, weeks: weekly(runs) };
}
