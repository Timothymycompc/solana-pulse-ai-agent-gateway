import { test } from "node:test";
import assert from "node:assert/strict";
import { tokenTraders, tradeOf, walletsFrom, type Trade } from "../server/tools/traders";
import { loadFixture, replayContext } from "./helpers/replay";

// A minimal parsed transaction: one signer W whose SOL and token balances change.
const W = "4n5BVoTVmuiE3QwrBYhbEUZ2yU8gThBX2YyA2RLsqLsD", MINT = "GAv6gs9AtQtf1xcHtq3V6HQ3daj42H4iDyzC4STWYMdw";
const tx = (solLamports: number, tokenRaw: number, err: unknown = null): any => ({
  slot: 100, blockTime: 1_000,
  transaction: { message: { accountKeys: [{ pubkey: { toBase58: () => W }, signer: true }] } },
  meta: {
    err, preBalances: [5_000_000_000], postBalances: [5_000_000_000 + solLamports],
    preTokenBalances: [{ accountIndex: 1, owner: W, mint: MINT, uiTokenAmount: { amount: "1000000", decimals: 6 } }],
    postTokenBalances: [{ accountIndex: 1, owner: W, mint: MINT, uiTokenAmount: { amount: String(1_000_000 + tokenRaw), decimals: 6 } }],
  },
});

test("tradeOf: tokens in and SOL out is a buy; tokens out and SOL in is a sell", () => {
  assert.deepEqual(tradeOf(tx(-10_000_000, 5_000_000), MINT, "a"), { wallet: W, tx_id: "a", slot: 100, time: 1_000, side: "buy", tokens: 5, sol: -0.01 });
  assert.equal(tradeOf(tx(20_000_000, -5_000_000), MINT, "b")?.side, "sell");
});

test("tradeOf: tokens and SOL moving the same way is a liquidity change, not a trade (the creator's first deposit)", () => {
  assert.equal(tradeOf(tx(-1_000_000_000, -900_000_000), MINT, "c"), null, "deposit: both leave the wallet");
  assert.equal(tradeOf(tx(1_000_000_000, 900_000_000), MINT, "d"), null, "withdrawal: both come back");
});

test("tradeOf: failed transactions and other tokens are ignored", () => {
  assert.equal(tradeOf(tx(-10_000_000, 5_000_000, { InstructionError: [0, "Custom"] }), MINT, "e"), null);
  assert.equal(tradeOf(tx(-10_000_000, 5_000_000), "So11111111111111111111111111111111111111112", "f"), null);
});

test("walletsFrom: profit is SOL in minus SOL out; launch-slot buys, creators and outside tokens are flagged", () => {
  const t = (over: Partial<Trade>): Trade => ({ wallet: "A", tx_id: "x", slot: 10, time: 100, side: "buy", tokens: 100, sol: -1, ...over });
  const ws = walletsFrom([
    t({}), t({ side: "sell", tokens: 100, sol: 1.5, time: 700, slot: 20 }),     // A: in at launch, out 10 min later, +0.5
    t({ wallet: "B", slot: 11, time: 130, sol: -2, tokens: 50 }),                // B: still holding, -2 and 50 tokens left
    t({ wallet: "C", side: "sell", tokens: 500, sol: 3, slot: 12, time: 200 }), // C: sold without buying here
  ], { slot: 10, time: 100, creator: "C" });
  const by = Object.fromEntries(ws.map((w) => [w.wallet, w]));
  assert.equal(by.A.profit_sol, 0.5); assert.equal(by.A.bought_in_launch_slot, true); assert.equal(by.A.held_minutes, 10); assert.equal(by.A.first_buy_after_launch_s, 0);
  assert.equal(by.B.profit_sol, -2); assert.equal(by.B.tokens_left, 50); assert.equal(by.B.bought_in_launch_slot, false); assert.equal(by.B.first_buy_after_launch_s, 30);
  assert.equal(by.C.sold_more_than_bought, true); assert.equal(by.C.created_pool, true); assert.equal(by.C.profit_sol, 3);
});

test("token_traders on HAMSTER's real pool (recorded 2026-11-09): reads from the start, skips the creator's deposit", async () => {
  const fx = loadFixture("traders-hamster");
  const out: any = await tokenTraders.run(fx.args, replayContext(fx));
  assert.equal(out.start_reached, true);
  assert.equal(out.launch_time, "2026-11-02T22:39:22.000Z");
  assert.equal(out.pool_creator, "4tzE6N2166Koww97SStgQBkrzE4yx6amh215Gvf5mUem");
  assert.equal(out.transactions_read, 15); assert.equal(out.unread, 0);
  assert.equal(out.trades, 12, "15 transactions, 3 of them not trades (the pool's creation and deposit)");
  assert.equal(out.window.cut_short, true, "15 transactions cover far less than half an hour");
  assert.ok(out.wallets.every((w: any) => !w.created_pool), "the creator only deposited, so it is not a trader here");
  assert.ok(out.wallets.every((w: any) => w.sol_spent > 0 && w.sol_spent < 0.01), "early buys of ~0.0016 SOL each");
  const sorted = out.wallets.map((w: any) => w.profit_sol);
  assert.deepEqual(sorted, [...sorted].sort((a: number, b: number) => b - a), "most profit first");
});
