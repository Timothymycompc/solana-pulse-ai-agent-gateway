// The daily research run (research.ts): the fixed meanings of "did well" and "lost most", the rule that a pattern only
// "holds up" when it beats the base rate in both the older and the newer half, and the weekly reports.
import { test } from "node:test";
import assert from "node:assert/strict";
import { interval, research, resultOf, weekly, type Sample } from "../server/research";

const r = (p: Partial<Parameters<typeof resultOf>[0]>) => resultOf({ rugcheck_rugged: null, liquidity_then: 50_000, liquidity_now: 50_000, price_then: 1, price_now: 1, ...p });
test("did well needs 2x the price with at least half the liquidity left; lost most is the accuracy test's rule", () => {
  assert.equal(r({ price_now: 2 }), "did well");
  assert.equal(r({ price_now: 2, liquidity_now: 20_000 }), "in between", "a price on a drained pool isn't a real gain");
  assert.equal(r({ price_now: 1.9 }), "in between");
  assert.equal(r({ price_now: 0.1 }), "lost most");
  assert.equal(r({ liquidity_now: 0 }), "lost most", "no longer listed");
  assert.equal(r({ price_now: null, liquidity_now: null }), null, "never guessed");
});

test("the 95% range is wide for small groups and narrow for big ones", () => {
  const [lo5, hi5] = interval(1, 5), [lo500, hi500] = interval(100, 500);
  assert.ok(hi5 - lo5 > 0.5);
  assert.ok(hi500 - lo500 < 0.08);
});

let day = 0;
const s = (result: Sample["result"], age: "warn" | "pass", insiders: "fail" | "pass"): Sample => ({
  mint: `m${day}`, symbol: null, source: "token watch", checkedAt: new Date(Date.UTC(2026, 9, 1) + day++ * 3.6e6).toISOString(),
  checks: { age, insiders }, verdict: "CAUTION", ageHours: null, liquidityThen: null, holdersThen: null, top10Then: null,
  priceThen: 1, priceAfter: result === "did well" ? 3 : 0.05, result,
});

test("a pattern holds up only if tokens with it beat tokens without it, in the older half and again in the newer half", () => {
  // age: warn -> lost most in both halves. insiders: fail -> did well only in the older half (luck).
  const half = (luckyWins: boolean) => [
    ...Array.from({ length: 10 }, () => s("lost most", "warn", "pass")),
    ...Array.from({ length: 10 }, () => s(luckyWins ? "did well" : "in between", "pass", "fail")),
    ...Array.from({ length: 10 }, () => s(luckyWins ? "in between" : "did well", "pass", "pass")),
  ];
  const out = research([...half(true), ...half(false)]);
  assert.equal(out.tokens, 60);
  assert.ok(out.holdsUp.lostMost.includes("age: warn"));
  assert.ok(!out.holdsUp.didWell.includes("insiders: fail"), "only the older half: maybe luck");
  const p = out.patterns.find((x) => x.trait === "insiders: fail")!;
  assert.deepEqual([p.didWell.olderPct, p.didWell.newerPct], [100, 0]);
  assert.equal(out.didWell.length, 20);
});

test("weekly reports: one every 7 days, saying which patterns started or stopped holding up", () => {
  const run = (tokens: number, didWell: string[]) => ({ tokens, base: { didWell: 10, lostMost: 60 }, holdsUp: { didWell, lostMost: ["age: warn"] } }) as any;
  const weeks = weekly([
    { day: "2026-11-01", result: run(100, []) },
    { day: "2026-11-03", result: run(120, ["x"]) },
    { day: "2026-11-08", result: run(170, ["liquidity at check: $100k or more"]) },
    { day: "2026-11-15", result: run(240, []) },
  ]);
  assert.deepEqual(weeks.map((w) => w.day), ["2026-11-15", "2026-11-08", "2026-11-01"], "newest first, daily runs in between skipped");
  assert.equal(weeks[1].newTokens, 70);
  assert.deepEqual(weeks[1].didWell.startedHolding, ["liquidity at check: $100k or more"]);
  assert.deepEqual(weeks[0].didWell.stoppedHolding, ["liquidity at check: $100k or more"]);
});

// Real tokens, real price moves: replayed from tests/fixtures/research-real.json (npx tsx tests/record-research.ts).
test("on the real recorded tokens it reproduces the numbers measured by hand on Oct 27", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { pool, ensureSchema } = await import("../server/db");
  const { loadSamples } = await import("../server/research");
  const fs = await import("node:fs");
  const db = new PGlite();
  (pool as any).query = async (sql: string, params?: unknown[]) => { const x = await db.query(sql, params as any[]); return { rows: x.rows, rowCount: x.affectedRows ?? x.rows.length }; };
  await ensureSchema();
  const f = JSON.parse(fs.readFileSync("tests/fixtures/research-real.json", "utf8"));
  for (const [table, rows] of [["accuracy_tokens", f.accuracy], ["token_watch", f.watch], ["token_watch_readings", f.readings]] as const) {
    for (const row of rows) {
      const k = Object.keys(row);
      await pool.query(`INSERT INTO ${table} (${k.join(",")}) VALUES (${k.map((_, i) => `$${i + 1}`).join(",")})`, k.map((c) => (row[c] !== null && typeof row[c] === "object" ? JSON.stringify(row[c]) : row[c])));
    }
  }
  const samples = await loadSamples();
  const firstWeek = samples.filter((x) => x.source === "first-week test");
  const lost = (g: Sample[]) => `${g.filter((x) => x.result === "lost most").length} of ${g.length}`;
  assert.equal(firstWeek.length, 100);
  assert.equal(lost(firstWeek.filter((x) => x.verdict === "AVOID")), "14 of 21", "the grant update's AVOID number");
  assert.equal(lost(firstWeek.filter((x) => x.verdict === "CAUTION")), "51 of 79");
  assert.equal(lost(firstWeek.filter((x) => x.ageHours !== null && x.ageHours < 1)), "40 of 45", "first-hour tokens");
  const out = research(samples);
  assert.deepEqual(out.holdsUp.didWell, [], "4 winners out of 110 is too few for any pattern to hold up");
  assert.deepEqual(out.holdsUp.lostMost, ["age at check: under 1 hour"], "the one pattern found by hand holds up here too");
});
