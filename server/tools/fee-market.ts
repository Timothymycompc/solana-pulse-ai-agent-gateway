// What transactions in the latest blocks actually paid for priority, per compute unit. The fee tool first used
// getRecentPrioritizationFees without accounts, which gives each slot's *lowest* landed fee: nearly always 0, so it
// answered "fast: 1 micro-lamport" while 71% of a block's transactions paid a priority fee and the median was 950
// (measured 2026-10-28). A version 1 transaction states its fee as a lamport total in its config, so its price is
// that total over its compute limit; older ones set the price with a Compute Budget instruction.
import type { Connection } from "@solana/web3.js";
import { getBase58Encoder } from "@solana/kit";

const VOTE_PROGRAM = "Vote111111111111111111111111111111111111111";
const COMPUTE_BUDGET = "ComputeBudget111111111111111111111111111111";
const SET_COMPUTE_UNIT_PRICE = 3;
// A block answer is about 2 MB, so one read serves every fee call for this long.
const CACHE_MS = 30_000;
const BLOCKS = 2;

export type MarketSample = { prices: number[]; slots: number[] };

// The price each non-vote transaction in a getBlock answer (encoding json, version 1 allowed) set, in micro-lamports
// per compute unit. 0 for one that set no priority fee.
export function pricesInBlock(block: any): number[] {
  const bytes = getBase58Encoder();
  const prices: number[] = [];
  for (const tx of block?.transactions ?? []) {
    const message = tx.transaction?.message;
    const keys: string[] = message?.accountKeys ?? [];
    if (!message || keys.includes(VOTE_PROGRAM)) continue;
    const config = message.transactionConfig;
    if (config) {
      const limit = Number(config.computeUnitLimit ?? 0);
      prices.push(limit ? Math.floor((Number(config.priorityFee ?? 0) * 1_000_000) / limit) : 0);
      continue;
    }
    let price = 0;
    for (const ix of message.instructions ?? []) {
      if (keys[ix.programIdIndex] !== COMPUTE_BUDGET) continue;
      const data = bytes.encode(ix.data);
      if (data[0] === SET_COMPUTE_UNIT_PRICE && data.length >= 9) price = Number(Buffer.from(data).readBigUInt64LE(1));
    }
    prices.push(price);
  }
  return prices;
}

const cache = new WeakMap<Connection, { at: number; value: MarketSample }>();

// The latest confirmed blocks that can be read (a skipped slot has no block, so a few are tried).
export async function recentMarket(conn: Connection): Promise<MarketSample> {
  const hit = cache.get(conn);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const tip = await conn.getSlot("confirmed");
  const value: MarketSample = { prices: [], slots: [] };
  // web3.js 1.98 rejects blocks holding version 1 transactions, so the block is read raw.
  for (let slot = tip - 2; slot > tip - 12 && value.slots.length < BLOCKS; slot--) {
    const res: any = await (conn as any)._rpcRequest("getBlock", [slot, { encoding: "json", transactionDetails: "full", maxSupportedTransactionVersion: 1, rewards: false, commitment: "confirmed" }]);
    if (res?.error || !res?.result) continue;
    value.prices.push(...pricesInBlock(res.result));
    value.slots.push(slot);
  }
  if (!value.slots.length) throw new Error("No recent block could be read");
  cache.set(conn, { at: Date.now(), value });
  return value;
}
