// toolGuide.ts: plain-language guidance rendered into llms.txt and mcp.json.
// Facts about price, auth and safety live in toolRegistry.ts; this file explains how to use each tool.
import { PRICE_LAMPORTS, RATE_LIMIT } from "./toolRegistry";

export type ErrorGuide = { when: string; youSee: string; fix: string };
export type Guide = {
  plain: string; // one friendly sentence
  inputHints: Record<string, string>; // where each input comes from, valid shape, common mistakes
  success: string; // how to read a good result
  errors: ErrorGuide[]; // every failure: cause, what appears, how to fix
  next: string; // what to call next
};

const WALLET_HINT = "The wallet's public address: 32-44 base58 characters, as shown by a wallet app or explorer. Not a token mint, not a transaction signature. Never send a private key or seed phrase to any tool.";
const NET_HINT = "Leave it out for mainnet-beta (real funds). Send devnet only for test wallets and test tokens; a devnet address or signature will not be found on mainnet.";
const TX_HINT = "Base64 text of a serialized VersionedTransaction (with web3.js: Buffer.from(tx.serialize()).toString('base64')). It may be unsigned. Not hex, not base58, not a legacy Transaction.";
const MINT_HINT = "The token's mint address (32-44 base58 characters), not its ticker. Take it from a source you trust; scam tokens copy real tickers.";

const E_MISSING: ErrorGuide = {
  when: "A required input is missing or has the wrong type",
  youSee: "MCP error -32602: Input validation error, naming the bad argument",
  fix: "Send every required input listed under Inputs, as a string unless it says number.",
};
const E_NETWORK: ErrorGuide = {
  when: "network is not exactly mainnet-beta or devnet (for example a typo)",
  youSee: 'MCP error -32602: Input validation error: expected one of "mainnet-beta"|"devnet" at network',
  fix: "Use the exact text mainnet-beta or devnet, or leave network out to get mainnet-beta.",
};
const E_RPC: ErrorGuide = {
  when: "The address or signature is not valid, or the Solana RPC cannot answer",
  youSee: "A result with isError true whose text starts with 'Error: ' and gives the reason",
  fix: "Check the input against Input hints. If the input is right, wait a few seconds and retry.",
};
const E_RATE: ErrorGuide = {
  when: `More than ${RATE_LIMIT} are sent`,
  youSee: "HTTP 429 with an error message",
  fix: "Wait for the next minute and retry; space your calls out.",
};
const E_PAY: ErrorGuide = {
  when: "No valid x-api-key was sent, or the key has no credits left",
  youSee: `A result with isError true containing {error, priceLamports: ${PRICE_LAMPORTS}, payTo, note}`,
  fix: "Sign in with your wallet to get a key, add credits by sending SOL to payTo, then retry with the x-api-key header. Nothing was charged.",
};
const E_BADTX: ErrorGuide = {
  when: "transaction is not valid base64 or not a serialized VersionedTransaction",
  youSee: "A result with isError true whose text starts with 'Error: '",
  fix: "Re-encode as base64 of a serialized VersionedTransaction. Tool errors are refunded automatically.",
};

export const GUIDES: Record<string, Guide> = {
  get_solana_balance: {
    plain: "Tells you how much SOL a wallet holds right now.",
    inputHints: { wallet: WALLET_HINT, network: NET_HINT },
    success: "balance_sol is in SOL (1 SOL = 1,000,000,000 lamports). 0 means the account is empty or has never received funds.",
    errors: [E_RPC, E_MISSING, E_NETWORK, E_RATE],
    next: "If the balance covers the amount plus fees, continue. For token balances call get_token_accounts.",
  },
  get_solana_blockhash: {
    plain: "Gives you a fresh blockhash to put in a transaction you are building.",
    inputHints: { network: NET_HINT },
    success: "blockhash is the value for your transaction's recent-blockhash field. timestamp is when the gateway fetched it, not the blockhash's age. Use it within about a minute; fetch a new one if you wait longer.",
    errors: [E_RPC, E_NETWORK, E_RATE],
    next: "Fetch it last, just before you sign, because validate_transaction does not detect an expired blockhash. Then sign and send the transaction yourself.",
  },
  get_token_accounts: {
    plain: "Lists every SPL token a wallet holds, with each token's account, mint, balance and decimals.",
    inputHints: { wallet: WALLET_HINT, network: NET_HINT },
    success: "tokenCount is how many token accounts exist. Each entry has the account address, the mint (the token's identity), balance and decimals. tokenCount 0 means the wallet holds no SPL tokens.",
    errors: [E_RPC, E_MISSING, E_NETWORK, E_RATE],
    next: "Pass an unfamiliar mint to token_profile. Before sending a token, call find_ata for the recipient.",
  },
  get_recent_transactions: {
    plain: "Lists a wallet's latest transactions, newest first, so you can pick one to inspect.",
    inputHints: {
      wallet: WALLET_HINT,
      limit: "Integer 1-1000, default 10. Ask only for what you need; large limits return large results.",
      network: NET_HINT,
    },
    success: "signatures are newest first, each with slot, time and error status. An error value marks a transaction that failed on-chain. count is how many were returned.",
    errors: [E_RPC, E_MISSING, E_NETWORK, E_RATE],
    next: "Pass a signature to decode_tx to see what that transaction did.",
  },
  simulate_solana_transaction: {
    plain: "Dry-runs a transaction against live chain state and shows the logs, error and compute used, without sending anything.",
    inputHints: { transaction: TX_HINT, network: NET_HINT },
    success: "success true with error null means the dry run passed. logs show each program's output. unitsConsumed is the compute used; use it to set your compute budget. success false with an error and logs means the transaction would fail: that is a normal result and is still charged.",
    errors: [E_PAY, E_BADTX, E_MISSING, E_NETWORK, E_RATE],
    next: "For a SAFE or UNSAFE verdict with fix hints use validate_transaction. When you are satisfied, sign and send the transaction yourself; this gateway never sends it.",
  },
  find_ata: {
    plain: "Works out which token account a wallet uses for a given token, and whether it already exists.",
    inputHints: {
      wallet: "The owner's regular wallet address (32-44 base58 characters), not a token account and not a program-derived address.",
      mint: "The token's mint address (32-44 base58 characters). Example: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v is USDC.",
      network: NET_HINT,
    },
    success: "ataAddress is the token account for that owner and mint. exists true means tokens can be sent to it. exists false means it must be created in the same transaction before tokens can arrive (add a create-associated-token-account instruction).",
    errors: [E_RPC, E_MISSING, E_NETWORK, E_RATE],
    next: "Use ataAddress as the destination of your token transfer, then fetch a blockhash, get a fee with optimal_fee, and check the transaction with validate_transaction.",
  },
  token_profile: {
    plain: "Checks who controls a token (freeze and mint authority), its supply, and who holds the most, before you buy or recommend it.",
    inputHints: { mint: MINT_HINT, network: NET_HINT },
    success: "riskLevel HIGH means a freeze authority exists, so holders can be frozen. LOW means no freeze authority, but check mintAuthority: if it is not null, supply can still be inflated. topHolders lists up to 10 holders; if they are missing, topHoldersNote says why. cached true means the result is up to 60 seconds old. security.isHoneypotRisk only means a freeze authority exists; it does not detect honeypots.",
    errors: [
      { when: "The input is not a valid address", youSee: "Error: That is not a valid mint address", fix: "Pass the mint address, not a ticker or a wallet address." },
      { when: "No account exists at that address on the chosen network", youSee: "Error: Mint not found", fix: "Check the address and the network; a devnet mint is not found on mainnet." },
      { when: "The address is an account but not a token mint", youSee: "Error: This address exists but is not a token mint", fix: "You may have passed a wallet or token account; find the token's mint address instead." },
      { when: "The Solana RPC is slow", youSee: "Error: The Solana RPC was too slow to answer. Try again in a moment.", fix: "Wait a few seconds and retry. Tool errors are refunded." },
      E_PAY, E_NETWORK, E_RATE,
    ],
    next: "Do not treat LOW as proof of safety. To see what a wallet holds, call get_token_accounts.",
  },
  optimal_fee: {
    plain: "Recommends a priority fee for right now, in three speeds, based on recent network activity.",
    inputHints: { network: NET_HINT },
    success: "Pick a tier by urgency: low is cheapest and may take 15-60 seconds, medium suits most sends (5-15 s), high is for time-critical sends (1-5 s). Values are micro-lamports per compute unit (the field is named lamports). current_congestion is HIGH, MODERATE or LOW. raw_stats shows min, max, average and sample_size; llm_advice is a one-line suggestion.",
    errors: [
      { when: "The cluster returns no fee data", youSee: "Error: Could not fetch prioritization fees from cluster", fix: "Retry in a few seconds. Tool errors are refunded." },
      E_PAY, E_NETWORK, E_RATE,
    ],
    next: "Set the chosen value as your transaction's compute-unit price, then check it with validate_transaction. Ask again if you wait long; congestion changes quickly.",
  },
  decode_tx: {
    plain: "Explains in plain language what a confirmed transaction did.",
    inputHints: {
      signature: "The transaction signature: a base58 string of about 88 characters, from get_recent_transactions or an explorer. It must be confirmed.",
      network: NET_HINT,
    },
    success: "details.status is SUCCESS or FAILED. category and summary are best-effort labels. balance_changes lists only accounts whose SOL changed (positive deltaSol means received); token movements are not listed, so read raw_logs for them. llm_context is a one-line recap.",
    errors: [
      { when: "The signature is unknown, unconfirmed, or on another network", youSee: "Error: Transaction not found or not yet confirmed", fix: "If you just sent it, wait a few seconds and retry. Check you copied the whole signature and chose the right network." },
      E_RPC, E_PAY, E_NETWORK, E_RATE,
    ],
    next: "To see more history for the same wallet, call get_recent_transactions.",
  },
  validate_transaction: {
    plain: "Checks a transaction you built before you sign it and tells you SAFE or UNSAFE, with what to fix.",
    inputHints: { transaction: TX_HINT, network: NET_HINT },
    success: "verdict is SAFE or UNSAFE. UNSAFE means at least one issue has severity ERROR; a WARNING alone does not change the verdict. Each issue has a code, a message and a fix. SAFE means no issue was found against chain state at that moment; it does not guarantee the outcome or that the trade is a good one. simulation shows the dry-run logs and compute used.",
    errors: [
      { when: "The transaction cannot be decoded", youSee: "A normal result: verdict UNSAFE with an issue coded MALFORMED_TRANSACTION (charged)", fix: "Re-encode as base64 of a serialized VersionedTransaction and call again." },
      { when: "A check finds a problem (for example INSUFFICIENT_FEE_PAYER_BALANCE, INSUFFICIENT_RENT, ACCOUNT_NOT_FOUND, PROGRAM_ERROR)", youSee: "A normal result: verdict UNSAFE and issues with severity, code, message and fix (charged)", fix: "Apply each issue's fix, rebuild the transaction and validate again; each check costs 1 credit." },
      { when: "The fee payer's balance could not be checked", youSee: "A WARNING issue coded FEE_PAYER_CHECK_FAILED", fix: "Check the fee payer yourself with get_solana_balance." },
      E_PAY, E_NETWORK, E_RATE,
    ],
    next: "If SAFE, sign and send the transaction yourself; this gateway never sends it. If UNSAFE, fix the issues and validate again.",
  },
};

export const QUICK_START: string[] = [
  "1. Connect to the MCP endpoint: Streamable HTTP at /mcp, or SSE at /mcp/sse. Free tools need nothing else.",
  "2. Call a tool by name with its inputs. Over plain HTTP: POST to /mcp with a JSON-RPC tools/call request. Example: curl -s -X POST <gateway URL>/mcp -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' -H 'x-api-key: <your key, paid tools only>' -d '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"get_solana_balance\",\"arguments\":{\"wallet\":\"<wallet address>\"}}}'",
  "3. Read the result: it arrives as JSON text in content[0].text. If isError is true the text starts with 'Error: ' (or is a payment-required object); read it, fix the input, and retry.",
  "4. For paid tools: sign in with your wallet, add credits, and send your key in the x-api-key header.",
  "5. Never send a private key or seed phrase to any tool. The gateway cannot sign or send for you.",
];

export const WORKFLOWS: { goal: string; steps: string[] }[] = [
  { goal: "Send SOL safely", steps: ["get_solana_balance", "get_solana_blockhash", "optimal_fee", "validate_transaction", "you sign and send"] },
  { goal: "Send an SPL token safely", steps: ["get_token_accounts", "find_ata (recipient)", "get_solana_blockhash", "optimal_fee", "validate_transaction", "you sign and send"] },
  { goal: "Decide whether to trust an unfamiliar token", steps: ["token_profile", "get_token_accounts (what a wallet holds)"] },
  { goal: "Find out what a wallet did recently", steps: ["get_recent_transactions", "decode_tx (for each signature you care about)"] },
];
