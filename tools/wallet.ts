// Wallet overview: one call instead of balance + holdings + activity, with USD values.
import { z } from "zod";
import { getRecentTransactions, getSolanaBalance, getTokenAccounts } from "./basic";
import { EXAMPLE_WALLET, jupSearch, NATIVE_MINT, NETWORK_DOC } from "./lib";
import type { ToolDef } from "./types";

export const walletSnapshot: ToolDef = {
  name: "wallet_snapshot",
  title: "Wallet snapshot",
  category: "wallets",
  useWhen: "Use when asked about a wallet's overall holdings or worth. One call replaces balance + tokens + activity lookups, and separates priced from unpriced and verified from unverified holdings so the total is not inflated by spam.",
  description: "SOL balance, top token holdings with USD values, total estimated value, and recent activity in one response.",
  inputs: { wallet: z.string(), network: z.enum(["mainnet-beta", "devnet"]).optional().default("mainnet-beta") },
  inputDocs: [
    { name: "wallet", type: "string (base58 address)", required: true, description: "The wallet to summarize.", howToGet: "The user's wallet address." },
    NETWORK_DOC,
  ],
  outputs: [
    { field: "sol", type: "string", meaning: "Native SOL balance.", howComputed: "get_solana_balance." },
    { field: "solValueUsd", type: "number | null", meaning: "USD value of the SOL.", howComputed: "sol x Jupiter's SOL price, rounded to cents." },
    { field: "tokenValueUsd", type: "number", meaning: "USD value of the priced tokens in the top holdings.", howComputed: "Sum of topHoldings[].valueUsd." },
    { field: "totalValueUsd", type: "number", meaning: "Estimated total worth (SOL plus priced top holdings).", howComputed: "solValueUsd + tokenValueUsd. Tokens without a price and holdings outside the top 10 are not counted." },
    { field: "isPartial", type: "boolean", meaning: "True when the total leaves something out (unpriced tokens or more holdings than shown).", howComputed: "Any top holding lacks a price, or the wallet has more non-empty token accounts than returned." },
    { field: "tokenAccounts", type: "number", meaning: "Non-empty token accounts the wallet holds.", howComputed: "get_token_accounts nonZeroAccounts." },
    { field: "unverifiedHoldings", type: "number", meaning: "Top holdings that are not verified (possible spam or scams). Do not present these as real value.", howComputed: "get_token_accounts unverifiedCount for the top 10." },
    { field: "topHoldings[]", type: "object[]", meaning: "Up to 10 holdings, highest USD value first, with mint, symbol, amount, verified flag and value.", howComputed: "get_token_accounts with limit 10; fields documented there." },
    { field: "activity.checked / failed", type: "number", meaning: "Recent transactions looked at and how many failed.", howComputed: "get_recent_transactions with limit 10." },
    { field: "activity.lastActiveAt", type: "string | null", meaning: "Time of the most recent transaction (UTC).", howComputed: "Time of the newest signature." },
  ],
  example: async () => ({ wallet: EXAMPLE_WALLET }),
  run: async ({ wallet, network }, ctx) => {
    const [balance, tokens, recent, solPrice] = await Promise.all([
      getSolanaBalance.run({ wallet, network }, ctx),
      getTokenAccounts.run({ wallet, network, limit: 10, includeZero: false }, ctx),
      getRecentTransactions.run({ wallet, network, limit: 10 }, ctx),
      jupSearch(ctx, NATIVE_MINT).then((r) => r.find((t) => t.id === NATIVE_MINT)?.usdPrice ?? null),
    ]) as any[];
    const solValueUsd = typeof solPrice === "number" ? Math.round(Number(balance.sol) * solPrice * 100) / 100 : null;
    const tokenValueUsd = tokens.totalValueUsd as number;
    const isPartial = tokens.tokens.some((t: any) => t.valueUsd === null) || tokens.nonZeroAccounts > tokens.returned;
    return {
      wallet: balance.wallet, network, sol: balance.sol, solValueUsd, tokenValueUsd,
      totalValueUsd: Math.round(((solValueUsd ?? 0) + tokenValueUsd) * 100) / 100, isPartial,
      tokenAccounts: tokens.nonZeroAccounts, unverifiedHoldings: tokens.unverifiedCount, topHoldings: tokens.tokens,
      activity: { checked: recent.count, failed: recent.failedCount, lastActiveAt: recent.transactions[0]?.time ?? null },
    };
  },
};

export const WALLET_TOOLS = [walletSnapshot];
