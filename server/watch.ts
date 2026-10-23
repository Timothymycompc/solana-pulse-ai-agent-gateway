// Token watch: Pulse keeps re-checking young tokens after it first checks them, so token_safety can say what changed
// since (liquidity pulled, price crashed, mint or freeze power moved) instead of giving a one-time snapshot.
// Two ways in:
//   - Sampled: up to NEW_PER_DAY young, liquid tokens a day from Jupiter's activity lists (the same lists the accuracy
//     test samples), checked with token_safety when added.
//   - Checked by a caller: any token under YOUNG_DAYS old that someone runs token_safety on (up to CALLER_PER_DAY a day).
// Every SNAP_EVERY_HOURS for WATCH_DAYS, one batched Jupiter lookup and one batched on-chain read record each watched
// token's liquidity, price, holders, top-10 share and mint and freeze authority. Nothing is guessed: a value no source
// answered is stored as null, and a change is only reported between two real readings.
// It runs inside the accuracy tick (Cloud Scheduler, every 10 minutes), so it needs no schedule of its own.
import { PublicKey } from "@solana/web3.js";
import { pool } from "./db";
import { sampleCandidates, YOUNG_DAYS } from "./accuracy";
import { jupLookup, type JupToken } from "./tools/lib";
import type { ToolContext } from "./tools/types";

export const WATCH_DAYS = 7;
export const SNAP_EVERY_HOURS = 2;
export const NEW_PER_DAY = 10; // Tim asked for "around 10 new coins"
export const CALLER_PER_DAY = 50;
const PER_TICK = { sample: 2, snap: 100 };
const DAY = 864e5;

// One reading of a token. null means no source answered; listed false means Jupiter answered and no longer lists it.
export type Reading = {
  listed: boolean | null; liquidity_usd: number | null; usd_price: number | null; holders: number | null;
  top10_share_pct: number | null; who_can_mint: string | null | undefined; who_can_freeze: string | null | undefined;
};
// who_can_mint / who_can_freeze: a wallet, null when revoked, undefined when the chain couldn't be read.

export type Change = { at: string; what: string; result: "fail" | "warn" | "info"; detail: string; source: "jupiter" | "on-chain" };

type Verdict = (mint: string) => Promise<{ verdict: string; summary?: string; about?: any; checks: { name: string; result: string }[] }>;

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const pct = (now: number, then: number) => `${Math.round(((now - then) / then) * 100)}%`;
const round1 = (n: number | null | undefined) => (typeof n === "number" ? Math.round(n * 10) / 10 : null);

// The reading token_safety's own answer holds, so the first reading is exactly what the caller was told.
export function readingFromVerdict(about: any): Reading {
  return {
    listed: typeof about?.liquidity_usd === "number" ? true : null, liquidity_usd: about?.liquidity_usd ?? null, usd_price: about?.usd_price ?? null,
    holders: about?.holders ?? null, top10_share_pct: about?.top10_share_pct ?? null, who_can_mint: about?.who_can_mint ?? null, who_can_freeze: about?.who_can_freeze ?? null,
  };
}

// What changed between the first reading and the later ones, each change reported once, at the first reading that
// shows it. Every threshold is tied to how people lose money on new tokens:
//   - Liquidity down 90%+ (or no longer listed by Jupiter while Jupiter answers): the liquidity was pulled, the classic
//     rug (LIBRA, Feb 2025, within hours). Down 50%+ is a warning: the exit is getting thin.
//   - Price down 90%+: a dump; the accuracy test counts it as buyers losing most of their money.
//   - Mint or freeze authority moved to another wallet: someone new can print or freeze. Revoked is good news (info).
//   - Holders halved, or the top 10's share up 15+ points: holders leaving, or supply gathering in a few wallets that
//     can dump it.
export function changes(then: Reading, later: { at: string; r: Reading }[]): Change[] {
  const out: Change[] = [];
  const seen = new Set<string>();
  const once = (c: Change) => { if (!seen.has(c.what)) { seen.add(c.what); out.push(c); } };
  for (const { at, r } of later) {
    const liqNow = r.listed === false ? 0 : r.liquidity_usd;
    if (then.liquidity_usd && then.liquidity_usd > 0 && liqNow !== null) {
      const gone = r.listed === false ? " Jupiter no longer lists it, so there is no market to sell into." : "";
      if (liqNow <= then.liquidity_usd * 0.1) { seen.add("liquidity_halved"); once({ at, what: "liquidity_pulled", result: "fail", detail: `Liquidity fell from ${usd(then.liquidity_usd)} to ${usd(liqNow)} (${liqNow === 0 ? "-100%" : pct(liqNow, then.liquidity_usd)}).${gone}`, source: "jupiter" }); }
      else if (liqNow <= then.liquidity_usd * 0.5) once({ at, what: "liquidity_halved", result: "warn", detail: `Liquidity fell from ${usd(then.liquidity_usd)} to ${usd(liqNow)} (${pct(liqNow, then.liquidity_usd)}).`, source: "jupiter" });
    }
    if (then.usd_price && then.usd_price > 0 && typeof r.usd_price === "number" && r.usd_price <= then.usd_price * 0.1) {
      once({ at, what: "price_crashed", result: "fail", detail: `Price fell ${Math.round((1 - r.usd_price / then.usd_price) * 100)}% from when Pulse first checked it.`, source: "jupiter" });
    }
    for (const [key, label, verb] of [["who_can_mint", "mint_authority", "mint new tokens"], ["who_can_freeze", "freeze_authority", "freeze holders' tokens"]] as const) {
      const a = then[key], b = r[key];
      if (a === undefined || b === undefined || a === b) continue;
      if (b === null) once({ at, what: `${label}_revoked`, result: "info", detail: `The ${label.replace("_", " ")} was revoked: nobody can ${verb} any more.`, source: "on-chain" });
      else once({ at, what: `${label}_moved`, result: "warn", detail: `${b} can now ${verb}${a ? ` (was ${a})` : " (it was revoked before)"}.`, source: "on-chain" });
    }
    if (then.holders && typeof r.holders === "number" && r.holders <= then.holders * 0.5) {
      once({ at, what: "holders_halved", result: "warn", detail: `Holders fell from ${then.holders.toLocaleString("en-US")} to ${r.holders.toLocaleString("en-US")}.`, source: "jupiter" });
    }
    if (typeof then.top10_share_pct === "number" && typeof r.top10_share_pct === "number" && r.top10_share_pct - then.top10_share_pct >= 15) {
      once({ at, what: "top10_up", result: "warn", detail: `The 10 biggest holders went from ${then.top10_share_pct}% to ${r.top10_share_pct}% of supply.`, source: "jupiter" });
    }
  }
  return out;
}

const watchedToday = async (foundIn: string) =>
  Number((await pool.query(`SELECT COUNT(*) AS n FROM token_watch WHERE found_in = $1 AND added_at > NOW() - INTERVAL '1 day'`, [foundIn])).rows[0].n);

// Starts watching a token from a token_safety answer. Returns false when it's already watched or today's cap is used.
export async function startWatch(mint: string, result: { verdict: string; checks: { name: string; result: string }[]; about?: any }, foundIn: string): Promise<boolean> {
  if (foundIn === "checked by a caller" && (await watchedToday(foundIn)) >= CALLER_PER_DAY) return false;
  const added = await pool.query(
    `INSERT INTO token_watch (mint, symbol, found_in, watch_until, first_pool_at, verdict_then, checks_then, reading_then)
     VALUES ($1, $2, $3, NOW() + INTERVAL '${WATCH_DAYS} days', $4, $5, $6, $7) ON CONFLICT DO NOTHING`,
    [mint, result.about?.symbol ?? null, foundIn, result.about?.first_traded ?? null, result.verdict,
      JSON.stringify(Object.fromEntries(result.checks.map((c) => [c.name, c.result]))), JSON.stringify(readingFromVerdict(result.about))]);
  return Boolean(added.rowCount);
}

// A token someone just checked is watched when it's young: that's when liquidity gets pulled. Stablecoins and old
// tokens aren't.
export function worthWatching(result: any, network: string): boolean {
  const first = result?.about?.first_traded;
  if (network !== "mainnet-beta" || !first || result?.checks?.some((c: any) => c.name === "known_stablecoin")) return false;
  if (result?.checks?.some((c: any) => ["market_data", "rugcheck_data"].includes(c.name) && c.result === "warn")) return false;
  return (Date.now() - Date.parse(first)) / DAY < YOUNG_DAYS;
}

// The latest readings for many tokens: one Jupiter lookup and one on-chain read per 100 tokens.
export async function readMany(ctx: ToolContext, mints: string[]): Promise<Map<string, Reading>> {
  const out = new Map<string, Reading>();
  for (let i = 0; i < mints.length; i += 100) {
    const batch = mints.slice(i, i + 100);
    const [jup, chain] = await Promise.all([
      jupLookup(ctx, batch.join(",")),
      ctx.connection("mainnet-beta").getMultipleParsedAccounts(batch.map((m) => new PublicKey(m)), { commitment: "confirmed" }).catch(() => null),
    ]);
    const byMint = new Map<string, JupToken>(jup.tokens.filter((t) => batch.includes(t.id)).map((t) => [t.id, t]));
    batch.forEach((mint, k) => {
      const j = byMint.get(mint);
      const info: any = (chain?.value?.[k]?.data as any)?.parsed?.info;
      out.set(mint, {
        listed: jup.ok ? Boolean(j) : null, liquidity_usd: typeof j?.liquidity === "number" ? Math.round(j.liquidity) : null,
        usd_price: j?.usdPrice ?? null, holders: j?.holderCount ?? null, top10_share_pct: round1(j?.audit?.topHoldersPercentage),
        who_can_mint: info ? info.mintAuthority ?? null : undefined, who_can_freeze: info ? info.freezeAuthority ?? null : undefined,
      });
    });
  }
  return out;
}

const PARTIAL = ["market_data", "rugcheck_data"];

export async function watchTick(ctx: ToolContext, verdict: Verdict) {
  const done = { added: 0, read: 0 };
  // 1. New tokens, spread over the day (a few per tick until today's NEW_PER_DAY are in).
  const room = Math.min(PER_TICK.sample, NEW_PER_DAY - (await watchedToday("new on Jupiter's activity lists")));
  if (room > 0) {
    const watched = new Set((await pool.query(`SELECT mint FROM token_watch`)).rows.map((r: any) => r.mint));
    for (const { token } of await sampleCandidates(ctx)) {
      if (done.added >= room) break;
      if (watched.has(token.id)) continue;
      try {
        const r = await verdict(token.id);
        if (r.checks.some((c) => PARTIAL.includes(c.name) && c.result === "warn")) continue; // partial: try another
        if (await startWatch(token.id, r, "new on Jupiter's activity lists")) done.added++;
      } catch (error: any) { console.warn(`watch: ${token.id} not added:`, error?.message ?? error); }
    }
  }
  // 2. Readings for every watched token that is due one.
  const due = (await pool.query(
    `SELECT w.mint FROM token_watch w WHERE w.watch_until > NOW() AND COALESCE((SELECT MAX(at) FROM token_watch_readings s WHERE s.mint = w.mint), w.added_at)
       <= NOW() - INTERVAL '${SNAP_EVERY_HOURS} hours' ORDER BY w.added_at LIMIT $1`, [PER_TICK.snap])).rows.map((r: any) => r.mint);
  if (due.length) {
    const readings = await readMany(ctx, due);
    for (const [mint, r] of readings) {
      if (r.listed === null && r.who_can_mint === undefined) continue; // no source answered: try again next tick
      await pool.query(`INSERT INTO token_watch_readings (mint, at, reading) VALUES ($1, NOW(), $2) ON CONFLICT DO NOTHING`, [mint, JSON.stringify(r)]);
      done.read++;
    }
  }
  return done;
}

type WatchRow = { mint: string; symbol: string | null; found_in: string; added_at: Date; watch_until: Date; verdict_then: string; reading_then: Reading };
const iso = (d: Date | string) => new Date(d).toISOString();

function historyOf(w: WatchRow, readings: { at: Date; reading: Reading }[]) {
  const later = readings.map((s) => ({ at: iso(s.at), r: s.reading }));
  const last = later.at(-1);
  return {
    watched_since: iso(w.added_at),
    found_in: w.found_in,
    verdict_then: w.verdict_then,
    watching_until: iso(w.watch_until),
    readings: later.length,
    then: w.reading_then,
    latest: last ? { at: last.at, ...last.r } : null,
    changes: changes(w.reading_then, later),
  };
}

// The watch history token_safety adds to its answer, or null when Pulse hasn't watched this token.
export async function tokenHistory(mint: string) {
  const w: WatchRow | undefined = (await pool.query(`SELECT * FROM token_watch WHERE mint = $1`, [mint])).rows[0];
  if (!w) return null;
  const readings = (await pool.query(`SELECT at, reading FROM token_watch_readings WHERE mint = $1 ORDER BY at`, [mint])).rows;
  return historyOf(w, readings);
}

// The public numbers for the track record page: what happened to the tokens Pulse watched, by the verdict it gave
// when it first checked them. Only tokens watched for at least a day count toward the "within a day" rate, and only
// finished watches toward the "within a week" rate, so a token still being watched never counts as "nothing happened".
export async function watchRecord() {
  const rows: WatchRow[] = (await pool.query(`SELECT * FROM token_watch WHERE added_at > NOW() - INTERVAL '90 days' ORDER BY added_at`)).rows;
  const all = (await pool.query(`SELECT mint, at, reading FROM token_watch_readings WHERE mint = ANY($1) ORDER BY at`, [rows.map((r) => r.mint)])).rows;
  const byMint = new Map<string, { at: Date; reading: Reading }[]>();
  for (const s of all) (byMint.get(s.mint) ?? byMint.set(s.mint, []).get(s.mint)!).push(s);
  const now = Date.now();
  const items = rows.map((w) => ({ w, h: historyOf(w, byMint.get(w.mint) ?? []) }));
  const pulledWithin = (x: (typeof items)[number], days: number) =>
    x.h.changes.some((c) => c.what === "liquidity_pulled" && Date.parse(c.at) - new Date(x.w.added_at).getTime() <= days * DAY);
  const rate = (group: typeof items, days: number) => {
    const eligible = group.filter((x) => now - new Date(x.w.added_at).getTime() >= days * DAY && x.h.readings > 0);
    return { tokens: eligible.length, liquidityPulled: eligible.filter((x) => pulledWithin(x, days)).length };
  };
  const byVerdict = Object.fromEntries(["AVOID", "CAUTION", "SAFE"].map((v) => {
    const g = items.filter((x) => x.w.verdict_then === v);
    return [v, { watched: g.length, withinADay: rate(g, 1), withinAWeek: rate(g, WATCH_DAYS) }];
  }));
  const recent = items.flatMap((x) => x.h.changes.filter((c) => c.result !== "info").map((c) => ({
    mint: x.w.mint, symbol: x.w.symbol, verdictThen: x.w.verdict_then, foundIn: x.w.found_in,
    hoursAfterFirstCheck: Math.round((Date.parse(c.at) - new Date(x.w.added_at).getTime()) / 3.6e6), ...c,
  }))).sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 12);
  return {
    watchingNow: rows.filter((r) => new Date(r.watch_until).getTime() > now).length,
    watched90d: rows.length,
    readings90d: all.length,
    byVerdict,
    recent,
  };
}
