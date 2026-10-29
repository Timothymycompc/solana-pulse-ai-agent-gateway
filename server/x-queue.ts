// What the X poster (x.ts) may post, besides the weekly stats it builds from the usage log.
// Queue posts go out in order, one per run, and only once approved is true. No links: X charges about
// $0.20 for a post with a URL and $0.015 without, so the site's address lives in the account's bio.
// A post's key must never change once it has been posted, or it will be posted again.
// video is a file in the VIDEO_BUCKET Cloud Storage bucket (x.ts), uploaded with the post. The tool videos come from
// ~/pulse-video/clips.py and quote real mainnet results recorded on 2026-10-12. Hashtags only: X's automation rules
// don't allow automated posts that mention other accounts unasked.

export const MAX_POST_CHARS = 280;

export type QueuePost = { key: string; approved: boolean; text: string; video?: string };

const tags = (...t: string[]) => "\n" + ["#Solana", "#AIagents", ...t].join(" ");

// One post per tool video, in the order the videos were made. The owner asked on 2026-10-15 for these to go out.
const TOOL_VIDEOS: QueuePost[] = [
  ["check_tx", `check_tx: is this transaction safe to sign?
Use it when an agent is about to:
- sign a swap a dapp built for it
- approve a token spend
- send a transaction built minutes ago
Shows each wallet's exact gains and losses before anything is signed.${tags("#Web3Security")}`],
  ["tx_matches", `tx_matches: does this transaction do exactly what was asked?
It catches:
- "send 5 USDC" built as 50 (a decimals slip)
- the right amount to the wrong recipient
- an extra instruction sneaked in
It says MISMATCH and names the field.${tags("#MCP")}`],
  ["token_safety", `token_safety: SAFE, CAUTION or AVOID before buying a token.
It checks:
- can the issuer freeze it or print more?
- can the creator pull the liquidity?
- who holds the supply, and how old is it?
SAFE means none of the traps we know about are present.${tags("#DeFi")}`],
  ["explain_tx", `explain_tx: what did this transaction actually do?
Use it to:
- report who paid and who received, from chain data
- see which programs ran
- get the failing program and the reason when it failed
Facts, not a model guessing from logs.${tags("#MCP")}`],
  ["fee", `fee: what priority fee to pay, in micro-lamports per compute unit (the unit setComputeUnitPrice takes).
Use it to:
- price economy, standard and fast tiers
- see the total cost in SOL
- set fees when the network is busy
No million-times overpay.${tags("#MCP")}`],
  ["find_token", `find_token: "buy BONK", but which BONK?
Use it whenever a user names a token by ticker:
- get the verified token address
- see how many copycats reuse the ticker
- never pick an address from memory
Here, 6 unverified tokens also called themselves BONK.${tags("#DeFi")}`],
  ["wallet", `wallet: what is this wallet actually worth?
One call for:
- SOL balance, tokens and recent activity
- totals in USD, with unverified tokens kept out
- questions like "how much USDC do I have?"
Spam airdrops never inflate the total.${tags("#MCP")}`],
  ["balance", `balance: the live SOL balance, exact to the lamport.
Use it:
- before sending SOL
- before paying fees on a batch of transactions
- instead of a balance remembered from earlier in the chat
So an agent never builds a transfer the wallet can't cover.${tags("#MCP")}`],
  ["tokens", `tokens: which tokens does this wallet really hold?
Use it to:
- list holdings ranked by USD value
- spot unverified tokens, often spam airdrops
- pick a token to swap, send or check
Fake airdrops are never reported as real money.${tags("#MCP")}`],
  ["history", `history: a wallet's recent transactions, straight from the chain.
Use it to:
- get a real transaction ID to look into
- check whether the last payment went through
- review recent activity before acting
Models can invent realistic fake IDs. These are real.${tags("#MCP")}`],
  ["blockhash", `blockhash: a fresh blockhash and how many seconds it has left.
Use it:
- right before building a transaction
- when a signing step is slow
- after a "blockhash not found" error
A transaction on an expired blockhash is rejected after all the work is done.${tags("#MCP")}`],
  ["token_account", `token_account: where to send a token.
Tokens go to the recipient's token account, not their wallet address. Use it to:
- get the right address for USDC or any token
- see whether it exists yet
- know what creating it costs${tags("#MCP")}`],
  ["whats_this", `whats_this: what is this address, before you send to it?
It tells apart:
- a normal wallet
- a token (mint) address
- a program or a token account
SOL sent to a token or program address by mistake can be stuck for good.${tags("#Web3Security")}`],
  ["convert", `convert: "5 USDC" is 5,000,000 raw units.
Use it before any amount goes into a transaction:
- turn 5 USDC into raw units with the token's real decimals
- turn raw units back into a readable amount
- never send 1,000 times too much${tags("#MCP")}`],
  ["why_failed", `why_failed: a transaction failed. Retry?
Use it first:
- decode errors like 0x1771 (Jupiter: slippage exceeded)
- name the program that failed
- get the next step, such as a fresh quote
A blind retry just burns fees.${tags("#DeFi")}`],
].map(([tool, text]) => ({ key: `video:${tool}`, approved: true, text, video: `${tool}.mp4` })).concat([
  // Added 2026-10-27 with the tool; not approved until Tim approves the text and the video exists.
  { key: "video:trace", approved: false, video: "trace.mp4", text: `trace: where did the money go?
One call follows a wallet's money:
- how much went where, SOL and tokens
- swept out, someone else paying the fee
- lookalike addresses sent as dust
Every flag shows its transactions.${tags("#Web3Security")}` },
  // Added 2026-10-29 with the tool; not approved until Tim approves the text and the video exists.
  { key: "video:build_tx", approved: false, video: "build_tx.mp4", text: `build_tx: ask for a transfer or swap, get a transaction
- built exactly as asked
- dry run: check_tx must say OK
- tx_matches must say MATCH
Never signs. Ready only when all pass.${tags("#Web3Security")}` },
]);

export const QUEUE: QueuePost[] = [
  ...TOOL_VIDEOS,
  {
    key: "bots-fail",
    approved: false,
    text: "AI agents fail on Solana far more than people do: a study of 1.5 billion failed transactions found bots failing 58% of the time (ISSTA 2025). Solana Pulse checks a transaction before an agent signs it: exact balance changes, risky approvals, expired blockhashes.",
  },
  {
    key: "red-token",
    approved: false,
    text: "Some tokens are built to rob their buyers. In 2024 the RED token used a Token-2022 permanent delegate to burn buyers' tokens seconds after they bought. Pulse's token_safety flags permanent delegates, transfer hooks, freeze powers and transfer fees before an agent buys.",
  },
  {
    key: "pricing",
    approved: false,
    text: "Every Solana Pulse tool is free for 25 calls a day. After that it's $0.01 to $0.02 a call in USDC over x402: no account, no API key. Calls that fail are never charged.",
  },
  {
    key: "what-safe-means",
    approved: false,
    text: "Pulse's token_safety answers SAFE, CAUTION or AVOID. SAFE means none of the traps we know about are present. It can't mean a token is safe, and we never say it does. Every rule comes from a real scam.",
  },
  {
    key: "tx-matches",
    approved: false,
    text: "tx_matches answers one question for an AI agent: does this transaction do exactly what I was asked? \"Send 5 USDC to X\" means the same token, the same amount, the same recipient, and nothing extra.",
  },
  {
    key: "open-source",
    approved: false,
    text: "Solana Pulse is open source (MIT). Claude, ChatGPT, Cursor, VS Code and other MCP clients connect with one URL and no sign-in. Link in bio.",
  },
];

// Pull requests that add Pulse to a public list. When one is merged, the poster announces it once.
export const LIST_PRS = [
  { repo: "punkpeye/awesome-remote-mcp-servers", number: 1908, list: "Awesome Remote MCP Servers" },
  { repo: "solana-foundation/awesome-solana-ai", number: 260, list: "the Solana Foundation's Awesome Solana AI list" },
  { repo: "xpaysh/awesome-x402", number: 1845, list: "Awesome x402" },
];
