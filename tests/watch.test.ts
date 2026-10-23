// The token watch (watch.ts) against a real Postgres (PGlite, in memory): which tokens get watched, the readings,
// what counts as a change, and the track record numbers. Outside data is faked; the rules and arithmetic are tested.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { pool, ensureSchema } from "../server/db";
import { changes, startWatch, tokenHistory, watchRecord, watchTick, worthWatching, type Reading } from "../server/watch";
import { trackRecord } from "../server/track-record";
import { clearJupCache } from "../server/tools/lib";

const db = new PGlite();
before(async () => {
  (pool as any).query = async (sql: string, params?: unknown[]) => {
    const r = await db.query(sql, params as any[]);
    return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
  };
  await ensureSchema();
});

const base: Reading = { listed: true, liquidity_usd: 40_000, usd_price: 1, holders: 1_000, top10_share_pct: 30, who_can_mint: null, who_can_freeze: null };
const at = (h: number) => new Date(Date.UTC(2026, 9, 23, h)).toISOString();
const whats = (later: { at: string; r: Partial<Reading> }[]) => changes(base, later.map((x) => ({ at: x.at, r: { ...base, ...x.r } }))).map((c) => c.what);

test("changes: each line crossed is reported once, at the first reading that shows it", () => {
  assert.deepEqual(whats([{ at: at(2), r: {} }]), [], "nothing changed");
  assert.deepEqual(whats([{ at: at(2), r: { liquidity_usd: 20_000 } }, { at: at(4), r: { liquidity_usd: 19_000 } }]), ["liquidity_halved"]);
  assert.deepEqual(whats([{ at: at(2), r: { liquidity_usd: 20_000 } }, { at: at(4), r: { liquidity_usd: 3_000 } }]), ["liquidity_halved", "liquidity_pulled"]);
  assert.deepEqual(whats([{ at: at(2), r: { liquidity_usd: 4_000 } }]), ["liquidity_pulled"], "a pull straight away isn't also reported as halved");
  assert.deepEqual(whats([{ at: at(2), r: { listed: false, liquidity_usd: null } }]), ["liquidity_pulled"], "Jupiter answering without it = no market left");
  assert.deepEqual(whats([{ at: at(2), r: { listed: null, liquidity_usd: null, usd_price: null } }]), [], "no answer is never a change");
  assert.deepEqual(whats([{ at: at(2), r: { usd_price: 0.1 } }]), ["price_crashed"]);
  assert.deepEqual(whats([{ at: at(2), r: { usd_price: 0.11 } }]), []);
  assert.deepEqual(whats([{ at: at(2), r: { holders: 500, top10_share_pct: 45 } }]), ["holders_halved", "top10_up"]);
  assert.deepEqual(whats([{ at: at(2), r: { top10_share_pct: 44.9 } }]), []);
  assert.deepEqual(whats([{ at: at(2), r: { who_can_mint: undefined } }]), [], "chain not read: unknown, not revoked");
  const moved = changes({ ...base, who_can_freeze: "Old1" }, [{ at: at(2), r: { ...base, who_can_freeze: "New1" } }])[0];
  assert.equal(moved.what, "freeze_authority_moved");
  assert.match(moved.detail, /New1 can now freeze holders' tokens \(was Old1\)/);
  assert.equal(changes({ ...base, who_can_mint: "Old1" }, [{ at: at(2), r: base }])[0].what, "mint_authority_revoked");
  const pulled = changes(base, [{ at: at(2), r: { ...base, liquidity_usd: 1_200 } }])[0];
  assert.equal(pulled.detail, "Liquidity fell from $40,000 to $1,200 (-97%).");
  assert.equal(pulled.result, "fail");
});

const hoursAgo = (h: number) => new Date(Date.now() - h * 3.6e6).toISOString();
test("worthWatching: young mainnet tokens with a full check only", () => {
  const r = (first: string | null, checks: any[] = []) => ({ about: { first_traded: first }, checks });
  assert.equal(worthWatching(r(hoursAgo(5)), "mainnet-beta"), true);
  assert.equal(worthWatching(r(hoursAgo(5)), "devnet"), false);
  assert.equal(worthWatching(r(hoursAgo(24 * 4)), "mainnet-beta"), false, "4 days old");
  assert.equal(worthWatching(r(null), "mainnet-beta"), false, "age unknown");
  assert.equal(worthWatching(r(hoursAgo(5), [{ name: "known_stablecoin", result: "info" }]), "mainnet-beta"), false);
  assert.equal(worthWatching(r(hoursAgo(5), [{ name: "market_data", result: "warn" }]), "mainnet-beta"), false, "partial check");
});

const A = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAApump", B = "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBpump";
const OLD = "CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC";
const market: Record<string, any> = {
  [A]: { id: A, symbol: "AAA", liquidity: 40_000, usdPrice: 1, holderCount: 900, audit: { topHoldersPercentage: 31.04 }, firstPool: { createdAt: hoursAgo(5) } },
  [B]: { id: B, symbol: "BBB", liquidity: 25_000, usdPrice: 2, holderCount: 400, audit: { topHoldersPercentage: 40 }, firstPool: { createdAt: hoursAgo(30) } },
  [OLD]: { id: OLD, symbol: "OLD", liquidity: 5_000_000, usdPrice: 3, firstPool: { createdAt: hoursAgo(24 * 400) } },
};
let jupiterUp = true;
const authority: Record<string, string | null> = { [A]: null, [B]: "Mint1" };
const world = {
  retryDelayMs: 0,
  connection: () => ({
    getMultipleParsedAccounts: async (keys: any[]) => ({ value: keys.map((k) => ({ data: { parsed: { info: { mintAuthority: authority[k.toBase58()] ?? null, freezeAuthority: null } } } })) }),
  }),
  fetchJson: async (url: string) => {
  const search = url.match(/search\?query=([^&]+)/);
  if (search) {
    if (!jupiterUp) throw new Error("HTTP 429");
    return decodeURIComponent(search[1]).split(",").map((m) => market[m]).filter(Boolean);
  }
  if (url.includes("/tokens/v2/toptraded/1h")) return [market[A], market[OLD], market[B]];
  if (url.includes("/tokens/v2/")) return [];
  throw new Error(`unexpected ${url}`);
  },
} as any;
const about = (m: string) => ({ symbol: market[m].symbol, liquidity_usd: market[m].liquidity, usd_price: market[m].usdPrice, holders: market[m].holderCount,
  top10_share_pct: market[m].audit?.topHoldersPercentage, who_can_mint: authority[m] ?? null, who_can_freeze: null, first_traded: market[m].firstPool.createdAt });
const verdict = async (m: string) => ({ verdict: m === A ? "AVOID" : "CAUTION", about: about(m), checks: [{ name: "age", result: "warn" }] });

test("a tick watches new young tokens, reads them every 2 hours, and token_safety's history shows the pull", async () => {
  clearJupCache();
  assert.deepEqual(await watchTick(world, verdict), { added: 2, read: 0 }, "A and B; the 400-day-old token is skipped; nothing is due a reading yet");
  assert.deepEqual(await watchTick(world, verdict), { added: 0, read: 0 }, "already watched");
  const h0 = await tokenHistory(A);
  assert.equal(h0!.verdict_then, "AVOID");
  assert.equal(h0!.found_in, "new on Jupiter's activity lists");
  assert.equal(h0!.then.liquidity_usd, 40_000, "the first reading is what token_safety reported");
  assert.deepEqual(h0!.changes, []);
  assert.equal(await tokenHistory(OLD), null, "never watched");

  // 3 hours later A's liquidity is gone and B's mint authority moved to another wallet.
  await pool.query(`UPDATE token_watch SET added_at = NOW() - INTERVAL '3 hours'`);
  market[A] = { ...market[A], liquidity: 900, usdPrice: 0.02 };
  authority[B] = "Mint2";
  clearJupCache();
  assert.deepEqual(await watchTick(world, verdict), { added: 0, read: 2 }, "one batched read for both");
  assert.deepEqual(await watchTick(world, verdict), { added: 0, read: 0 }, "not due again for 2 hours");
  const h = await tokenHistory(A);
  assert.deepEqual(h!.changes.map((c) => c.what), ["liquidity_pulled", "price_crashed"]);
  assert.equal(h!.latest!.liquidity_usd, 900);
  assert.deepEqual((await tokenHistory(B))!.changes.map((c) => c.what), ["mint_authority_moved"]);

  // Jupiter down: the chain reading is still stored, with the market numbers unknown (and no change claimed from them).
  await pool.query(`UPDATE token_watch_readings SET at = at - INTERVAL '3 hours'`);
  jupiterUp = false;
  clearJupCache();
  assert.deepEqual(await watchTick(world, verdict), { added: 0, read: 2 });
  assert.equal((await tokenHistory(B))!.latest!.listed, null);
  jupiterUp = true;
});

test("the track record counts a token only once it was watched for the whole period", async () => {
  let r = await watchRecord();
  assert.equal(r.watchingNow, 2);
  assert.deepEqual(r.byVerdict.AVOID, { watched: 1, withinADay: { tokens: 0, liquidityPulled: 0 }, withinAWeek: { tokens: 0, liquidityPulled: 0 } }, "watched for 3 hours: too early to count");
  assert.equal(r.recent[0].symbol, "BBB", "newest first");
  assert.ok(r.recent.some((x) => x.mint === A && x.what === "liquidity_pulled" && x.hoursAfterFirstCheck === 0 && x.verdictThen === "AVOID"));

  await pool.query(`UPDATE token_watch SET added_at = added_at - INTERVAL '2 days'`);
  r = await watchRecord();
  assert.deepEqual(r.byVerdict.AVOID.withinADay, { tokens: 1, liquidityPulled: 0 }, "the pull came 2 days after the first check, not within a day");
  await pool.query(`UPDATE token_watch_readings SET at = at - INTERVAL '2 days'`);
  r = await watchRecord();
  assert.deepEqual(r.byVerdict.AVOID.withinADay, { tokens: 1, liquidityPulled: 1 });
  assert.deepEqual(r.byVerdict.CAUTION.withinADay, { tokens: 1, liquidityPulled: 0 });

  const t = await trackRecord();
  assert.equal(t.watch.watchingNow, 2);
  assert.equal(t.youngTokens, null, "no accuracy data in this database");
});

test("tokens people check are watched, up to the daily cap", async () => {
  const C = "EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEpump";
  assert.equal(await startWatch(C, { verdict: "CAUTION", checks: [], about: { liquidity_usd: 12_000 } }, "checked by a caller"), true);
  assert.equal(await startWatch(C, { verdict: "CAUTION", checks: [], about: {} }, "checked by a caller"), false, "already watched");
  assert.equal((await tokenHistory(C))!.found_in, "checked by a caller");
});
