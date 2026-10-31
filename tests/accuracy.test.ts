// The accuracy test (accuracy.ts) against a real Postgres (PGlite, in memory): sampling young tokens, following them
// up a week later, and the answers it reports. Outside data is faked here; the sampling rules, the meaning of "lost
// most" and the arithmetic of the answers are what's tested.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pool, ensureSchema } from "../server/db";
import { accuracyReport, accuracyTick, addToQueue, knownGood, outcome, SAMPLE_COHORT } from "../server/accuracy";
import { clearJupCache } from "../server/tools/lib";

const db = new PGlite();
before(async () => {
  (pool as any).query = async (sql: string, params?: unknown[]) => {
    const r = await db.query(sql, params as any[]);
    return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
  };
  await ensureSchema();
});

const o = (p: Partial<Parameters<typeof outcome>[0]>) => outcome({ rugcheck_rugged: null, liquidity_then: 50_000, liquidity_now: 50_000, price_then: 1, price_now: 1, ...p }).lostMost;
test("lost most: price or liquidity down 90%+, or RugCheck says rugged; unknown when no source answers", () => {
  assert.equal(o({}), false);
  assert.equal(o({ price_now: 0.1 }), true, "exactly 90% down");
  assert.equal(o({ price_now: 0.11 }), false);
  assert.equal(o({ liquidity_now: 0 }), true, "no longer listed: no liquidity");
  assert.equal(o({ rugcheck_rugged: true }), true);
  assert.equal(o({ liquidity_now: null, price_now: null }), null, "never guessed");
  assert.equal(o({ liquidity_now: null, price_now: null, rugcheck_rugged: false }), null, "RugCheck's 'not rugged' alone doesn't show a buyer kept their money");
});

const hoursAgo = (h: number) => new Date(Date.now() - h * 3.6e6).toISOString();
const A = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAApump", B = "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBpump";
const OLD = "CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC", TINY = "DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDpump";
const listed: Record<string, any> = {
  [A]: { id: A, liquidity: 40_000, usdPrice: 1, firstPool: { createdAt: hoursAgo(5) } },
  [B]: { id: B, liquidity: 25_000, usdPrice: 2, firstPool: { createdAt: hoursAgo(30) } },
  [OLD]: { id: OLD, liquidity: 5_000_000, usdPrice: 3, firstPool: { createdAt: hoursAgo(24 * 400) }, isVerified: true, tags: ["verified"] },
  [TINY]: { id: TINY, liquidity: 900, usdPrice: 1, firstPool: { createdAt: hoursAgo(1) } },
};
const rugged: Record<string, boolean> = {};
const world = {
  connection: () => { throw new Error("no RPC needed"); },
  retryDelayMs: 0,
  fetchJson: async (url: string) => {
    if (url.includes("/tokens/v2/toptraded/1h")) return [listed[A], listed[OLD], listed[TINY]];
    if (url.includes("/tokens/v2/toporganicscore/1h")) return [listed[B], listed[A]];
    if (url.includes("/tokens/v2/toptrending/5m")) return [];
    const search = url.match(/search\?query=(\w+)/);
    if (search) return listed[search[1]] ? [{ symbol: "X", name: "X", decimals: 6, ...listed[search[1]] }] : [];
    const rug = url.match(/tokens\/(\w+)\/report/);
    if (rug) return { rugged: rugged[rug[1]] ?? false };
    throw new Error(`unexpected ${url}`);
  },
} as any;
const fakeVerdict = async (mint: string) => mint === A
  ? { verdict: "AVOID", checks: [{ name: "liquidity_pull", result: "fail" }, { name: "age", result: "warn" }] }
  : { verdict: mint === OLD ? "SAFE" : "CAUTION", checks: [{ name: "liquidity_pull", result: "pass" }, { name: "age", result: mint === OLD ? "pass" : "warn" }] };

test("a tick samples young tokens with enough liquidity, and a week later answers the questions", async () => {
  clearJupCache();
  const first = await accuracyTick(world, fakeVerdict);
  assert.equal(first.sampled, 2, "the 400-day-old token and the $900 one are skipped");
  assert.equal((await accuracyTick(world, fakeVerdict)).sampled, 0, "the same tokens aren't sampled twice");
  const rows = (await pool.query(`SELECT mint, found_in, checks FROM accuracy_tokens WHERE cohort = $1 ORDER BY mint`, [SAMPLE_COHORT])).rows;
  assert.deepEqual(rows.map((r: any) => r.found_in).sort(), ["toporganicscore/1h", "toptraded/1h"], "the lists take turns");
  assert.deepEqual(rows[0].checks, { liquidity_pull: "fail", age: "warn" }, "every check's result is kept");

  // A week passes: A's price fell 95% (the AVOID was right); B held up (the CAUTION was fine).
  await pool.query(`UPDATE accuracy_tokens SET follow_up_due = NOW() - INTERVAL '1 minute'`);
  clearJupCache();
  listed[A] = { ...listed[A], usdPrice: 0.05 };
  assert.equal((await accuracyTick(world, fakeVerdict)).followedUp, 2);

  const c = (await accuracyReport()).cohorts[SAMPLE_COHORT];
  assert.deepEqual(c["1_lostMostByVerdict"], { AVOID: "100% (1 of 1)", CAUTION: "0% (0 of 1)", SAFE: "no data yet" });
  assert.equal(c["2_ofTokensThatLostMost"].calledAvoid, "100% (1 of 1)");
  assert.equal(c["2_ofTokensThatLostMost"].calledSafe, "0% (0 of 1)");
  const pull = c["3_byCheck"].find((x: any) => x.check === "liquidity_pull");
  assert.deepEqual(pull, { check: "liquidity_pull", lostMostWhenFlagged: "100% (1 of 1)", lostMostWhenPassed: "0% (0 of 1)" });
  assert.equal(c.howTheyLostIt.priceDown90, 1);
});

test("queued tokens get a verdict and no follow-up; known-good tokens' SAFE rate is reported; a failing check gives up after 3 tries", async () => {
  clearJupCache();
  assert.equal(await addToQueue("rerun", [OLD, "not-an-address", OLD]), 1);
  const broken = "EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEpump";
  await addToQueue("rerun", [broken]);
  const verdict = async (mint: string) => { if (mint === broken) throw new Error("RPC down"); return fakeVerdict(mint); };
  for (let i = 0; i < 4; i++) await accuracyTick(world, verdict);
  const row = (await pool.query(`SELECT * FROM accuracy_tokens WHERE cohort = 'rerun' AND mint = $1`, [OLD])).rows[0];
  assert.equal(row.verdict, "SAFE");
  assert.equal(row.follow_up_due, null);
  assert.ok(knownGood(row));
  const r = (await accuracyReport()).cohorts.rerun;
  assert.equal(r["4_knownGood"].calledSafe, "100% (1 of 1)");
  assert.equal(r.errors, 1);
  assert.equal((await pool.query(`SELECT attempts FROM accuracy_tokens WHERE mint = $1`, [broken])).rows[0].attempts, 3);
});

test("known good leaves out stocks, thin liquidity and young tokens", () => {
  const base = { verified: true, tags: ["verified"], liquidity_then: 2e6, first_pool_at: "2025-01-01T00:00:00Z", checked_at: "2026-10-16T00:00:00Z" };
  assert.ok(knownGood(base));
  assert.ok(!knownGood({ ...base, tags: ["verified", "stocks"] }));
  assert.ok(!knownGood({ ...base, liquidity_then: 500_000 }));
  assert.ok(!knownGood({ ...base, first_pool_at: "2026-09-01T00:00:00Z" }));
  assert.ok(!knownGood({ ...base, verified: false }));
});

test("a partial verdict (market data unavailable) is retried, not counted", async () => {
  clearJupCache();
  const P = "PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPpump";
  await addToQueue("partial", [P]);
  let jupiterDown = true;
  const verdict = async () => ({ verdict: jupiterDown ? "CAUTION" : "AVOID", checks: [{ name: jupiterDown ? "market_data" : "liquidity", result: jupiterDown ? "warn" : "fail" }] });
  await accuracyTick(world, verdict);
  let row = (await pool.query(`SELECT * FROM accuracy_tokens WHERE cohort = 'partial'`)).rows[0];
  assert.equal(row.verdict, null);
  assert.match(row.error, /Partial verdict/);
  jupiterDown = false;
  await accuracyTick(world, verdict);
  row = (await pool.query(`SELECT * FROM accuracy_tokens WHERE cohort = 'partial'`)).rows[0];
  assert.equal(row.verdict, "AVOID");
});

test("sampled tokens whose check gave up are replaced, so the goal counts real verdicts", async () => {
  clearJupCache();
  for (let i = 0; i < 98; i++) {
    await pool.query(`INSERT INTO accuracy_tokens (cohort, mint, found_in, attempts, error) VALUES ($1, $2, 'toptraded/1h', 3, 'Partial verdict')`, [SAMPLE_COHORT, `gaveup${i}`]);
  }
  const N = "NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNpump";
  listed[N] = { id: N, liquidity: 30_000, usdPrice: 1, firstPool: { createdAt: hoursAgo(2) } };
  const tick = await accuracyTick({ ...world, fetchJson: async (url: string) => url.includes("/tokens/v2/toptrending/5m") ? [listed[N]] : world.fetchJson(url) }, fakeVerdict);
  assert.equal(tick.sampled, 1, "100 rows, but only 2 real verdicts: keep sampling");
  assert.equal((await accuracyReport()).cohorts[SAMPLE_COHORT].errors, 98, "the ones that gave up are still reported");
});

test("a full batch of 100 starts the next one by itself, and earlier batches are read again at 30 and 90 days", async () => {
  // Real tokens and real price moves: the 100 first-week tokens as recorded (tests/fixtures/research-real.json), moved
  // 31 days back in time; the market answers each one's real recorded price, liquidity and RugCheck flag.
  const fixture = JSON.parse(fs.readFileSync("tests/fixtures/research-real.json", "utf8"));
  const real = new Map<string, any>(fixture.accuracy.map((t: any) => [t.mint, t]));
  clearJupCache();
  await pool.query(`DELETE FROM accuracy_tokens`);
  for (const t of fixture.accuracy) {
    await pool.query(`INSERT INTO accuracy_tokens (cohort, mint, found_in, checked_at, verdict, checks, first_pool_at, liquidity_then, price_then) VALUES ($1, $2, $3, NOW() - INTERVAL '31 days', $4, $5, $6, $7, $8)`,
      [SAMPLE_COHORT, t.mint, t.found_in, t.verdict, JSON.stringify(t.checks), t.first_pool_at, t.liquidity_then, t.price_then]);
  }
  const w = fixture.watch[0]; // a real token from the token watch, as Jupiter listed it when the watch first read it
  const fresh = { id: w.mint, liquidity: w.reading_then.liquidity_usd, usdPrice: w.reading_then.usd_price, firstPool: { createdAt: hoursAgo(2) } };
  const answer = async (url: string) => {
    if (url.includes("/tokens/v2/toptrending/5m")) return [fresh];
    if (/tokens\/v2\/(toptraded|toporganicscore)/.test(url)) return [];
    const search = url.match(/search\?query=(\w+)/);
    if (search && real.has(search[1])) { const t = real.get(search[1]); return t.liquidity_now === null ? [] : [{ id: t.mint, symbol: "X", name: "X", decimals: 6, liquidity: t.liquidity_now, usdPrice: t.price_now }]; }
    if (search && search[1] === w.mint) return [{ symbol: w.symbol ?? "X", name: "X", decimals: 6, ...fresh }];
    const rug = url.match(/tokens\/(\w+)\/report/);
    if (rug) { const flag = real.get(rug[1])?.rugcheck_rugged; if (flag === null || flag === undefined) throw new Error("RugCheck gave no answer for this token"); return { rugged: flag }; }
    throw new Error(`unexpected ${url}`);
  };
  const tick = await accuracyTick({ ...world, fetchJson: answer }, fakeVerdict);
  assert.equal(tick.sampled, 1);
  const next = `young-tokens-${new Date().toISOString().slice(0, 10)}`;
  assert.equal((await pool.query(`SELECT cohort FROM accuracy_tokens WHERE mint = $1`, [w.mint])).rows[0].cohort, next, "the new token goes into a new batch");
  assert.equal(tick.rechecked, 15, "15 a tick, oldest first");
  const again = (await pool.query(`SELECT * FROM accuracy_rechecks`)).rows;
  assert.ok(again.every((r: any) => r.after_days === 30));
  const expected = again.map((r: any) => { const t = real.get(r.mint); return outcome({ ...t, liquidity_now: t.liquidity_now ?? 0, price_now: t.price_now }).lostMost; }).filter((x: any) => x !== null);
  const report = (await accuracyReport()).cohorts[SAMPLE_COHORT];
  assert.equal(report.laterChecks.after30Days.lostMost, `${Math.round((expected.filter(Boolean).length / expected.length) * 100)}% (${expected.filter(Boolean).length} of ${expected.length})`, "the same lost-most rule on the later reading");
  assert.equal(report.laterChecks.after90Days.readAgain, 0, "not 90 days yet");
});
