// toolRegistry.ts: single source of truth for every public fact about each MCP tool.
// server.ts takes descriptions and free/paid status from here; llms.txt, mcp.json and
// check-discovery.ts are generated or checked from it. Change a fact HERE only.

export const PRICE_LAMPORTS = 2_200_000;
export const LAMPORTS_PER_SOL = 1_000_000_000;
export const PRICE_SOL = PRICE_LAMPORTS / LAMPORTS_PER_SOL; // derived: lamports stay authoritative
// Verified in server.ts: apiLimiter (/api, /mcp) and freeLimiter are both 120/min, keyed by client IP (trust proxy = 1).
export const RATE_LIMIT = "120 requests per minute per IP address";
export const TRUST_STATEMENT =
  "These tools do not sign or broadcast Solana transactions. They read Solana state; paid calls also update gateway-side credit usage. Results are informational and do not guarantee future transaction outcomes.";

export type Param = {
  name: string;
  required: boolean;
  type: "string" | "number";
  default?: string | number;
  description: string;
};

export type ToolDef = {
  name: string;
  summary: string; // what it does
  useCases: string[]; // problems it solves
  useWhen: string; // one-line routing guidance for an agent
  avoidWhen: string[]; // when an agent should not use it
  params: Param[]; // required and optional inputs, defaults and limits
  returns: string; // one line
  responseFields: string[]; // exact fields of the response
  exampleRequest: Record<string, unknown>;
  exampleResult: Record<string, unknown>; // real shape, placeholder values
  priceLamports: number; // 0 = free
  auth: "none" | "x-api-key";
  network: string;
  readOnly: boolean;
  destructive: boolean;
  idempotent: boolean;
  broadcasts: boolean; // true only if the tool can send a transaction to the network
  sideEffects: string;
  errors: string[]; // important failure cases
  limits: string[];
  trust: string; // what the result does NOT prove
};

const SAFE = { readOnly: true, destructive: false, idempotent: true, broadcasts: false } as const;
const FREE = { priceLamports: 0, auth: "none" } as const;
const PAID = { priceLamports: PRICE_LAMPORTS, auth: "x-api-key" } as const;

const NET_TEXT =
  'Accepts network "mainnet-beta" (default, real funds) or "devnet" (test network); the result reflects only the chosen cluster.';
const NETWORK: Param = {
  name: "network",
  required: false,
  type: "string",
  default: "mainnet-beta",
  description: 'Cluster to query: "mainnet-beta" (real funds; the default) or "devnet" (test network).',
};
const wallet = (d: string): Param => ({ name: "wallet", required: true, type: "string", description: d });
const txParam = (verb: string): Param => ({
  name: "transaction",
  required: true,
  type: "string",
  description: `The transaction to ${verb}: base64-encoded serialized VersionedTransaction (not a legacy Transaction), signed or unsigned.`,
});
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const FREE_SIDE = "None. Read-only; no credits are used and nothing is written or sent.";
const PAID_SIDE = "Uses 1 credit per call. Read-only against Solana; nothing is written or sent.";
const RATE = `Rate limit: ${RATE_LIMIT}.`;
const ERR_INPUT = "Malformed or unknown input, or an unreachable RPC, returns an error result (isError) with the message 'Error: <reason>'.";
const ERR_PAY =
  "No valid x-api-key or no credits: a payment-required error (isError) with {error, priceLamports, payTo, note}; nothing is charged.";
const ERR_REFUND =
  "Tool errors (isError results, including malformed input and RPC failures) are refunded automatically. A completed check that reports a problem is a normal result and is charged.";

export const TOOLS: ToolDef[] = [
  {
    name: "get_solana_balance", ...SAFE, ...FREE,
    summary: "Get a wallet's current SOL balance.",
    useCases: ["Check a wallet can cover a transfer or fee", "Confirm that funds arrived"],
    useWhen: "I need to check a Solana wallet's SOL balance.",
    avoidWhen: ["you need token balances (use get_token_accounts)"],
    params: [wallet("Wallet whose SOL balance to read: base58 public key, 32-44 characters."), NETWORK],
    returns: "{wallet, network, balance_sol}",
    responseFields: ["wallet", "network", "balance_sol"],
    exampleRequest: { wallet: "<wallet address>" },
    exampleResult: { wallet: "<wallet address>", network: "mainnet-beta", balance_sol: "<number>" },
    network: NET_TEXT, sideEffects: FREE_SIDE,
    errors: [ERR_INPUT],
    limits: [RATE],
    trust: "A balance is a snapshot at the moment of the call; it can change before you act on it.",
  },
  {
    name: "get_solana_blockhash", ...SAFE, ...FREE,
    summary: "Get the latest finalized blockhash.",
    useCases: ["Build a transaction you will sign and send yourself; a transaction is only valid with a recent blockhash"],
    useWhen: "I am building a transaction and need a fresh blockhash.",
    avoidWhen: ["you would reuse an old result; a blockhash expires after roughly a minute, so fetch it just before signing"],
    params: [NETWORK],
    returns: "{network, blockhash, timestamp}",
    responseFields: ["network", "blockhash", "timestamp (when the gateway fetched it, not the blockhash's age)"],
    exampleRequest: { network: "mainnet-beta" },
    exampleResult: { network: "mainnet-beta", blockhash: "<base58 blockhash>", timestamp: "<ISO time of the fetch>" },
    network: NET_TEXT, sideEffects: FREE_SIDE,
    errors: [ERR_INPUT],
    limits: [RATE],
    trust: "The blockhash is finalized at fetch time and still expires; this tool cannot tell you how long it stays valid.",
  },
  {
    name: "get_token_accounts", ...SAFE, ...FREE,
    summary: "List every SPL token account a wallet owns: account address, mint, balance, decimals.",
    useCases: ["See what tokens a wallet holds before swapping or sending"],
    useWhen: "I need to see which SPL tokens a wallet holds.",
    avoidWhen: ["you only need SOL (use get_solana_balance)"],
    params: [wallet("Wallet whose token accounts to list: base58 public key, 32-44 characters."), NETWORK],
    returns: "{wallet, tokenCount, tokens}",
    responseFields: ["wallet", "tokenCount", "tokens (each: account address, mint, balance, decimals)"],
    exampleRequest: { wallet: "<wallet address>" },
    exampleResult: { wallet: "<wallet address>", tokenCount: "<number>", tokens: ["<account address, mint, balance, decimals>"] },
    network: NET_TEXT, sideEffects: FREE_SIDE,
    errors: [ERR_INPUT],
    limits: [RATE],
    trust: "Lists accounts that exist now; it says nothing about whether a token is legitimate (use token_profile for authorities).",
  },
  {
    name: "get_recent_transactions", ...SAFE, ...FREE,
    summary: "List a wallet's most recent transaction signatures, newest first, with slot, time and error status.",
    useCases: ["Find a transaction to inspect with decode_tx", "See a wallet's latest activity"],
    useWhen: "I need a wallet's latest transaction signatures.",
    avoidWhen: ["you need to know what a transaction did (pass its signature to decode_tx)"],
    params: [
      wallet("Wallet whose transaction history to list: base58 public key, 32-44 characters."),
      { name: "limit", required: false, type: "number", default: 10, description: "How many signatures to return, newest first: integer 1-1000." },
      NETWORK,
    ],
    returns: "{wallet, count, signatures}",
    responseFields: ["wallet", "count", "signatures (each: signature, slot, time, error status)"],
    exampleRequest: { wallet: "<wallet address>", limit: 5 },
    exampleResult: { wallet: "<wallet address>", count: 5, signatures: ["<signature, slot, time, error status>"] },
    network: NET_TEXT, sideEffects: FREE_SIDE,
    errors: [ERR_INPUT],
    limits: ["limit is an integer 1-1000 (default 10).", RATE],
    trust: "Signatures only; it does not explain what each transaction did.",
  },
  {
    name: "simulate_solana_transaction", ...SAFE, ...PAID,
    summary: "Dry-run a transaction against live chain state without sending it.",
    useCases: ["Test a transaction and read its program logs and compute units"],
    useWhen: "I want raw simulation output (logs, error, compute units) for a transaction.",
    avoidWhen: ["you want a SAFE or UNSAFE verdict with fix hints (use validate_transaction)"],
    params: [txParam("test"), NETWORK],
    returns: "{network, success, error, logs, unitsConsumed}",
    responseFields: ["network", "success", "error (null when none)", "logs", "unitsConsumed"],
    exampleRequest: { transaction: "<base64 transaction>" },
    exampleResult: { network: "mainnet-beta", success: true, error: null, logs: ["<program log lines>"], unitsConsumed: "<number>" },
    network: NET_TEXT, sideEffects: PAID_SIDE,
    errors: [ERR_INPUT, ERR_PAY, ERR_REFUND],
    limits: [RATE],
    trust: "Nothing is broadcast. A passing dry run does not guarantee the same result when the transaction is later sent.",
  },
  {
    name: "find_ata", ...SAFE, ...FREE,
    summary: "Derive the Associated Token Account (ATA) address for a wallet and token mint, and say whether it already exists on-chain.",
    useCases: ["Know the destination account before sending SPL tokens", "Check whether a token account must be created first"],
    useWhen: "I am about to send an SPL token and need the recipient's token account.",
    avoidWhen: ["the owner is a program-derived address; pass a regular wallet address"],
    params: [
      wallet("Owner of the token account: a regular wallet address (base58 public key, 32-44 characters), not a program-derived address."),
      { name: "mint", required: true, type: "string", description: "Token mint address: base58, 32-44 characters." },
      NETWORK,
    ],
    returns: "{owner, mint, ataAddress, exists, network}",
    responseFields: ["owner", "mint", "ataAddress", "exists", "network"],
    exampleRequest: { wallet: "<wallet address>", mint: USDC },
    exampleResult: { owner: "<wallet address>", mint: USDC, ataAddress: "<derived ATA address>", exists: "<true or false>", network: "mainnet-beta" },
    network: NET_TEXT, sideEffects: FREE_SIDE,
    errors: [ERR_INPUT],
    limits: [RATE],
    trust: "The address is derived, not created. exists=false means the account must be created before tokens can be sent to it.",
  },
  {
    name: "token_profile", ...SAFE, ...PAID,
    summary: "Live safety profile of an SPL token: decimals, supply, freeze and mint authority, a risk level, and the top 10 holders.",
    useCases: ["Check an unfamiliar token before buying or recommending it"],
    useWhen: "I need to analyze a token: authorities, supply and holder concentration.",
    avoidWhen: ["you have only a ticker symbol (pass the mint address)", "you need proof a token is safe or a scam (it cannot give that)"],
    params: [
      { name: "mint", required: true, type: "string", description: "Token mint address: base58, 32-44 characters. Pass the mint, not a ticker symbol." },
      NETWORK,
    ],
    returns: "{mint, decimals, supply, freezeAuthority, mintAuthority, security, topHolders, topHoldersNote, network}",
    responseFields: [
      "mint", "decimals", "supply_raw", "supply_formatted", "freezeAuthority", "mintAuthority",
      "security {isHoneypotRisk, freezeAuthorityEnabled, mintAuthorityEnabled, riskLevel HIGH|LOW, analysis}",
      "topHolders (up to 10: address, amount_raw, amount_formatted)", "topHoldersNote (set when holders were unavailable)", "network", "cached (true on a cache hit)",
    ],
    exampleRequest: { mint: USDC },
    exampleResult: {
      mint: USDC, decimals: "<number>", supply_formatted: "<number>", freezeAuthority: "<address or null>", mintAuthority: "<address or null>",
      security: { riskLevel: "HIGH or LOW", freezeAuthorityEnabled: "<true or false>", mintAuthorityEnabled: "<true or false>", analysis: "<text>" },
      topHolders: ["<address, amount_raw, amount_formatted>"], network: "mainnet-beta",
    },
    network: NET_TEXT, sideEffects: PAID_SIDE,
    errors: [
      "Error: That is not a valid mint address", "Error: Mint not found", "Error: This address exists but is not a token mint",
      "Error: The Solana RPC was too slow to answer. Try again in a moment.", ERR_PAY, ERR_REFUND,
    ],
    limits: ["Results are cached for 60 seconds.", "Top holders can be missing when the RPC is slow (see topHoldersNote).", RATE],
    trust:
      "Reports authorities and holder concentration only. riskLevel is HIGH when a freeze authority exists and LOW otherwise; LOW does not cover an active mint authority (supply can still be inflated). The field security.isHoneypotRisk is an authority-based heuristic (true when a freeze authority exists), not a honeypot detector. It does not prove a token is or is not a honeypot or scam.",
  },
  {
    name: "optimal_fee", ...SAFE, ...PAID,
    summary: "Live priority-fee recommendation for current congestion: low, medium and high tiers in micro-lamports per compute unit with estimated confirmation times, plus min, max and average.",
    useCases: ["Pick a priority fee just before sending so the transaction lands without overpaying"],
    useWhen: "I am about to send a transaction and need a priority fee.",
    avoidWhen: ["you want it hours in advance; congestion changes quickly"],
    params: [NETWORK],
    returns: "{network, current_congestion, tiers, raw_stats, llm_advice}",
    responseFields: [
      "network", "current_congestion (HIGH, MODERATE or LOW)", "tiers.low|medium|high (each: lamports, description, estimated_time)",
      "raw_stats {min, max, average, sample_size}", "llm_advice",
    ],
    exampleRequest: { network: "mainnet-beta" },
    exampleResult: {
      network: "mainnet-beta", current_congestion: "HIGH, MODERATE or LOW",
      tiers: { low: { lamports: "<number>", estimated_time: "15-60 seconds" }, medium: { lamports: "<number>", estimated_time: "5-15 seconds" }, high: { lamports: "<number>", estimated_time: "1-5 seconds" } },
      raw_stats: { min: "<number>", max: "<number>", average: "<number>", sample_size: "<number>" }, llm_advice: "<text>",
    },
    network: NET_TEXT, sideEffects: PAID_SIDE,
    errors: ["Error: Could not fetch prioritization fees from cluster", ERR_INPUT, ERR_PAY, ERR_REFUND],
    limits: [RATE],
    trust: "An estimate from recent network activity (the tier values are per compute unit); congestion can change before your transaction lands, and confirmation times are approximate.",
  },
  {
    name: "decode_tx", ...SAFE, ...PAID,
    summary: "Explain a confirmed transaction in plain language: category, success or failure, fee, slot, time, each account's SOL balance change, and raw logs.",
    useCases: ["Check what a transaction actually did", "Summarize a swap or transfer for a user"],
    useWhen: "I have a confirmed transaction signature and need to know what it did.",
    avoidWhen: ["the transaction is not confirmed yet", "you need token-level balance changes (only SOL changes are listed)"],
    params: [
      { name: "signature", required: true, type: "string", description: "Signature of a confirmed transaction: base58 string, about 88 characters; get one from get_recent_transactions." },
      NETWORK,
    ],
    returns: "{signature, network, summary, category, details, balance_changes, raw_logs, llm_context}",
    responseFields: [
      "signature", "network", "summary", "category", "details {slot, fee, timestamp, status SUCCESS|FAILED}",
      "balance_changes (each: address, deltaLamports, deltaSol; accounts with no change are omitted)", "raw_logs", "llm_context",
    ],
    exampleRequest: { signature: "<transaction signature>" },
    exampleResult: {
      signature: "<transaction signature>", network: "mainnet-beta", summary: "<text>", category: "<category>",
      details: { slot: "<number>", fee: "<lamports>", timestamp: "<unix time>", status: "SUCCESS or FAILED" },
      balance_changes: ["<address, deltaLamports, deltaSol>"], raw_logs: ["<log lines>"], llm_context: "<text>",
    },
    network: NET_TEXT, sideEffects: PAID_SIDE,
    errors: ["Error: Transaction not found or not yet confirmed", ERR_INPUT, ERR_PAY, ERR_REFUND],
    limits: [RATE],
    trust: "The category and summary are best-effort labels; the balance changes and raw logs are the facts. SOL changes only, not token balances.",
  },
  {
    name: "validate_transaction", ...SAFE, ...PAID,
    summary: "Pre-send safety check: decodes the transaction, checks the fee payer can pay fees, tests it against live chain state without sending, and returns a SAFE or UNSAFE verdict with issues (each with a code and fix hint).",
    useCases: ["Last check before signing an agent-built transaction", "Get actionable fix hints instead of raw logs"],
    useWhen: "I built a transaction and want a SAFE or UNSAFE verdict before signing it.",
    avoidWhen: ["you only want raw simulation output (use simulate_solana_transaction)"],
    params: [txParam("check"), NETWORK],
    returns: "{network, verdict, safe, issues, simulation}",
    responseFields: [
      "network", "verdict (SAFE or UNSAFE)", "safe (boolean)",
      "issues (each: severity ERROR|WARNING, code, message, fix)", "simulation {success, error, logs, unitsConsumed} (null when the transaction cannot be decoded)",
    ],
    exampleRequest: { transaction: "<base64 transaction>" },
    exampleResult: {
      network: "mainnet-beta", verdict: "SAFE or UNSAFE", safe: "<true or false>",
      issues: [{ severity: "ERROR or WARNING", code: "<e.g. INSUFFICIENT_FEE_PAYER_BALANCE>", message: "<text>", fix: "<text>" }],
      simulation: { success: "<true or false>", error: "<null or error>", logs: ["<log lines>"], unitsConsumed: "<number>" },
    },
    network: NET_TEXT, sideEffects: PAID_SIDE,
    errors: [
      "Undecodable input returns verdict UNSAFE with code MALFORMED_TRANSACTION (a normal, charged result)",
      "Issue codes include INSUFFICIENT_FEE_PAYER_BALANCE, FEE_PAYER_CHECK_FAILED (warning), INSUFFICIENT_RENT, INSUFFICIENT_BALANCE, ACCOUNT_NOT_FOUND, PROGRAM_ERROR, SIMULATION_FAILED",
      ERR_PAY, ERR_REFUND,
    ],
    limits: [RATE],
    trust:
      "Nothing is broadcast. The check runs without verifying signatures and substitutes a fresh blockhash, so an expired blockhash is not detected. SAFE means no issue was found against chain state at that moment; it does not guarantee the outcome or that the trade is a good one.",
  },
];

export const FREE_TOOL_NAMES: string[] = TOOLS.filter((t) => t.priceLamports === 0).map((t) => t.name);
export const PAID_TOOL_NAMES: string[] = TOOLS.filter((t) => t.priceLamports > 0).map((t) => t.name);
export const getTool = (name: string): ToolDef | undefined => TOOLS.find((t) => t.name === name);

export const costLine = (t: ToolDef): string =>
  t.priceLamports === 0
    ? "Cost: free."
    : `Cost: 1 credit (${PRICE_SOL} SOL), x-api-key header required; tool errors are refunded, a completed result is charged even if it reports a problem.`;

// Description shown to the model in tools/list: compact but complete.
export const buildDescription = (t: ToolDef): string =>
  [
    t.summary,
    t.useCases[0] ? `Use it to: ${t.useCases.join("; ")}.` : "",
    t.avoidWhen.length ? `Do not use it when ${t.avoidWhen.join("; or ")}.` : "",
    `Returns ${t.returns}.`,
    t.limits.filter((l) => !l.startsWith("Rate limit")).join(" "),
    t.trust,
    costLine(t),
    t.broadcasts || t.trust.includes("broadcast") ? "" : "Read-only: nothing is broadcast to the network.",
    'Network: "mainnet-beta" (default) or "devnet".',
    `Example: ${JSON.stringify(t.exampleRequest)}`,
  ]
    .filter(Boolean)
    .join(" ");
