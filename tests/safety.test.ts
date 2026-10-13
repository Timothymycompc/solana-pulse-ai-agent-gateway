// The core safety checks against real mainnet transactions, replayed from tests/fixtures (see `npm run test:record`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { checkTransactionIntent, preflightTransaction } from "../server/tools/transactions";
import { resolveToken, tokenVerdict } from "../server/tools/tokens";
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
