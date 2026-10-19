// The everyday test (benchmark/everyday.ts): 200 ordinary mainnet transactions that really worked, checked the way a
// wallet hands them over before signing, replayed from their recordings. A change that adds a false alarm, or quietly
// stops one, changes these counts and fails here. Re-record with npm run everyday:record, then update the counts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreEveryday } from "../benchmark/everyday";

test("200 ordinary transactions: no BLOCK, transfers all OK and MATCH, swaps match but for one 1.54% bot fee", async () => {
  const { byGroup } = await scoreEveryday();
  const pick = (g: any) => ({ transactions: g.transactions, checkTx: g.checkTx, txMatches: g.txMatches });
  assert.deepEqual(pick(byGroup.sol_transfer), { transactions: 40, checkTx: { OK: 40, REVIEW: 0, BLOCK: 0 }, txMatches: { checked: 40, MATCH: 40, MISMATCH: 0 } });
  assert.deepEqual(pick(byGroup.token_transfer), { transactions: 40, checkTx: { OK: 40, REVIEW: 0, BLOCK: 0 }, txMatches: { checked: 40, MATCH: 40, MISMATCH: 0 } });
  assert.deepEqual(pick(byGroup.jupiter_swap), { transactions: 50, checkTx: { OK: 48, REVIEW: 2, BLOCK: 0 }, txMatches: { checked: 27, MATCH: 26, MISMATCH: 1 } });
  // "other" is everything else on mainnet; most of it calls programs check_tx doesn't know, which it says (REVIEW).
  assert.deepEqual(pick(byGroup.other), { transactions: 70, checkTx: { OK: 12, REVIEW: 58, BLOCK: 0 }, txMatches: { checked: 0, MATCH: 0, MISMATCH: 0 } });
  assert.deepEqual(byGroup.other.alarmReasons, { unknown_programs: 58 });
});
