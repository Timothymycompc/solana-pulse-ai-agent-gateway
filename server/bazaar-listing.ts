// How each paid tool reads in x402 directories (Coinbase's Bazaar, PayAI). Bazaar's search is hybrid (keywords +
// meaning) over the description and tags, so each listing opens with the words an agent searching for that job types,
// then the tool's own use-when line and description. On 2026-11-13 Pulse was missing from searches such as "token
// safety solana" and "solana transaction check", while competitors led with those phrases; Pulse led with "Run on
// every transaction before signing..." and was tagged "mcp" and "ai-agents", which no one searches for.
// Every lead says only what the tool's own description already says. Tags: at most 5, each at most 32 characters.
export const BAZAAR_LISTING: Record<string, { lead: string; tags: [string, string, string, string, string] }> = {
  check_tx: { lead: "Solana pre-sign transaction check: simulate an unsigned transaction on mainnet and catch drainers before signing.", tags: ["solana", "pre-sign check", "transaction simulation", "drainer protection", "wallet security"] },
  tx_matches: { lead: "Verify a Solana transfer or swap does exactly what was asked (token, amount, recipient) before signing.", tags: ["solana", "intent verification", "swap verification", "transfer check", "pre-sign check"] },
  token_safety: { lead: "Solana token safety check and rug check: is this token safe to buy? SAFE, CAUTION or AVOID with reasons.", tags: ["solana", "token safety", "rug check", "is this token safe", "honeypot check"] },
  build_tx: { lead: "Build a Solana SOL or token transfer, or a Jupiter swap, as an unsigned transaction that is already safety-checked.", tags: ["solana", "build transaction", "jupiter swap", "token transfer", "unsigned transaction"] },
  explain_tx: { lead: "Explain a Solana transaction in plain words: what each wallet gained and lost, fee, programs, and why it failed.", tags: ["solana", "explain transaction", "transaction decoder", "balance changes", "transaction parser"] },
  why_failed: { lead: "Why did my Solana transaction fail? Turns a Solana error or custom program error code into the cause and fix.", tags: ["solana", "transaction error", "custom program error", "debug transaction", "error decoder"] },
  trace: { lead: "Trace a drained Solana wallet: follow the money and flag sweeper, pass-through and drain patterns with evidence.", tags: ["solana", "wallet drain", "trace funds", "scam investigation", "follow the money"] },
  token_traders: { lead: "Solana token launch analysis: snipers, the pool creator and the most profitable early traders of a token.", tags: ["solana", "sniper detection", "early buyers", "memecoin launch", "token traders"] },
  find_token: { lead: "Find the real Solana token address for a ticker or name, and spot copycat tokens using the same ticker.", tags: ["solana", "token address lookup", "ticker to mint", "copycat token", "token search"] },
  wallet: { lead: "Solana wallet summary: SOL balance, top tokens with USD values, estimated total worth and recent activity.", tags: ["solana", "wallet portfolio", "wallet value", "wallet summary", "token holdings"] },
  tokens: { lead: "Solana wallet token balances (SPL Token and Token-2022) with USD values; spam airdrop tokens flagged.", tags: ["solana", "token balances", "spl token", "spam token filter", "wallet holdings"] },
  balance: { lead: "Solana SOL balance of any wallet, read live from mainnet.", tags: ["solana", "sol balance", "wallet balance", "solana rpc", "lamports"] },
  history: { lead: "Solana wallet transaction history: latest transactions, whether each worked, and plain error names.", tags: ["solana", "transaction history", "wallet activity", "transaction signatures", "solana rpc"] },
  blockhash: { lead: "Fresh Solana blockhash for building a transaction, with how long it has before it expires.", tags: ["solana", "recent blockhash", "blockhash expiry", "build transaction", "solana rpc"] },
  fee: { lead: "Solana priority fee estimate: cheap, normal and fast prices in micro-lamports per compute unit, and total in SOL.", tags: ["solana", "priority fee", "gas estimate", "compute units", "transaction fee"] },
  token_account: { lead: "Solana associated token account (ATA) address for a wallet and token, whether it exists, and its cost to create.", tags: ["solana", "associated token account", "ata address", "spl token", "token account"] },
  whats_this: { lead: "What is this Solana address? Wallet, PDA, token, token account, program or stake account, before sending to it.", tags: ["solana", "address lookup", "address type", "send safety", "pda"] },
  convert: { lead: "Convert Solana token amounts between normal units and raw base units using the token's on-chain decimals.", tags: ["solana", "token decimals", "amount conversion", "raw units", "spl token"] },
  tx_version: { lead: "Solana transaction version check: legacy, v0 or v1, and which RPC settings and libraries can read it.", tags: ["solana", "transaction version", "versioned transaction", "v0 transaction", "rpc compatibility"] },
};
