// token_traders: who traded a token's pool from launch, and what each wallet made or lost doing it.
// Built 2026-11-09 so the trading desk can study wallets that profit on new coins (Tim: "find some other wallets that
// have been profitable doing this and study their trades") through Pulse, not around it. Facts only: every number is
// each wallet's own SOL and token balance changes in the pool's transactions; nothing is guessed or labelled.
import { PublicKey, type ParsedTransactionWithMeta } from "@solana/web3.js";
import { z } from "zod";
import { assertAddress, formatUnits, isoTime, NATIVE_MINT, NETWORK_DOC, rugReport } from "./lib";
import { parsedTransaction } from "./transactions";
import { ToolError, type ToolDef } from "./types";

export type Trade = { wallet: string; tx_id: string; slot: number; time: number | null; side: "buy" | "sell"; tokens: number; sol: number };

// One transaction in the pool -> the trade by the wallet that signed it, or null (no signer's balance of the token moved,
// or tokens and SOL moved the same way: liquidity changes, fee claims, other people's routes). SOL counts the signer's own SOL and wrapped-SOL changes, fees and
// tips included, so it is what the trade really cost or paid that wallet.
export function tradeOf(tx: ParsedTransactionWithMeta, mint: string, txId: string): Trade | null {
  const meta = tx.meta;
  if (!meta || meta.err) return null;
  const keys = tx.transaction.message.accountKeys.map((k) => ({ key: k.pubkey.toBase58(), signer: k.signer }));
  const owner = (b: any) => b.owner ?? keys[b.accountIndex]?.key;
  const tokenDelta = (who: string, m: string) => {
    let raw = 0n, decimals = 0;
    for (const b of meta.preTokenBalances ?? []) if (owner(b) === who && b.mint === m) { raw -= BigInt(b.uiTokenAmount.amount); decimals = b.uiTokenAmount.decimals; }
    for (const b of meta.postTokenBalances ?? []) if (owner(b) === who && b.mint === m) { raw += BigInt(b.uiTokenAmount.amount); decimals = b.uiTokenAmount.decimals; }
    return Number(formatUnits(raw, decimals));
  };
  for (const s of keys.filter((k) => k.signer)) {
    const tokens = tokenDelta(s.key, mint);
    if (!tokens) continue;
    const i = keys.findIndex((k) => k.key === s.key);
    const lamports = (meta.postBalances[i] ?? 0) - (meta.preBalances[i] ?? 0);
    const sol = lamports / 1e9 + tokenDelta(s.key, NATIVE_MINT);
    // A trade moves tokens and SOL in opposite directions. Same direction is a liquidity deposit or withdrawal (the
    // creator's first deposit looked like a 1,000,000,000-token "sale" for 0 SOL), so it is not counted.
    if ((tokens > 0 && sol >= 0) || (tokens < 0 && sol <= 0)) return null;
    return { wallet: s.key, tx_id: txId, slot: tx.slot, time: tx.blockTime ?? null, side: tokens > 0 ? "buy" : "sell", tokens: Math.abs(tokens), sol };
  }
  return null;
}

export type WalletResult = {
  wallet: string; buys: number; sells: number; sol_spent: number; sol_received: number; profit_sol: number;
  tokens_bought: number; tokens_sold: number; tokens_left: number; first_buy: string | null; first_buy_after_launch_s: number | null;
  bought_in_launch_slot: boolean; sold_more_than_bought: boolean; created_pool: boolean; held_minutes: number | null;
};

// Trades (oldest first) -> one line per wallet. profit_sol is cash in minus cash out inside the window; tokens still held
// are listed, not valued, because their price can vanish (most new pools drain).
export function walletsFrom(trades: Trade[], launch: { slot: number; time: number | null; creator: string | null }): WalletResult[] {
  const by = new Map<string, WalletResult & { _first: number | null; _last: number | null }>();
  for (const t of trades) {
    const w = by.get(t.wallet) ?? { wallet: t.wallet, buys: 0, sells: 0, sol_spent: 0, sol_received: 0, profit_sol: 0, tokens_bought: 0, tokens_sold: 0, tokens_left: 0,
      first_buy: null, first_buy_after_launch_s: null, bought_in_launch_slot: false, sold_more_than_bought: false, created_pool: t.wallet === launch.creator, held_minutes: null, _first: null, _last: null };
    if (t.side === "buy") {
      w.buys++; w.tokens_bought += t.tokens; w.sol_spent += Math.max(0, -t.sol);
      if (w._first === null) {
        w._first = t.time; w.first_buy = isoTime(t.time);
        w.first_buy_after_launch_s = t.time !== null && launch.time !== null ? t.time - launch.time : null;
        w.bought_in_launch_slot = t.slot === launch.slot;
      }
    } else { w.sells++; w.tokens_sold += t.tokens; w.sol_received += Math.max(0, t.sol); w._last = t.time; }
    by.set(t.wallet, w);
  }
  return [...by.values()].map(({ _first, _last, ...w }) => ({
    ...w, profit_sol: +(w.sol_received - w.sol_spent).toFixed(6), sol_spent: +w.sol_spent.toFixed(6), sol_received: +w.sol_received.toFixed(6),
    tokens_left: Math.max(0, w.tokens_bought - w.tokens_sold), sold_more_than_bought: w.tokens_sold > w.tokens_bought * 1.0001,
    held_minutes: _first !== null && _last !== null && _last >= _first ? Math.round((_last - _first) / 60) : null,
  }));
}

// The pool with the most liquidity in RugCheck's report, when the caller didn't name one.
async function mainPool(ctx: Parameters<ToolDef["run"]>[1], mint: string): Promise<string | null> {
  const { report } = await rugReport(ctx, mint);
  const markets = (report?.markets ?? []).filter((m) => m.pubkey);
  markets.sort((a, b) => ((b.lp?.quoteUSD ?? 0) + (b.lp?.baseUSD ?? 0)) - ((a.lp?.quoteUSD ?? 0) + (a.lp?.baseUSD ?? 0)));
  return markets[0]?.pubkey ?? null;
}

const MAX_PAGES = 40; // 40,000 signatures: past that, the pool's start is not reached and the answer says so

export const tokenTraders: ToolDef = {
  name: "token_traders",
  title: "Who traded this token, and who made money?",
  category: "tokens",
  benefit: { kind: "accuracy", text: "Shows each wallet's real SOL in and out on a token from its first trade, from chain balances, so 'smart money' claims, insider dumps and launch-block snipers can be checked instead of believed." },
  useWhen: "Run to see who bought a token early and who profited: launch-block snipers, the pool creator, wallets that sold more than they bought (got tokens some other way), and ordinary traders.",
  usage: '{"token": "<mint address>", "hours": 6}',
  description: "Reads a token's pool from its first transaction for a set time and lists the wallets that traded it: buys, sells, SOL spent and received, profit, how soon after launch they bought, and launch-block and creator flags.",
  inputs: {
    token: z.string(), pool: z.string().optional(), hours: z.number().min(0.1).max(24).optional().default(6),
    max_trades: z.number().int().min(10).max(1000).optional().default(400), how_many: z.number().int().min(1).max(100).optional().default(25),
    network: z.enum(["mainnet-beta", "devnet"]).optional().default("mainnet-beta"),
  },
  inputDocs: [
    { name: "token", type: "string (mint address)", required: true, lookingFor: "The token whose traders you want.", whereToGet: "find_token, or the token's address from the user. Never make one up." },
    { name: "pool", type: "string (pool address)", required: false, lookingFor: "The pool to read. Default: the pool with the most liquidity in RugCheck's report.", whereToGet: "A DEX page or GeckoTerminal's pool address." },
    { name: "hours", type: "number 0.1-24", required: false, lookingFor: "How long after the pool's first transaction to read (default 6).", whereToGet: "Short (1-2) to study the launch, longer to see who held." },
    { name: "max_trades", type: "integer 10-1000", required: false, lookingFor: "At most this many transactions are read, oldest first (default 400).", whereToGet: "Raise it for busy pools; the answer says when the window was cut short." },
    { name: "how_many", type: "integer 1-100", required: false, lookingFor: "How many wallets to list, most profit first (default 25).", whereToGet: "Default is fine." },
    NETWORK_DOC,
  ],
  outputs: [
    { field: "pool / launch_time / launch_slot", type: "string / string | null / number", is: "The pool read and its first transaction.", howWorkedOut: "The oldest signature of the pool address (getSignaturesForAddress, paged back to the start)." },
    { field: "window", type: "{ from, to, hours, cut_short }", is: "The time read. cut_short is true when max_trades ran out before the hours did.", howWorkedOut: "Launch time plus hours, and the last transaction actually read." },
    { field: "start_reached", type: "boolean", is: "False when the pool had more than 40,000 transactions and its start couldn't be reached; launch then means the oldest one read.", howWorkedOut: "Signature pages left over." },
    { field: "transactions_read / trades / unread", type: "number", is: "Transactions loaded, how many were a wallet buying or selling the token, and how many couldn't be loaded (left out, never guessed).", howWorkedOut: "getTransaction on each signature in the window." },
    { field: "wallets_count / profitable_count", type: "number", is: "Wallets that traded, and how many took out more SOL than they put in.", howWorkedOut: "Counted from wallets[] before the how_many cut." },
    { field: "wallets[]", type: "array", is: "Most profit first: wallet, buys, sells, sol_spent, sol_received, profit_sol, tokens_bought, tokens_sold, tokens_left, first_buy, first_buy_after_launch_s, bought_in_launch_slot, sold_more_than_bought, created_pool, held_minutes.", howWorkedOut: "Each trade is the signing wallet's own token and SOL (plus wrapped SOL) balance change in one transaction, fees and tips included. profit_sol = SOL received minus SOL spent in the window; tokens_left are not valued. sold_more_than_bought means the wallet got tokens another way (a transfer, often from the creator). held_minutes is first buy to last sell." },
    { field: "snipers", type: "{ wallets, profit_sol }", is: "Wallets that bought in the pool's very first slot, and their total profit.", howWorkedOut: "bought_in_launch_slot on wallets[]." },
  ],
  notes: [
    "SOL-paired pools only: trades paid in USDC or another token show up with sol near 0.",
    "Profit is inside the window only. A wallet that bought before the window or still holds is not fully counted, and the answer never values tokens it still holds.",
    "No names or labels: a wallet is described only by what its trades show.",
  ],
  example: async () => ({ token: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", hours: 0.5, max_trades: 50 }),
  run: async ({ token, pool, hours, max_trades, how_many, network }, ctx) => {
    const mint = assertAddress(token, "token");
    const poolAddress = pool ? assertAddress(pool, "pool") : await mainPool(ctx, mint);
    if (!poolAddress) throw new ToolError(404, "No pool found for this token.", "Pass the pool address (from a DEX page or GeckoTerminal).");
    const conn = ctx.connection(network);

    // Page back to the pool's first transaction (newest first, 1,000 per page).
    const sigs: { signature: string; slot: number; blockTime?: number | null; err: unknown }[] = [];
    let before: string | undefined, pages = 0, startReached = false;
    while (pages < MAX_PAGES) {
      const page = await conn.getSignaturesForAddress(new PublicKey(poolAddress), { limit: 1000, ...(before ? { before } : {}) }, "confirmed");
      pages++; sigs.push(...page);
      if (page.length < 1000) { startReached = true; break; }
      before = page[page.length - 1].signature;
    }
    if (!sigs.length) throw new ToolError(404, "This pool has no transactions.", "Check the pool address and network.");
    sigs.reverse(); // oldest first
    const first = sigs[0], launchTime = first.blockTime ?? null;
    const end = launchTime !== null ? launchTime + hours * 3600 : null;
    const inWindow = sigs.filter((s) => !s.err && (end === null || (s.blockTime ?? 0) <= end));
    const toRead = inWindow.slice(0, max_trades);

    // The pool's creator: whoever signed its first transaction.
    const txs: (ParsedTransactionWithMeta | null)[] = [];
    for (let i = 0; i < toRead.length; i += 10) {
      txs.push(...(await Promise.all(toRead.slice(i, i + 10).map((s) => parsedTransaction(conn, s.signature).catch(() => null)))));
    }
    const firstTx = await parsedTransaction(conn, first.signature).catch(() => null);
    const creator = firstTx?.transaction.message.accountKeys.find((k) => k.signer)?.pubkey.toBase58() ?? null;
    const trades = txs.flatMap((tx, i) => (tx ? [tradeOf(tx, mint, toRead[i].signature)] : [])).filter((t): t is Trade => !!t);
    const wallets = walletsFrom(trades, { slot: first.slot, time: launchTime, creator }).sort((a, b) => b.profit_sol - a.profit_sol);
    const snipers = wallets.filter((w) => w.bought_in_launch_slot);
    const lastRead = toRead.length ? toRead[toRead.length - 1].blockTime ?? null : null;
    return {
      token: mint, pool: poolAddress, network, launch_time: isoTime(launchTime), launch_slot: first.slot, start_reached: startReached, pool_creator: creator,
      window: { from: isoTime(launchTime), to: isoTime(inWindow.length > toRead.length ? lastRead : end), hours, cut_short: inWindow.length > toRead.length },
      transactions_read: txs.filter(Boolean).length, trades: trades.length, unread: txs.filter((t) => !t).length,
      wallets_count: wallets.length, profitable_count: wallets.filter((w) => w.profit_sol > 0).length,
      snipers: { wallets: snipers.length, profit_sol: +snipers.reduce((a, w) => a + w.profit_sol, 0).toFixed(6) },
      wallets: wallets.slice(0, how_many),
    };
  },
};
