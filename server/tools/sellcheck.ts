// Can a holder actually sell? Picks a real wallet that holds the token, has Jupiter build a sale of a small amount
// into SOL for that wallet, and simulates the sale on mainnet without sending it. A token whose settings look fine can
// still block selling (a transfer hook, frozen accounts, a broken pool), and only a real attempt shows that.
import { Connection, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { jupiterHost, NATIVE_MINT } from "./lib";
import type { ToolContext } from "./types";

const JUP = () => `${jupiterHost()}/swap/v1`;
const MIN_FEE_LAMPORTS = 3_000_000; // 0.003 SOL: fees plus the temporary SOL account a swap opens and closes
const SALE_USD = 20;

export type SellResult = { result: "pass" | "warn" | "fail" | "info"; detail: string };

// Errors that mean the token itself stops the sale, as opposed to the test wallet lacking SOL or the market moving.
const BLOCKED = /frozen|AccountFrozen|0x11\b|transfer hook|TransferHook|non-?transferable|NonTransferable|owner does not match/i;
const NOT_THE_TOKEN = /insufficient (lamports|funds)|0x1\b|Attempt to debit an account but found no record|slippage|0x1771|0x1788|SlippageToleranceExceeded|blockhash/i;

// Does Jupiter's router say the token can't be traded at all? Asks for a quote selling 0.01% of the supply into SOL,
// with no wallet needed (the sell test above needs a holder with SOL, which a dead token rarely has). true only on
// Jupiter's own "no market" answers; false when it quotes; null when it can't be asked (down, rate-limited).
const NO_MARKET = /TOKEN_NOT_TRADABLE|COULD_NOT_FIND_ANY_ROUTE|NO_ROUTES_FOUND/;
export async function jupiterSaysNotTradable(ctx: ToolContext, mint: string, rawSupply: bigint): Promise<boolean | null> {
  const amount = rawSupply / 10_000n > 0n ? rawSupply / 10_000n : 1n;
  try {
    const quote = await ctx.fetchJson(`${JUP()}/quote?inputMint=${mint}&outputMint=${NATIVE_MINT}&amount=${amount}&slippageBps=2000`, 10_000);
    return quote?.outAmount ? false : null;
  } catch (e: any) {
    return NO_MARKET.test(String(e?.message)) ? true : null;
  }
}

async function sellers(conn: Connection, mint: PublicKey): Promise<{ owner: PublicKey; tokenAccount: PublicKey; raw: bigint }[]> {
  const largest = await conn.getTokenLargestAccounts(mint, "confirmed");
  const accounts = largest.value.filter((a) => BigInt(a.amount) > 0n).slice(0, 12);
  if (!accounts.length) return [];
  const parsed = await conn.getMultipleParsedAccounts(accounts.map((a) => a.address), { commitment: "confirmed" });
  const candidates = accounts.map((a, i) => {
    const info: any = (parsed.value[i]?.data as any)?.parsed?.info;
    const owner = info?.owner ? new PublicKey(info.owner) : null;
    // Pools and programs own their token accounts through addresses no one can sign for; skip those.
    return owner && PublicKey.isOnCurve(owner.toBytes()) && info?.state !== "frozen" ? { owner, tokenAccount: a.address, raw: BigInt(a.amount) } : null;
  }).filter((c): c is NonNullable<typeof c> => c !== null);
  if (!candidates.length) return [];
  const balances = await conn.getMultipleAccountsInfo(candidates.map((c) => c.owner), "confirmed");
  return candidates.filter((_, i) => (balances[i]?.lamports ?? 0) >= MIN_FEE_LAMPORTS && balances[i]?.owner.equals(new PublicKey("11111111111111111111111111111111")));
}

export async function sellCheck(ctx: ToolContext, conn: Connection, mint: string, decimals: number, usdPrice: number | null): Promise<SellResult> {
  if (!ctx.postJson) return { result: "info", detail: "Sell test not available here." };
  if (mint === NATIVE_MINT) return { result: "info", detail: "Wrapped SOL is SOL; nothing to sell into." };
  let holders;
  try { holders = await sellers(conn, new PublicKey(mint)); }
  catch { return { result: "info", detail: "Sell test skipped: the token's holders could not be read right now." }; }
  if (!holders.length) return { result: "info", detail: "Sell test skipped: no ordinary wallet holding this token had enough SOL to test a sale with." };

  for (const holder of holders.slice(0, 3)) {
    // A small sale (about $20, or 1% of the holder's balance when there's no price), never more than they hold.
    const wanted = usdPrice && usdPrice > 0 ? BigInt(Math.floor((SALE_USD / usdPrice) * 10 ** decimals)) : holder.raw / 100n;
    const amount = wanted > 0n && wanted < holder.raw ? wanted : holder.raw / 2n || holder.raw;
    let quote;
    try {
      quote = await ctx.fetchJson(`${JUP()}/quote?inputMint=${mint}&outputMint=${NATIVE_MINT}&amount=${amount}&slippageBps=2000&restrictIntermediateTokens=true`, 10_000);
    } catch (e: any) {
      if (/HTTP 400/.test(String(e?.message))) return { result: "warn", detail: "Jupiter found no route to sell this token for SOL. You may not be able to sell it." };
      return { result: "info", detail: "Sell test skipped: Jupiter's quote service could not be reached." };
    }
    if (!quote?.outAmount) return { result: "warn", detail: "Jupiter found no route to sell this token for SOL. You may not be able to sell it." };
    let built;
    try {
      built = await ctx.postJson(`${JUP()}/swap`, { quoteResponse: quote, userPublicKey: holder.owner.toBase58(), wrapAndUnwrapSol: true, dynamicComputeUnitLimit: true }, 10_000);
    } catch { return { result: "info", detail: "Sell test skipped: Jupiter could not build the sale right now." }; }
    if (typeof built?.swapTransaction !== "string") return { result: "info", detail: "Sell test skipped: Jupiter could not build the sale right now." };
    const tx = VersionedTransaction.deserialize(Buffer.from(built.swapTransaction, "base64"));
    const sim = await conn.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true, commitment: "confirmed" });
    const logs = (sim.value.logs ?? []).join("\n");
    const err = sim.value.err ? JSON.stringify(sim.value.err) : "";
    const sold = (Number(amount) / 10 ** decimals).toLocaleString("en-US", { maximumFractionDigits: 4 });
    const who = `${holder.owner.toBase58().slice(0, 4)}…${holder.owner.toBase58().slice(-4)}`;
    if (!err) return { result: "pass", detail: `A real holder (${who}) selling ${sold} tokens for SOL succeeded in a mainnet simulation.` };
    const reason = `${err} ${logs}`;
    if (BLOCKED.test(reason)) return { result: "fail", detail: `Selling is blocked: a real holder's (${who}) sale failed in simulation because the token stopped the transfer.` };
    if (NOT_THE_TOKEN.test(reason)) continue; // the test wallet's problem, not the token's: try the next holder
    return { result: "warn", detail: `A real holder's (${who}) sale failed in simulation (${err.slice(0, 80)}). Selling may be restricted.` };
  }
  return { result: "info", detail: "Sell test inconclusive: the test sales failed for reasons unrelated to the token (fees or price movement)." };
}
