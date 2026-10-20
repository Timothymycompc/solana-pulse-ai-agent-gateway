// The first-wallet test (benchmark/first-wallet.ts): 628 tokens one real beginner bought, with what became of each.
// A change to token_safety that stops warning on tokens that died, or starts warning on ones that kept their value,
// changes these counts and fails here. Re-check with npm run first-wallet:refresh, then update the counts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreFirstWallet } from "../benchmark/first-wallet";

test("628 real tokens: buy-day warnings on 96% of the dead ones and none of the ones that kept their value", () => {
  const s = scoreFirstWallet();
  assert.deepEqual(s.no_market_today, { tokens: 413, warnedOnBuyDay: 400, verdictToday: { SAFE: 0, CAUTION: 1, AVOID: 412 } });
  assert.deepEqual(s.lost_most, { tokens: 37, warnedOnBuyDay: 4, verdictToday: { SAFE: 5, CAUTION: 8, AVOID: 24 } });
  assert.deepEqual(s.kept_value, { tokens: 20, warnedOnBuyDay: 0, verdictToday: { SAFE: 9, CAUTION: 6, AVOID: 5 } });
  assert.deepEqual(s.unknown, { tokens: 158, warnedOnBuyDay: 95, verdictToday: { SAFE: 9, CAUTION: 16, AVOID: 133 } });
});
