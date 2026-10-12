// The core safety checks against real mainnet transactions, replayed from tests/fixtures (see `npm run test:record`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { checkTransactionIntent, preflightTransaction } from "../server/tools/transactions";
import { resolveToken, tokenVerdict } from "../server/tools/tokens";
import { clearJupCache } from "../server/tools/lib";
import { ToolError, type ToolDef } from "../server/tools";
import { loadFixture, replayContext } from "./helpers/replay";

async function replay(tool: ToolDef, name: string, options?: { httpDown?: boolean }): Promise<any> {
  const fixture = loadFixture(name);
  return tool.run(z.object(tool.inputs).parse(fixture.args), replayContext(fixture, options));
}

test("preflight blocks a token approval to an outside address (the drainer pattern)", async () => {
  const r = await replay(preflightTransaction, "preflight-drainer-approval");
  assert.equal(r.verdict, "BLOCK");
  assert.ok(r.checks.some((c: any) => c.id === "token_approval" && c.status === "fail"));
});

test("preflight passes a plain SOL transfer and reports what the wallet sends", async () => {
  const r = await replay(preflightTransaction, "preflight-sol-transfer");
  assert.equal(r.verdict, "OK");
  assert.equal(r.simulation.success, true);
  assert.ok(r.checks.some((c: any) => c.id === "outflow" && c.detail.includes("SOL")));
});

test("intent check matches a plain SOL transfer", async () => {
  const r = await replay(checkTransactionIntent, "intent-sol-match");
  assert.equal(r.verdict, "MATCH");
  assert.deepEqual(r.unexpectedEffects, []);
});

test("intent check catches SOL moved by an extra instruction", async () => {
  const r = await replay(checkTransactionIntent, "intent-hidden-outflow");
  assert.equal(r.verdict, "MISMATCH");
  assert.ok(r.unexpectedEffects.some((e: string) => e.includes("create_account")), "names the extra instruction");
  assert.ok(r.unexpectedEffects.some((e: string) => e.startsWith("Simulation: the sender loses 5.01")), "reports the real loss from the simulation");
});

test("intent check allows creating the recipient's token account", async () => {
  const r = await replay(checkTransactionIntent, "intent-usdc-new-account");
  assert.equal(r.verdict, "MATCH");
  assert.deepEqual(r.unexpectedEffects, []);
});

test("intent check catches a decimals slip (10 USDC sent when 1 was asked)", async () => {
  const r = await replay(checkTransactionIntent, "intent-usdc-wrong-amount");
  assert.equal(r.verdict, "MISMATCH");
  assert.equal(r.fieldChecks.find((c: any) => c.field === "amount").ok, false);
  assert.match(r.explanation, /^Mismatch on amount/);
});

test("intent check catches an extra USDC transfer to someone else", async () => {
  const r = await replay(checkTransactionIntent, "intent-usdc-extra-transfer");
  assert.equal(r.verdict, "MISMATCH");
  assert.ok(r.unexpectedEffects.some((e: string) => e.startsWith("Extra transfer")));
  assert.ok(r.unexpectedEffects.some((e: string) => e.includes("loses 6 USDC")));
});

test("token verdict treats a regulated stablecoin's issuer powers as expected", async () => {
  const r = await replay(tokenVerdict, "token-verdict-usdc");
  assert.equal(r.verdict, "SAFE");
  assert.ok(r.checks.some((c: any) => c.id === "known_stablecoin"));
});

test("token verdict says when market data is missing instead of blaming the token", async () => {
  const r = await replay(tokenVerdict, "token-verdict-usdc", { httpDown: true });
  assert.equal(r.verdict, "CAUTION");
  assert.ok(r.checks.some((c: any) => c.id === "market_data" && c.status === "warn"));
  assert.ok(!r.checks.some((c: any) => c.id === "verified" || c.id === "liquidity"), "skips the market checks");
});

test("resolve_token fails with a retryable error when token search is down", async () => {
  clearJupCache();
  const ctx = { connection: () => { throw new Error("no RPC needed"); }, fetchJson: async () => { throw new Error("HTTP 503"); } };
  await assert.rejects(resolveToken.run({ query: "BONK" }, ctx as any), (e: unknown) => e instanceof ToolError && e.status === 503);
});
