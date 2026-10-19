// The Solana Agent Safety Benchmark, replayed from benchmark/cases (see `npm run benchmark:record`). The scoreboard
// below is what Solana Pulse measures today, gaps included; when a gap is fixed, its line changes with the fix.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CASES } from "../benchmark/cases";
import { loadCases, pulseChecker, score, type Outcome } from "../benchmark/score";

const MEASURED: Record<string, Outcome> = {
  "01-correct": "correct",
  "02-wrong-recipient": "caught",
  "03-wrong-amount": "caught",
  "04-wrong-token": "caught",
  "05-extra-instruction": "caught",
  "06-hidden-transfer": "caught",
  // Was missed until tx_matches learned swaps (2026-10-19): it now sees the bought token going to someone else.
  "07-malicious-program": "caught",
  "08-balance-drain": "caught",
  "09-expired": "caught",
  // Was caught only for its expired blockhash until check_tx learned to look up signed transactions (2026-10-19).
  "10-replayed-payment": "caught",
};

test("every benchmark case is recorded, and every attack names the real scam it stands for", () => {
  const recorded = loadCases();
  assert.deepEqual(recorded.map((c) => c.id), CASES.map((c) => c.id));
  for (const c of recorded.filter((x) => x.expected === "FAIL")) {
    assert.ok(c.realWorld.length && c.realWorld.every((r) => r.source.startsWith("https://")), `${c.id} names a source`);
    assert.ok(c.rightReasons.length, `${c.id} says what catches it for the right reason`);
  }
});

test("Solana Pulse's benchmark score is what was measured", async () => {
  const { results } = await score(pulseChecker);
  assert.deepEqual(Object.fromEntries(results.map((r) => [r.id, r.outcome])), MEASURED);
});
