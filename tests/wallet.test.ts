import { test } from "node:test";
import assert from "node:assert/strict";
import { walletSnapshot } from "../server/tools/wallet";
import { loadFixture, replayContext } from "./helpers/replay";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

test("wallet on a real SOL + USDC wallet (recorded 2026-11-13): USDC is verified and counted", async () => {
  const fx = loadFixture("wallet-usdc");
  const out: any = await walletSnapshot.run(fx.args, replayContext(fx));
  const usdc = out.top_tokens.find((t: any) => t.address === USDC);
  assert.equal(usdc.symbol, "USDC");
  assert.equal(usdc.verified, true);
  assert.equal(out.lookup_failed, false);
  assert.ok(out.tokens_usd > 0.79 && out.tokens_usd < 0.81, `0.795698 USDC, got ${out.tokens_usd}`);
  assert.equal(out.total_usd, Math.round((out.sol_usd + out.tokens_usd) * 100) / 100);
});

// 2026-11-13: with Jupiter unreachable, wallet called USDC and USDT unverified and left ~$600k out of a $690k
// account's total. Unknown must read as unknown: null, never false and never a smaller number.
test("wallet with Jupiter down: tokens are unknown (null), not unverified, and no total is guessed", async () => {
  const fx = loadFixture("wallet-usdc");
  const out: any = await walletSnapshot.run(fx.args, replayContext(fx, { httpDown: true }));
  const usdc = out.top_tokens.find((t: any) => t.address === USDC);
  assert.equal(usdc.verified, null, "unknown, not false");
  assert.equal(usdc.usd_value, null);
  assert.equal(usdc.amount, "0.795698", "the on-chain amount is still known");
  assert.equal(out.lookup_failed, true);
  assert.equal(out.unverified_count, 0, "a token that couldn't be looked up isn't counted as unverified");
  assert.equal(out.tokens_usd, null);
  assert.equal(out.total_usd, null);
  assert.equal(out.partial, true);
});
