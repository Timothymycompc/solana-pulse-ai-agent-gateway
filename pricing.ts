// Single source of truth for tool prices. Every tool is either free (rate-limited)
// or paid in USDC via x402 after FREE_CALLS_PER_TOOL free calls per caller.

export const FREE_CALLS_PER_TOOL = 3;

// Prices are USD strings understood by x402 ("$0.001" settles as 1000 base units of USDC).
export type ToolPrice = null | "$0.001" | "$0.005" | "$0.01";

export const TOOL_PRICES: Record<string, ToolPrice> = {
  // Free: basic reads and mistake-preventing helpers. Rate-limited per IP.
  get_solana_balance: null,
  get_token_accounts: null,
  get_recent_transactions: null,
  get_solana_blockhash: null,
  find_ata: null,
  inspect_address: null,
  convert_amount: null,
  explain_error: null,
  // $0.001: lookups that combine sources.
  resolve_token: "$0.001",
  fee_advice: "$0.001",
  wallet_snapshot: "$0.001",
  // $0.005: transaction forensics.
  explain_transaction: "$0.005",
  // $0.01: decisions that protect funds.
  token_verdict: "$0.01",
  preflight_transaction: "$0.01",
  check_transaction_intent: "$0.01",
};

// Every tool is served at /api/tools/<name> over HTTP and by name over MCP; both share pricing and free calls.
export const TOOL_ROUTE_PREFIX = "/api/tools/";
export const toolForRoute = (path: string) => (path.startsWith(TOOL_ROUTE_PREFIX) ? path.slice(TOOL_ROUTE_PREFIX.length).split("/")[0] : path);

export const priceOf = (tool: string): ToolPrice => (tool in TOOL_PRICES ? TOOL_PRICES[tool] : "$0.001");

export const priceLabel = (tool: string): string => {
  const price = priceOf(tool);
  return price ? `${FREE_CALLS_PER_TOOL} free calls, then ${price} USDC per call via x402` : "Free (rate-limited)";
};
