// Single source of truth for tool prices. Every tool is free for FREE_CALLS_PER_TOOL calls per caller per UTC day,
// then paid in USDC via x402. A null price makes a tool free with no daily limit (none are, today).

export const FREE_CALLS_PER_TOOL = 25;
export const FREE_CALLS_RESET = "daily at 00:00 UTC";
export const FREE_CALLS_TEXT = `${FREE_CALLS_PER_TOOL} free calls a day`;

// Prices are USD strings understood by x402 ("$0.01" settles as 10000 base units of USDC). One cent is the floor:
// comparable Solana tools in Coinbase's x402 directory have a median price of about $0.01 (October 2026).
export type ToolPrice = null | "$0.01" | "$0.02";

export const TOOL_PRICES: Record<string, ToolPrice> = {
  // $0.01: basic reads, lookups, helpers and transaction forensics.
  balance: "$0.01",
  tokens: "$0.01",
  history: "$0.01",
  blockhash: "$0.01",
  token_account: "$0.01",
  whats_this: "$0.01",
  convert: "$0.01",
  why_failed: "$0.01",
  find_token: "$0.01",
  fee: "$0.01",
  wallet: "$0.01",
  explain_tx: "$0.01",
  // $0.02: decisions that protect funds.
  token_safety: "$0.02",
  check_tx: "$0.02",
  tx_matches: "$0.02",
};

// Every tool is served at /api/tools/<name> over HTTP and by name over MCP; both share pricing and free calls.
export const TOOL_ROUTE_PREFIX = "/api/tools/";
export const toolForRoute = (path: string) => (path.startsWith(TOOL_ROUTE_PREFIX) ? path.slice(TOOL_ROUTE_PREFIX.length).split("/")[0] : path);

export const priceOf = (tool: string): ToolPrice => (tool in TOOL_PRICES ? TOOL_PRICES[tool] : "$0.01");
