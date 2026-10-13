// Wallet overview: one call instead of balance + holdings + activity, with USD values.
import { z } from "zod";
import { getRecentTransactions, getSolanaBalance, getTokenAccounts } from "./basic";
import { EXAMPLE_WALLET, jupSearch, NATIVE_MINT, NETWORK_DOC } from "./lib";
import type { ToolDef } from "./types";

export const walletSnapshot: ToolDef = {
  name: "wallet",
  oldName: "wallet_snapshot",
  title: "What's in this wallet",
  category: "wallets",
  benefit: { kind: "accuracy", text: "Keeps priced and unpriced, verified and unverified holdings apart, so spam airdrops don't inflate what a wallet is worth." },
  useWhen: "Run when asked what a wallet holds or is worth. One call instead of balance + tokens + history, and spam is kept out of the total.",
  description: "SOL balance, top tokens with USD values, estimated total worth, and recent activity, in one answer.",
  inputs: { wallet: z.string(), network: z.enum(["mainnet-beta", "devnet"]).optional().default("mainnet-beta") },
  inputDocs: [
    { name: "wallet", type: "string (base58 address)", required: true, lookingFor: "The wallet address to sum up.", whereToGet: "The user's wallet address." },
    NETWORK_DOC,
  ],
  outputs: [
    { field: "sol", type: "string", is: "SOL balance.", howWorkedOut: "The balance tool." },
    { field: "sol_usd", type: "number | null", is: "USD value of the SOL.", howWorkedOut: "sol x Jupiter's SOL price, rounded to cents." },
    { field: "tokens_usd", type: "number", is: "USD value of the verified, priced tokens among the top 10.", howWorkedOut: "The tokens tool's total_usd for the top 10 (unverified tokens left out)." },
    { field: "unverified_usd", type: "number", is: "Claimed USD value of unverified top tokens, kept out of the total because spam often carries a fake price.", howWorkedOut: "The tokens tool's unverified_usd for the top 10." },
    { field: "total_usd", type: "number", is: "Estimated total worth: SOL plus verified, priced top tokens.", howWorkedOut: "sol_usd + tokens_usd. Unverified tokens, unpriced tokens and anything outside the top 10 aren't counted." },
    { field: "partial", type: "boolean", is: "True when the total leaves something out (unpriced or unverified tokens, or more tokens than shown).", howWorkedOut: "A top token has no price or isn't verified, or the wallet holds more tokens than returned." },
    { field: "token_count", type: "number", is: "How many token accounts with a balance the wallet has.", howWorkedOut: "The tokens tool's accounts_with_balance." },
    { field: "unverified_count", type: "number", is: "Top tokens that aren't verified (maybe spam or scams). Don't present these as real value.", howWorkedOut: "The tokens tool's unverified_count for the top 10." },
    { field: "top_tokens[]", type: "object[]", is: "Up to 10 tokens, highest USD value first, with address, symbol, amount, verified and value.", howWorkedOut: "The tokens tool with how_many 10. Fields explained there." },
    { field: "activity.checked / failed", type: "number", is: "Recent transactions looked at, and how many failed.", howWorkedOut: "The history tool with how_many 10." },
    { field: "activity.last_active", type: "string | null", is: "When the latest transaction happened (UTC).", howWorkedOut: "Time of the newest transaction." },
  ],
  example: async () => ({ wallet: EXAMPLE_WALLET }),
  run: async ({ wallet, network }, ctx) => {
    const [balance, tokens, recent, solPrice] = await Promise.all([
      getSolanaBalance.run({ wallet, network }, ctx),
      getTokenAccounts.run({ wallet, network, how_many: 10, include_empty: false }, ctx),
      getRecentTransactions.run({ wallet, network, how_many: 10 }, ctx),
      jupSearch(ctx, NATIVE_MINT).then((r) => r.find((t) => t.id === NATIVE_MINT)?.usdPrice ?? null),
    ]) as any[];
    const solUsd = typeof solPrice === "number" ? Math.round(Number(balance.sol) * solPrice * 100) / 100 : null;
    const tokensUsd = tokens.total_usd as number;
    const partial = tokens.tokens.some((t: any) => t.usd_value === null || !t.verified) || tokens.accounts_with_balance > tokens.returned;
    return {
      wallet: balance.wallet, network, sol: balance.sol, sol_usd: solUsd, tokens_usd: tokensUsd, unverified_usd: tokens.unverified_usd,
      total_usd: Math.round(((solUsd ?? 0) + tokensUsd) * 100) / 100, partial,
      token_count: tokens.accounts_with_balance, unverified_count: tokens.unverified_count, top_tokens: tokens.tokens,
      activity: { checked: recent.count, failed: recent.failed_count, last_active: recent.transactions[0]?.time ?? null },
    };
  },
};

export const WALLET_TOOLS = [walletSnapshot];
