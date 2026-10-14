// The core safety checks against real mainnet transactions, replayed from tests/fixtures (see `npm run test:record`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { checkTransactionIntent, preflightTransaction } from "../server/tools/transactions";
import { creatorCheck, insiderCheck, liquidityPullCheck, metadataCheck, resolveToken, tokenVerdict } from "../server/tools/tokens";
import { clearJupCache } from "../server/tools/lib";
import { currentArgs, ToolError, TOOLS_BY_NAME, type ToolDef } from "../server/tools";
import { loadFixture, replayContext } from "./helpers/replay";

// The fixtures were recorded with the input names from before the October 2026 rename, so every replay also checks
// that old-style arguments still work.
async function replay(tool: ToolDef, name: string, options?: { httpDown?: boolean }): Promise<any> {
  const fixture = loadFixture(name);
  return tool.run(z.object(tool.inputs).parse(currentArgs(tool, fixture.args)), replayContext(fixture, options));
}

test("old tool and input names still reach the right tool with the right arguments", () => {
  assert.equal(TOOLS_BY_NAME.get("preflight_transaction"), preflightTransaction);
  assert.equal(TOOLS_BY_NAME.get("check_tx"), preflightTransaction);
  assert.deepEqual(
    currentArgs(checkTransactionIntent, { transaction: "AAAA", intent: { action: "transfer", token: "SOL", amount: "1", recipient: "R", sender: "S" } }),
    { tx: "AAAA", expected: { action: "transfer", token: "SOL", amount: "1", to: "R", from: "S" } },
  );
  assert.deepEqual(currentArgs(tokenVerdict, { mint: "old", token: "new" }), { token: "new" }, "the current name wins");
});

test("check_tx blocks a token approval to an outside address (the drainer pattern)", async () => {
  const r = await replay(preflightTransaction, "preflight-drainer-approval");
  assert.equal(r.verdict, "BLOCK");
  assert.ok(r.checks.some((c: any) => c.name === "token_approval" && c.result === "fail"));
});

test("check_tx passes a plain SOL transfer and reports what the wallet sends", async () => {
  const r = await replay(preflightTransaction, "preflight-sol-transfer");
  assert.equal(r.verdict, "OK");
  assert.equal(r.simulation.worked, true);
  assert.ok(r.checks.some((c: any) => c.name === "outflow" && c.detail.includes("SOL")));
});

test("tx_matches matches a plain SOL transfer", async () => {
  const r = await replay(checkTransactionIntent, "intent-sol-match");
  assert.equal(r.verdict, "MATCH");
  assert.deepEqual(r.unexpected, []);
});

test("tx_matches catches SOL moved by an extra instruction", async () => {
  const r = await replay(checkTransactionIntent, "intent-hidden-outflow");
  assert.equal(r.verdict, "MISMATCH");
  assert.ok(r.unexpected.some((e: string) => e.includes("create_account")), "names the extra instruction");
  assert.ok(r.unexpected.some((e: string) => e.startsWith("Dry run: the sender loses 5.01")), "reports the real loss from the simulation");
});

test("tx_matches allows creating the recipient's token account", async () => {
  const r = await replay(checkTransactionIntent, "intent-usdc-new-account");
  assert.equal(r.verdict, "MATCH");
  assert.deepEqual(r.unexpected, []);
});

test("tx_matches catches a decimals slip (10 USDC sent when 1 was asked)", async () => {
  const r = await replay(checkTransactionIntent, "intent-usdc-wrong-amount");
  assert.equal(r.verdict, "MISMATCH");
  assert.equal(r.compared.find((c: any) => c.what === "amount").ok, false);
  assert.match(r.summary, /^Wrong amount/);
});

test("tx_matches catches an extra USDC transfer to someone else", async () => {
  const r = await replay(checkTransactionIntent, "intent-usdc-extra-transfer");
  assert.equal(r.verdict, "MISMATCH");
  assert.ok(r.unexpected.some((e: string) => e.startsWith("Extra transfer")));
  assert.ok(r.unexpected.some((e: string) => e.includes("loses 6 USDC")));
});

test("token_safety treats a regulated stablecoin's issuer powers as expected", async () => {
  const r = await replay(tokenVerdict, "token-verdict-usdc");
  assert.equal(r.verdict, "SAFE");
  assert.ok(r.checks.some((c: any) => c.name === "known_stablecoin"));
});

test("token_safety passes an established token on a real simulated sale, and only notes a RugCheck outage", async () => {
  const r = await replay(tokenVerdict, "token-verdict-jup");
  assert.equal(r.verdict, "SAFE");
  assert.equal(r.checks.find((c: any) => c.name === "sell_test")?.result, "pass");
  const rug = r.checks.find((c: any) => c.name === "rugcheck_data");
  if (rug) assert.equal(rug.result, "info", "a verified token isn't downgraded because RugCheck is down");
});

test("token_safety says AVOID for a new token whose creator has rugged before", async () => {
  const r = await replay(tokenVerdict, "token-verdict-rugger");
  assert.equal(r.verdict, "AVOID");
  assert.equal(r.checks.find((c: any) => c.name === "creator_history")?.result, "fail");
});

test("liquidity pull: one unlocked provider fails, a bonding curve or many providers pass", () => {
  const pool = (usd: number, locked: number, type = "raydium") => ({ marketType: type, lp: { quoteUSD: usd / 2, baseUSD: usd / 2, lpLockedPct: locked } });
  assert.equal(liquidityPullCheck({ markets: [pool(50_000, 0)], totalLPProviders: 1 }, false)?.result, "fail");
  assert.equal(liquidityPullCheck({ markets: [pool(50_000, 0)], totalLPProviders: 1 }, true)?.result, "warn", "verified tokens get a warning");
  assert.equal(liquidityPullCheck({ markets: [pool(50_000, 0)], totalLPProviders: 5 }, false)?.result, "warn");
  assert.equal(liquidityPullCheck({ markets: [pool(50_000, 0)], totalLPProviders: 104 }, false)?.result, "pass", "BONK's case: 104 providers");
  assert.equal(liquidityPullCheck({ markets: [pool(5_000, 0, "pump_fun")], totalLPProviders: 0 }, false)?.result, "pass", "a bonding curve can't be pulled");
  assert.equal(liquidityPullCheck({ markets: [pool(50_000, 100)], totalLPProviders: 1 }, false)?.result, "pass", "burned or locked LP");
  assert.equal(liquidityPullCheck({ markets: [pool(500, 0)], totalLPProviders: 1 }, false), null, "dust pools are ignored");
});

test("insiders, creator history and metadata follow their thresholds", () => {
  const supply = 1_000_000n;
  assert.equal(insiderCheck({ insiderNetworks: [{ size: 40, currentHolding: 400_000 }] }, supply)?.result, "fail");
  assert.equal(insiderCheck({ insiderNetworks: [{ size: 12, currentHolding: 150_000 }] }, supply)?.result, "warn");
  assert.equal(insiderCheck({ insiderNetworks: [{ size: 48, currentHolding: 800 }] }, supply)?.result, "pass", "BONK's case: many wallets, tiny share");
  assert.equal(creatorCheck({ risks: [{ name: "Creator history of rugged tokens", level: "danger" }] }, undefined, false)?.result, "fail");
  assert.equal(creatorCheck(null, { audit: { devMints: 2531 } } as any, false)?.result, "warn", "serial launcher");
  assert.equal(creatorCheck(null, { audit: { devMints: 2531 } } as any, true)?.result, "pass", "verified tokens aren't judged on launch count");
  assert.equal(metadataCheck({ tokenMeta: { mutable: true, updateAuthority: "x" } }, false, null)?.result, "warn");
  assert.equal(metadataCheck({ tokenMeta: { mutable: true, updateAuthority: "x" } }, true, null)?.result, "info");
  assert.equal(metadataCheck({ tokenMeta: { mutable: false } }, false, null)?.result, "pass");
});

test("token_safety says when market data is missing instead of blaming the token", async () => {
  const r = await replay(tokenVerdict, "token-verdict-usdc", { httpDown: true });
  assert.equal(r.verdict, "CAUTION");
  assert.ok(r.checks.some((c: any) => c.name === "market_data" && c.result === "warn"));
  assert.ok(!r.checks.some((c: any) => c.name === "verified" || c.name === "liquidity"), "skips the market checks");
});

test("find_token fails with a retryable error when token search is down", async () => {
  clearJupCache();
  const ctx = { connection: () => { throw new Error("no RPC needed"); }, fetchJson: async () => { throw new Error("HTTP 503"); } };
  await assert.rejects(resolveToken.run({ name: "BONK" }, ctx as any), (e: unknown) => e instanceof ToolError && e.status === 503);
});
