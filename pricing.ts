// Single source of truth for tool prices. Every tool is either free (rate-limited)
// or paid in USDC via x402 after FREE_CALLS_PER_TOOL free calls per caller.

export const FREE_CALLS_PER_TOOL = 3;

// Prices are USD strings understood by x402 ("$0.001" settles as 1000 base units of USDC).
export type ToolPrice = null | "$0.001" | "$0.005" | "$0.01";

export const TOOL_PRICES: Record<string, ToolPrice> = {
  // Free: basic reads any RPC offers. Rate-limited per IP.
  get_solana_balance: null,
  get_solana_blockhash: null,
  get_token_accounts: null,
  get_recent_transactions: null,
  find_ata: null,
  inspect_address: null,
  // $0.001: snapshots, market data, fees, simulation.
  get_wallet_snapshot: "$0.001",
  summarize_wallet_activity: "$0.001",
  resolve_token_symbol: "$0.001",
  get_token_market_snapshot: "$0.001",
  optimal_fee: "$0.001",
  simulate_solana_transaction: "$0.001",
  estimate_transaction_cost: "$0.001",
  // $0.005: decoding and token/portfolio analysis.
  decode_tx: "$0.005",
  explain_transaction_effects: "$0.005",
  token_profile: "$0.005",
  analyze_token_concentration: "$0.005",
  compare_tokens: "$0.005",
  analyze_wallet_portfolio: "$0.005",
  // $0.01: pre-sign transaction check.
  validate_transaction: "$0.01",
};

// HTTP routes share pricing and free calls with the MCP tool that does the same job.
export const HTTP_ROUTE_TOOLS: Record<string, string> = {
  "/api/solana/balance": "get_solana_balance",
  "/api/solana/blockhash": "get_solana_blockhash",
  "/api/solana/token-accounts": "get_token_accounts",
  "/api/solana/transactions": "get_recent_transactions",
  "/api/solana/simulate": "simulate_solana_transaction",
  "/api/solana/validate-and-simulate": "validate_transaction",
  "/api/solana/find-ata": "find_ata",
  "/api/solana/token-profile": "token_profile",
  "/api/solana/optimal-fee": "optimal_fee",
  "/api/solana/decode-tx": "decode_tx",
};

export const toolForRoute = (path: string) => HTTP_ROUTE_TOOLS[path] || path;

export const priceOf = (tool: string): ToolPrice => (tool in TOOL_PRICES ? TOOL_PRICES[tool] : "$0.001");

// Short wording used in tool descriptions, mcp.json and llms.txt.
export const priceLabel = (tool: string): string => {
  const price = priceOf(tool);
  return price ? `${FREE_CALLS_PER_TOOL} free calls, then ${price} USDC per call via x402` : "Free (rate-limited)";
};
