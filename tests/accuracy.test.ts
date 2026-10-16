// The accuracy test (accuracy.ts) against a real Postgres (PGlite, in memory): sampling new tokens, following them
// up a week later, and the rates it reports. Outside data is faked here; the rules for "rugged" are what's tested.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { pool, ensureSchema } from "../server/db";
import { accuracyReport, accuracyTick, addToQueue, ruggedOutcome, SAMPLE_COHORT } from "../server/accuracy";
import { clearJupCache } from "../server/tools/lib";

const db = new PGlite();
before(async () => {
  (pool as any).query = async (sql: string, params?: unknown[]) => {
    const r = await db.query(sql, params as any[]);
    return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
  };
  await ensureSchema();
});

test("rugged: RugCheck says so, or liquidity fell 90%+; unknown when neither source answers", () => {
  assert.equal(ruggedOutcome({ rugcheckRugged: true, liquidityThen: 50_000, liquidityNow: 49_000 }), true);
  assert.equal(ruggedOutcome({ rugcheckRugged: null, liquidityThen: 50_000, liquidityNow: 5_000 }), true, "exactly 90% down");
  assert.equal(ruggedOutcome({ rugcheckRugged: false, liquidityThen: 50_000, liquidityNow: 6_000 }), false);
  assert.equal(ruggedOutcome({ rugcheckRugged: false, liquidityThen: 50_000, liquidityNow: null }), false);
  assert.equal(ruggedOutcome({ rugcheckRugged: null, liquidityThen: 50_000, liquidityNow: null }), null, "never guessed");
});

const NEW_A = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAApump";
const NEW_B = "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBpump";
const TINY = "CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCpump";
function world(state: { rugged: Record<string, boolean>; liquidity: Record<string, number> }) {
  return {
    connection: () => { throw new Error("no RPC needed"); },
    retryDelayMs: 0,
    fetchJson: async (url: string) => {
      if (url.endsWith("/tokens/v2/recent")) return [{ id: NEW_A, liquidity: 40_000 }, { id: NEW_B, liquidity: 25_000 }, { id: TINY, liquidity: 900 }];
      const search = url.match(/search\?query=(\w+)/);
      if (search) return state.liquidity[search[1]] === undefined ? [] : [{ id: search[1], symbol: "X", name: "X", decimals: 6, isVerified: false, liquidity: state.liquidity[search[1]], usdPrice: 1 }];
      const rug = url.match(/tokens\/(\w+)\/report/);
      if (rug) return { rugged: state.rugged[rug[1]] ?? false };
      throw new Error(`unexpected ${url}`);
    },
  } as any;
}
const verdicts: Record<string, string> = { [NEW_A]: "AVOID", [NEW_B]: "SAFE" };
const fakeVerdict = async (mint: string) => ({ verdict: verdicts[mint] ?? "CAUTION", checks: [{ name: "liquidity", result: verdicts[mint] === "AVOID" ? "fail" : "pass" }] });

test("a tick samples new tokens with enough liquidity, and a week later records whether they rugged", async () => {
  clearJupCache();
  const state = { rugged: {} as Record<string, boolean>, liquidity: { [NEW_A]: 40_000, [NEW_B]: 25_000 } as Record<string, number> };
  const first = await accuracyTick(world(state), fakeVerdict);
  assert.equal(first.sampled, 2, "the $900 token is skipped");
  assert.equal((await accuracyTick(world(state), fakeVerdict)).sampled, 0, "the same tokens aren't sampled twice");

  // A week passes: A rugged (RugCheck), B lost 95% of its liquidity.
  await pool.query(`UPDATE accuracy_tokens SET follow_up_due = NOW() - INTERVAL '1 minute'`);
  clearJupCache();
  state.rugged[NEW_A] = true;
  state.liquidity[NEW_B] = 1_000;
  assert.equal((await accuracyTick(world(state), fakeVerdict)).followedUp, 2);

  const c = (await accuracyReport()).cohorts[SAMPLE_COHORT];
  assert.deepEqual(c.outcomes.rugged, { AVOID: 1, SAFE: 1 });
  assert.equal(c.caughtAsAvoid, "50% (1 of 2)");
  assert.equal(c.ruggedButSafe, "50% (1 of 2)");
  assert.equal(c.avoidButDidNotRug, "no data yet");
});

test("tokens queued by hand get a verdict and no follow-up; a failing check gives up after 3 tries", async () => {
  clearJupCache();
  const state = { rugged: {}, liquidity: {} };
  assert.equal(await addToQueue("rerun", [NEW_A, "not-an-address", NEW_A]), 1);
  const broken = "DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDpump";
  await addToQueue("rerun", [broken]);
  const verdict = async (mint: string) => { if (mint === broken) throw new Error("RPC down"); return fakeVerdict(mint); };
  for (let i = 0; i < 4; i++) await accuracyTick(world(state), verdict);
  const rows = (await pool.query(`SELECT mint, verdict, follow_up_due, attempts FROM accuracy_tokens WHERE cohort = 'rerun' ORDER BY mint`)).rows;
  assert.equal(rows.find((r: any) => r.mint === NEW_A).verdict, "AVOID");
  assert.equal(rows.find((r: any) => r.mint === NEW_A).follow_up_due, null);
  assert.equal(rows.find((r: any) => r.mint === broken).attempts, 3);
  assert.equal((await accuracyReport()).cohorts.rerun.errors, 1);
});
