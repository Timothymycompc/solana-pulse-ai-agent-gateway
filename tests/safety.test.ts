// The core safety checks against real mainnet transactions, replayed from tests/fixtures (see `npm run test:record`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { checkTransactionIntent, explainTransaction, feeAdvice, preflightTransaction } from "../server/tools/transactions";
import { creatorCheck, insiderCheck, liquidityPullCheck, metadataCheck, permanentDelegateRule, resolveToken, safeSummary, sameTicker, tokenVerdict } from "../server/tools/tokens";
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
  assert.ok(!r.checks.some((c: any) => c.name === "already_landed"), "an unsigned transaction has no ID to look up");
  assert.ok(r.checks.some((c: any) => c.name === "outflow" && c.detail.includes("SOL")));
});

test("tx_matches matches a plain SOL transfer", async () => {
  const r = await replay(checkTransactionIntent, "intent-sol-match");
  assert.equal(r.verdict, "MATCH");
  assert.deepEqual(r.unexpected, []);
});

// Version 1 transactions were 40% of non-vote transactions in a mainnet block on 2026-10-19, and web3.js can't read them.
test("check_tx and tx_matches read a version 1 transaction, with its fee from the v1 config", async () => {
  const r = await replay(preflightTransaction, "preflight-v1-sol-transfer");
  assert.equal(r.verdict, "OK");
  assert.equal(r.fee.priority_lamports, "1000", "a v1 priority fee is a lamport total");
  assert.equal(r.fee.compute_unit_limit, 450);
  assert.equal((await replay(checkTransactionIntent, "intent-v1-sol-match")).verdict, "MATCH");
});

test("fee gives v1 advice for a v1 transaction, and explain_tx reads a landed v1 transaction", async () => {
  assert.match((await replay(feeAdvice, "fee-v1")).how_to_use, /version 1 transaction: set computeUnitLimit to \d+ and priorityFeeLamports/);
  const e = await replay(explainTransaction, "explain-v1");
  assert.equal(e.result, "success");
  assert.equal(e.programs[0].address, "11111111111111111111111111111111");
  assert.ok(e.sol_changes.some((c: any) => c.raw_change === "9945"));
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

// The recorded wallet is busy: between reading its balance and the dry run it moved 0.000015 SOL elsewhere. The
// dry run's own before-balances keep that from showing up as a loss.
test("tx_matches matches a real Jupiter swap that pays the bought token back to the wallet", async () => {
  const r = await replay(checkTransactionIntent, "intent-swap-usdc-jup-match");
  assert.equal(r.verdict, "MATCH", r.summary);
  assert.deepEqual(r.unexpected, []);
  assert.equal(r.compared.find((c: any) => c.what === "amount").actual, "sells 1 (1000000 raw)");
  assert.ok(BigInt(r.received.raw_amount) > 0n);
});

// Jupiter wraps the SOL, swaps it, then closes the wallet's wrapped-SOL account, which hands back everything it held.
test("tx_matches matches a real swap that sells SOL, counting wrapped SOL as the wallet's own", async () => {
  const r = await replay(checkTransactionIntent, "intent-swap-sol-usdc-match");
  assert.equal(r.verdict, "MATCH", r.summary);
  assert.equal(r.compared.find((c: any) => c.what === "amount").actual, "sells 0.01 (10000000 raw)");
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
  const ctx = { connection: () => { throw new Error("no RPC needed"); }, fetchJson: async () => { throw new Error("HTTP 503"); }, retryDelayMs: 0 };
  await assert.rejects(resolveToken.run({ name: "BONK" }, ctx as any), (e: unknown) => e instanceof ToolError && e.status === 503);
});

// Found in the 2026-10-16 audit of 500 tokens against the live server.
test("insiders: RugCheck data claiming more than the whole supply is reported as unknown, not AVOID", () => {
  // dogwifhat's real RugCheck numbers: one 6,675-wallet network "holding" 3.1x the supply.
  const wif = insiderCheck({ insiderNetworks: [{ size: 6675, currentHolding: 3_113_036_720_740_009 }, { size: 4, currentHolding: 5_500_000_000_000 }, { size: 7, currentHolding: 776_285_000_000 }] }, 998_836_874_304_514n);
  assert.equal(wif?.result, "info");
  assert.match(wif!.detail, /unknown/i);
  assert.equal(insiderCheck({ insiderNetworks: [{ size: 40, currentHolding: 1_000_000 }] }, 1_000_000n)?.result, "fail", "exactly 100% is still possible, so still a fail");
});

test("find_token matches a ticker listed with a leading $ (dogwifhat is $WIF)", async () => {
  clearJupCache();
  assert.ok(sameTicker("$WIF", "WIF") && sameTicker("wif", "$WIF") && !sameTicker("WIFE", "WIF"));
  const wif = { id: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm", symbol: "$WIF", name: "dogwifhat", decimals: 6, isVerified: true, liquidity: 6_129_272 };
  const copy = { id: "3NGdM1KZZMscrzNQWVdYWZ2eutnDH7tseKNoWGUMpump", symbol: "WIF", name: "Fake", decimals: 6, isVerified: false, liquidity: 3_000 };
  const ctx = { connection: () => { throw new Error("no RPC needed"); }, fetchJson: async () => [wif, copy], retryDelayMs: 0 };
  const r: any = await resolveToken.run({ name: "WIF" }, ctx as any);
  assert.equal(r.best?.address, wif.id);
  assert.equal(r.copycats, 1);
});

test("find_token retries once when Jupiter turns a request away", async () => {
  clearJupCache();
  let calls = 0;
  const ctx = { connection: () => { throw new Error("no RPC needed"); }, fetchJson: async () => { if (++calls === 1) throw new Error("HTTP 429"); return [{ id: "x", symbol: "BONK", name: "Bonk", decimals: 5, isVerified: true }]; }, retryDelayMs: 0 };
  const r: any = await resolveToken.run({ name: "BONK" }, ctx as any);
  assert.equal(calls, 2);
  assert.equal(r.best?.address, "x");
});

test("a SAFE summary only claims the checks that ran, and names the ones that didn't", async () => {
  const s = safeSummary([
    { name: "verified", result: "pass", detail: "", source: "jupiter" },
    { name: "liquidity_pull", result: "pass", detail: "", source: "rugcheck" },
    { name: "sell_test", result: "info", detail: "Sell test skipped: the token's holders could not be read right now.", source: "simulation" },
  ]);
  assert.doesNotMatch(s, /sale worked/);
  assert.match(s, /liquidity can't be pulled/);
  assert.match(s, /Not checked: Sell test skipped/);
  const usdc = await replay(tokenVerdict, "token-verdict-usdc");
  assert.doesNotMatch(usdc.summary, /sale worked|insider network|rug record/, "a stablecoin skips those checks, so the summary can't claim them");
  assert.match(usdc.summary, /don't apply/);
});

test("find_token doesn't offer unverified copies as choices when no verified token has the ticker", async () => {
  clearJupCache();
  // BCAT, 2026-10-16: Jupiter's search returned only unverified tokens with that ticker; the verified one was missing.
  const fake = (id: string) => ({ id, symbol: "BCAT", name: "BCAT", decimals: 6, isVerified: false, liquidity: 3_200 });
  const ctx = { connection: () => { throw new Error("no RPC needed"); }, fetchJson: async () => [fake("a"), fake("b"), fake("c")], retryDelayMs: 0 };
  const r: any = await resolveToken.run({ name: "BCAT" }, ctx as any);
  assert.equal(r.best, null);
  assert.match(r.next_step, /Ask the user for the exact token address/);
  assert.doesNotMatch(r.next_step, /which one they mean/);
});

// Decided 2026-10-16 from the same audit.
test("insiders: networks of over 500 wallets are left out, small ones still count", () => {
  const supply = 1_000_000n;
  // TRUMP's shape: one 1,566-wallet network holding 38.9%.
  const big = insiderCheck({ insiderNetworks: [{ size: 1566, currentHolding: 389_000 }] }, supply);
  assert.equal(big?.result, "pass");
  assert.match(big!.detail, /not counted/);
  const mixed = insiderCheck({ insiderNetworks: [{ size: 1566, currentHolding: 389_000 }, { size: 40, currentHolding: 350_000 }] }, supply);
  assert.equal(mixed?.result, "fail", "a small network holding 35% still fails next to a big one");
  assert.match(mixed!.detail, /^40 linked insider wallets hold 35\.0%/);
  assert.equal(insiderCheck({ insiderNetworks: [{ size: 500, currentHolding: 400_000 }] }, supply)?.result, "fail", "500 wallets still counts");
});

test("a known issuer's permanent delegate warns and names the issuer; anyone else's fails", () => {
  const xstocks = permanentDelegateRule("5aMNNLQJwAEeoemTEMkv5NVjqKwvvefRYCQ5Z67HFvEq", null);
  assert.equal(xstocks.result, "warn");
  assert.match(xstocks.detail, /xStocks/);
  assert.equal(permanentDelegateRule("WV9PJN7XTmTLVwbutCLFxp8TyePee6Xq5mRq6Fti5Wc", null).result, "fail", "PreStocks still fails");
  assert.equal(permanentDelegateRule(undefined, null).result, "fail");
  assert.equal(permanentDelegateRule("2apBGMsS6ti9RyF5TwQTDswXBWskiJP2LD4cUEDqYJjk", "USDG (Paxos, Global Dollar)").result, "info");
});

test("token_safety on real tokens: a tokenized stock is CAUTION and an established liquid staking token is SAFE", async () => {
  const tsla = await replay(tokenVerdict, "token-verdict-xstock");
  assert.equal(tsla.verdict, "CAUTION");
  assert.ok(tsla.checks.some((c: any) => c.name === "extension:permanentDelegate" && c.result === "warn" && /xStocks/.test(c.detail)));
  const jupsol = await replay(tokenVerdict, "token-verdict-lst");
  assert.equal(jupsol.verdict, "SAFE");
  assert.ok(jupsol.checks.some((c: any) => c.name === "holder_concentration" && c.result === "info"), "59.8% in the top 10 is expected for an LST");
  const mint = jupsol.checks.find((c: any) => c.name === "mint_authority");
  assert.equal(mint.result, "info", "an established token's mint authority (here the stake pool) is expected");
  assert.match(mint.detail, /established token .*trading since 20\d\d-/, "and the detail says why and who you trust");
});

test("the established-token rule needs 90 days of trading: the same token traded for a week keeps its warnings", async () => {
  const f = loadFixture("token-verdict-lst");
  const weekOld = new Date(Date.now() - 7 * 864e5).toISOString();
  const rec = JSON.parse(JSON.stringify(f.recording.http).replace(/"createdAt":"[^"]+"/g, `"createdAt":"${weekOld}"`));
  clearJupCache();
  const r: any = await tokenVerdict.run(z.object(tokenVerdict.inputs).parse(f.args), replayContext({ ...f, recording: { ...f.recording, http: rec } }));
  assert.equal(r.checks.find((c: any) => c.name === "mint_authority").result, "warn");
  assert.equal(r.verdict, "CAUTION");
});
