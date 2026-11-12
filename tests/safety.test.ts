// The core safety checks against real mainnet transactions, replayed from tests/fixtures (see `npm run test:record`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { checkTransactionIntent, explainTransaction, feeAdvice, preflightTransaction } from "../server/tools/transactions";
import { creatorCheck, insiderCheck, liquidityPullCheck, metadataCheck, permanentDelegateRule, resolveToken, safeSummary, rugChanceReasons, sameTicker, tokenVerdict, valueVsLiquidityCheck, holderSpreadCheck } from "../server/tools/tokens";
import { clearJupCache } from "../server/tools/lib";
import { jupiterSaysNotTradable } from "../server/tools/sellcheck";
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

// Balances before and after the dry run must come from the same moment. 2026-11-12: a fresh 0.01 SOL transfer from a
// busy exchange wallet came back MISMATCH ("loses 0.010005032 SOL ... only 0.010005031") because the "before" balance
// was read at another moment and the wallet had moved 1 lamport. Mainnet fees matched Pulse's formula in 249 of 249
// landed transactions, so the gap wasn't the fee. These variants of the real intent-sol-match recording play an RPC
// node that answers without preBalances.
function withoutSameMoment(attempts: { preBalances: boolean; slot?: number }[], drift = 0n) {
  const fixture = structuredClone(loadFixture("intent-sol-match"));
  const calls: any = fixture.recording.calls;
  const [early, preRead] = calls.getMultipleAccountsInfo;
  const sim = calls.simulateTransaction[0];
  calls.getMultipleAccountsInfo = [early];
  calls.getMultipleAccountsInfoAndContext = attempts.map((a) => ({
    context: { slot: a.slot ?? 1 },
    value: preRead.map((acc: any) => acc && { ...acc, lamports: acc.lamports + Number(drift) }),
  }));
  calls.simulateTransaction = attempts.map((a) => {
    const value = { ...sim.value };
    if (!a.preBalances) delete value.preBalances;
    return { ...sim, value };
  });
  return replayContextFor(fixture);
}
const replayContextFor = (fixture: any) => ({ fixture, ctx: replayContext(fixture) });
async function matchWith(variant: { fixture: any; ctx: any }) {
  return checkTransactionIntent.run(z.object(checkTransactionIntent.inputs).parse(currentArgs(checkTransactionIntent, variant.fixture.args)), variant.ctx) as Promise<any>;
}

test("tx_matches retries the dry run until the node gives same-moment balances", async () => {
  const r = await matchWith(withoutSameMoment([{ preBalances: false }, { preBalances: false }, { preBalances: true }], 1n));
  assert.equal(r.verdict, "MATCH", JSON.stringify(r.unexpected));
});

test("tx_matches says it couldn't confirm, instead of reporting a loss, when balances never come from the same moment", async () => {
  const r = await matchWith(withoutSameMoment([{ preBalances: false }, { preBalances: false }, { preBalances: false }], 5000n));
  assert.equal(r.verdict, "MISMATCH");
  assert.equal(r.unexpected.length, 1);
  assert.match(r.unexpected[0], /Couldn't confirm the sender's SOL change/);
  assert.doesNotMatch(r.unexpected[0], /loses/);
});

// The node's own numbers can disagree by a lamport or two (3 of 13 dry runs on 2026-11-12); a real extra loss can't hide
// in that margin (SOL_DRIFT_LAMPORTS, 100 lamports).
function withSenderLoss(extraLamports: number) {
  const fixture = structuredClone(loadFixture("intent-sol-match"));
  const sim: any = (fixture.recording.calls as any).simulateTransaction[0];
  sim.value.accounts[0].lamports -= extraLamports;
  return { fixture, ctx: replayContext(fixture) };
}

test("tx_matches allows the 1-2 lamport drift seen inside a node's own dry-run numbers", async () => {
  const r = await matchWith(withSenderLoss(2));
  assert.equal(r.verdict, "MATCH", JSON.stringify(r.unexpected));
});

test("tx_matches still catches a real extra SOL loss just past that margin", async () => {
  const r = await matchWith(withSenderLoss(5000));
  assert.equal(r.verdict, "MISMATCH");
  assert.match(r.unexpected[0], /the sender loses/);
});

test("a separate read from the dry run's own slot counts as the same moment", async () => {
  const slot = (loadFixture("intent-sol-match").recording.calls as any).simulateTransaction[0].context.slot;
  const r = await matchWith(withoutSameMoment([{ preBalances: false, slot }]));
  assert.equal(r.verdict, "MATCH", JSON.stringify(r.unexpected));
});

test("check_tx counts wrapped SOL as SOL when a swap closes the wallet's wrapped-SOL account", async () => {
  const r = await replay(preflightTransaction, "preflight-swap-wsol-close");
  const me = (token: string) => r.balance_changes.find((c: any) => c.is_you && c.token === token);
  const wrappedBefore = Number(me("So11111111111111111111111111111111111111112").before);
  assert.ok(wrappedBefore > 1, "the wallet held wrapped SOL before the swap");
  const outflow = r.checks.find((c: any) => c.name === "outflow").detail;
  const sent = Number(/sends: ([\d.]+) SOL/.exec(outflow)![1]);
  assert.ok(sent > 0 && sent < 0.02, `a 0.01 SOL swap sends about 0.01 SOL, not ${outflow}`);
  assert.match(outflow, /wrapped SOL counted as SOL/);
  assert.doesNotMatch(outflow, /So1111/);
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
  const f = await replay(feeAdvice, "fee-v1");
  assert.match(f.how_to_use, /version 1 transaction: set computeUnitLimit to \d+ and priorityFeeLamports/);
  // Prices come from what the recorded blocks' transactions paid, not the per-slot minimum that answered "1" before.
  assert.ok(f.samples > 100 && f.share_paying > 0.5, `${f.samples} sampled, ${f.share_paying} paying`);
  assert.ok(f.prices.normal.compute_unit_price > 1, `normal ${f.prices.normal.compute_unit_price}`);
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

test("token_safety says AVOID for a token with no market left, but only when Jupiter itself says it isn't tradable", async () => {
  const r = await replay(tokenVerdict, "token-verdict-dead");
  assert.equal(r.verdict, "AVOID", r.summary);
  assert.match(r.checks.find((c: any) => c.name === "liquidity")?.detail, /not tradable/);
  // Jupiter down: no market data at all, so nothing is claimed about the market.
  const down = await replay(tokenVerdict, "token-verdict-dead", { httpDown: true });
  assert.ok(!down.checks.some((c: any) => c.name === "liquidity"), "no liquidity verdict without Jupiter");
});

test("Jupiter's router answers: not tradable is a no, a quote is a yes, an outage is unknown", async () => {
  const ctx = (answer: () => Promise<any>) => ({ fetchJson: answer } as any);
  assert.equal(await jupiterSaysNotTradable(ctx(async () => { throw new Error("HTTP 400 from api.jup.ag (TOKEN_NOT_TRADABLE)"); }), "m", 10n ** 15n), true);
  assert.equal(await jupiterSaysNotTradable(ctx(async () => ({ outAmount: "123" })), "m", 10n ** 15n), false);
  assert.equal(await jupiterSaysNotTradable(ctx(async () => { throw new Error("HTTP 429 from api.jup.ag"); }), "m", 10n ** 15n), null);
  assert.equal(await jupiterSaysNotTradable(ctx(async () => { throw new Error("HTTP 400 from api.jup.ag"); }), "m", 10n ** 15n), null, "a 400 without Jupiter's code proves nothing");
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
// Narrowed 2026-11-01 after AODF: the exemption is for established tokens only.
test("insiders: an established token's networks of over 500 wallets are left out, small ones still count", () => {
  const supply = 1_000_000n;
  // TRUMP's shape: one 1,566-wallet network holding 38.9%.
  const big = insiderCheck({ insiderNetworks: [{ size: 1566, currentHolding: 389_000 }] }, supply, true);
  assert.equal(big?.result, "pass");
  assert.match(big!.detail, /not counted: on an established token/);
  const mixed = insiderCheck({ insiderNetworks: [{ size: 1566, currentHolding: 389_000 }, { size: 40, currentHolding: 350_000 }] }, supply, true);
  assert.equal(mixed?.result, "fail", "a small network holding 35% still fails next to a big one");
  assert.match(mixed!.detail, /^40 linked insider wallets hold 35\.0%/);
  assert.equal(insiderCheck({ insiderNetworks: [{ size: 500, currentHolding: 400_000 }] }, supply, true)?.result, "fail", "500 wallets still counts");
  // A new token: the same big network counts. AODF's shape: 1,526 wallets holding 58.8%.
  const fresh = insiderCheck({ insiderNetworks: [{ size: 1526, currentHolding: 588_000 }] }, supply);
  assert.equal(fresh?.result, "fail");
  assert.match(fresh!.detail, /^1526 linked insider wallets hold 58\.8%/);
});

// AODF (4AWL…pump), Nov 1 2026: the creator split the supply over hundreds of wallets 3 minutes after launch, and 11 of
// them sold together 15 hours later (-99%). Recorded after the dump; RugCheck's network still holds 58.8%.
test("AODF: a new token's 1,526-wallet insider network now counts, so the verdict is AVOID", async () => {
  clearJupCache();
  const f = loadFixture("token-verdict-aodf-insiders");
  const r: any = await tokenVerdict.run(z.object(tokenVerdict.inputs).parse(f.args), replayContext(f));
  const insiders = r.checks.find((c: any) => c.name === "insiders");
  assert.equal(insiders.result, "fail");
  assert.match(insiders.detail, /^1526 linked insider wallets hold 58\.8% of the supply/);
  assert.equal(r.verdict, "AVOID");
  assert.equal(r.rug_chance.level, "high", "and the reason it's a likely rug is named on its own");
  const spread = r.checks.find((c: any) => c.name === "holder_spread");
  assert.equal(spread.result, "warn", "top 10 holders 0.5%: the supply was split");
  assert.deepEqual(r.rug_chance.reasons, [spread.detail, insiders.detail]);
  assert.equal(typeof r.about.value_to_liquidity, "number");
});

test("rug_chance: only the rug signs count, each with its reason; none found is null, not a guess", () => {
  const c = (name: string, result: any, detail = name) => ({ name, result, detail, source: "rugcheck" as const });
  assert.deepEqual(rugChanceReasons([c("insiders", "fail"), c("value_vs_liquidity", "warn"), c("liquidity_pull", "fail"), c("creator_history", "fail")]), ["insiders", "value_vs_liquidity", "liquidity_pull", "creator_history"]);
  assert.deepEqual(rugChanceReasons([c("mint_authority", "warn"), c("liquidity", "fail"), c("insiders", "warn"), c("value_vs_liquidity", "info")]), [], "other reasons to avoid aren't rug signs");
});

test("AODF clone: other tokens with the same ticker are noted, without changing the verdict", async () => {
  clearJupCache();
  const f = loadFixture("token-verdict-aodf-clone");
  const r: any = await tokenVerdict.run(z.object(tokenVerdict.inputs).parse(f.args), replayContext(f));
  const clones = r.checks.find((c: any) => c.name === "same_ticker");
  assert.equal(clones.result, "info");
  assert.match(clones.detail, /^19 other tokens use the ticker AODF/);
  assert.equal(r.verdict, "CAUTION", "the same warnings as before: unverified and under a day old");
  // Recorded after the dump at 85x (under the 100x line) and RugCheck shows no insider network, but the top 10 still
  // own only 0.7%: the split supply is still visible after the dump.
  assert.equal(r.rug_chance.level, "high");
  assert.match(r.rug_chance.reasons.join(" "), /The 10 biggest holders own only 0\.7%/);
});

// Real readings: Pulse's own watch of both AODF tokens (Nov 1 2026, 14:06 and 16:10 UTC, before they dumped), the
// desk's entry into SIS (a normal young pump.fun token), and JUP's market data the same day.
test("value vs liquidity: warns for a new token worth over 100x its pools, a fact for established tokens", () => {
  const aodfBeforeDump = valueVsLiquidityCheck(0.7818771115884836, 999991498.348454, 1141533, false);
  assert.equal(aodfBeforeDump?.result, "warn");
  assert.equal(Math.round(aodfBeforeDump!.ratio), 685);
  assert.match(aodfBeforeDump!.detail, /^The token's total value \(\$781\.9M\) is 685x its DEX liquidity \(\$1\.1M\)\. The pools hold little/);
  assert.equal(valueVsLiquidityCheck(0.7576040651761662, 999987867.620407, 1126662, false)?.result, "warn", "the other AODF, 672x");
  const sis = valueVsLiquidityCheck(0.000421, 1e9, 57903, false);
  assert.equal(sis?.result, "pass");
  assert.match(sis!.detail, /is 7\.3x its DEX liquidity/);
  assert.equal(valueVsLiquidityCheck(1775e6 / 6.99e9, 6.99e9, 5.03e6, true)?.result, "info", "JUP, 353x, is established");
  assert.equal(valueVsLiquidityCheck(undefined, 1e9, 57903, false), null, "no price: no check, not a guess");
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

// Real sends read from each creator's token account (benchmark/creator-split/probe.ts, read Nov 1 2026): the three
// tokens a trader bought that were dumped 99% that day, and the five it bought that weren't.
test("creator_split: the 3 dumped tokens split supply into equal parts right after launch; the 5 others didn't", async () => {
  const { creatorSplitCheck } = await import("../server/tools/creator-split");
  const fs = await import("node:fs");
  const read = (mint: string) => { const d = JSON.parse(fs.readFileSync(`benchmark/creator-split/out/${mint}.json`, "utf8")); return { sends: d.sends, readToLaunch: true, capped: true }; };
  for (const mint of ["4AWLQqBBZxDYNJ872F9CP4t6kWF8RZ5nNuGknV6Zpump", "pfQBdLdT3TTaWYUc83whsm16vPd3XA6Y22GDbwEpump", "VWmjd6CyU6wL2UiGUEQeA4upVcanrApLae4qMe8pump"]) {
    const r = creatorSplitCheck(read(mint), 6);
    assert.equal(r.result, "fail", mint);
    assert.match(r.detail, /sent exactly 396,550 tokens each to at least \d{3} wallets within \d+ seconds?, \d+ minutes? after launch/);
  }
  const normal = fs.readdirSync("benchmark/creator-split/out").filter((f) => !/^(4AWL|pfQB|VWmj)/.test(f));
  assert.equal(normal.length, 5);
  for (const f of normal) assert.equal(creatorSplitCheck(read(f.replace(".json", "")), 6).result, "pass", f);
  // A creator who varies the amounts: XTO's real sends, each amount changed. Still caught, one level down.
  const xto = read("VWmjd6CyU6wL2UiGUEQeA4upVcanrApLae4qMe8pump");
  const varied = { ...xto, sends: xto.sends.map((s: any, i: number) => ({ ...s, amount: String(BigInt(s.amount) + BigInt(i) * 1_000_000n)})) };
  assert.equal(creatorSplitCheck(varied, 6).result, "warn");
  assert.equal(creatorSplitCheck(null, 6).result, "info", "unreadable history is unknown, not a pass");
  assert.equal(creatorSplitCheck({ sends: [], readToLaunch: false }, 6).result, "info");
});

// Live XTO came back "unknown" on Nov 2 2026: the batched read throws for the whole batch when one entry fails. Each
// transaction is now read on its own, so one bad read costs only that transaction.
test("creator_split: one unreadable transaction doesn't hide the others; none readable is unknown", async () => {
  const { creatorSends, creatorSplitCheck } = await import("../server/tools/creator-split");
  const { PublicKey } = await import("@solana/web3.js");
  const mint = "VWmjd6CyU6wL2UiGUEQeA4upVcanrApLae4qMe8pump", creator = "9An6tLMr3JS349Zq13XYrvN7F1295sjztdPzesxH4rqy";
  const program = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"), launch = 1_793_456_671;
  const bal = (owner: string, amount: bigint) => ({ mint, owner, uiTokenAmount: { amount: amount.toString() } });
  // 6 transactions, 3 wallets each, all the same amount, 2 seconds apart; transaction 2 can't be read.
  const sigs = Array.from({ length: 6 }, (_, i) => ({ signature: `sig${i}`, blockTime: launch + 360 + i * 2, err: null }));
  const tx = (i: number) => {
    const to = [0, 1, 2].map((k) => new PublicKey(Uint8Array.from({ length: 32 }, (_, b) => (b === 0 ? i * 3 + k + 1 : 7))).toBase58());
    return { blockTime: launch + 360 + i * 2, meta: { preTokenBalances: [bal(creator, 10_000_000_000_000n)], postTokenBalances: [bal(creator, 10_000_000_000_000n - 3n * 396_550_000_000n), ...to.map((o) => bal(o, 396_550_000_000n))] } };
  };
  const conn = (broken: (i: number) => boolean) => ({
    getSignaturesForAddress: async () => [...sigs].reverse(),
    getParsedTransaction: async (sig: string) => { const i = Number(sig.slice(3)); if (broken(i)) throw new Error("failed to get transaction"); return tx(i); },
  }) as any;
  const read = await creatorSends(conn((i) => i === 2), mint, creator, program, launch);
  assert.equal(read?.sends.length, 15, "5 readable transactions x 3 wallets");
  assert.equal(creatorSplitCheck(read, 6).result, "fail");
  assert.equal(await creatorSends(conn(() => true), mint, creator, program, launch), null, "nothing readable is unknown, not 'no sends'");
});

test("holder_spread: top 10 under 1% on a new token warns and counts as a rug sign; established tokens and stablecoins don't", () => {
  assert.equal(holderSpreadCheck(0.6, false, false)?.result, "warn");
  assert.equal(holderSpreadCheck(1.0, false, false), null, "PAWCAT (1.0%) wasn't dumped");
  assert.equal(holderSpreadCheck(0.6, true, false), null);
  assert.equal(holderSpreadCheck(0.6, false, true), null);
  assert.equal(holderSpreadCheck(undefined, false, false), null);
  assert.deepEqual(rugChanceReasons([{ name: "holder_spread", result: "warn", detail: "a", source: "jupiter" }, { name: "creator_split", result: "fail", detail: "b", source: "on-chain" }, { name: "creator_split", result: "warn", detail: "c", source: "on-chain" }] as any), ["a", "b"]);
});
