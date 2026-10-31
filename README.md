# Solana Pulse

[![Solana Pulse: agent safety layer MCP connector – tool definition quality and endpoint health on Glama](https://glama.ai/mcp/connectors/io.github.Timothymycompc/solana-pulse-gateway/badges/score.svg)](https://glama.ai/mcp/connectors/io.github.Timothymycompc/solana-pulse-gateway)

**Transaction safety for AI agents on Solana.** It checks transactions before an agent signs them, confirms a transaction does exactly what the agent meant, gives token safety verdicts, explains failures, and converts amounts with real on-chain decimals, so agents stop losing money to hallucinated values.

- **Add it to your AI in a minute** (Claude, ChatGPT, Cursor, VS Code, Codex and more): step-by-step on the [Connect page](https://solana-pulse-gateway-1021990235790.us-central1.run.app/docs/connect)
- Live: https://solana-pulse-gateway-1021990235790.us-central1.run.app
- MCP endpoint: `POST /mcp` (Streamable HTTP) or `/mcp/sse`
- Listed in the official MCP Registry as `io.github.Timothymycompc/solana-pulse-gateway`
- Open source (MIT) and free to use: every tool gives 25 free calls a day
- Built on [our principles](PRINCIPLES.md): real data with its source, "unknown" instead of a guess, and no false data on the chain. A safety check doesn't make a token safe, and it can't. It looks for the known ways people get robbed with a token. "SAFE" really means "none of the traps we know about are present." Every rule exists because it matches a real scam.

## Why

Automated accounts fail on Solana far more often than people expect: a study of over 1.5 billion failed transactions found bots failing 58% of the time ([Why Does My Transaction Fail?](https://arxiv.org/abs/2504.18055), ISSTA 2025). For AI agents the usual causes are mistakes a model makes confidently: wrong decimals, copycat tickers, invented addresses or signatures, expired blockhashes, priority fees in the wrong unit, and signing transactions whose effects nobody checked. Each tool here removes one of those mistakes and returns a verdict, the reasons and a fix.

## Tools

| Tool | Prevents | Price |
|---|---|---|
| `check_tx` | Signing a drainer or a transaction that will fail: shows each wallet's exact gains and losses, flags approvals, authority changes and account closures, expired blockhashes and fee overpay | $0.02 |
| `build_tx` | Hand-built transactions nobody checked: builds a SOL or token transfer, or a Jupiter swap, unsigned, then runs `check_tx` and `tx_matches` on it and says whether it's ready to sign. Never signs or sends | $0.03 |
| `tx_matches` | A transaction that differs from what was asked ("send 5 USDC to X", or "swap 1 USDC for JUP"): compares token, exact amount, recipient and sender, checks a swap pays the bought token back to you, and flags anything extra | $0.02 |
| `token_safety` | Buying scam tokens: SAFE / CAUTION / AVOID from a simulated sale by a real holder, whether the liquidity can be pulled, the creator's rug record, insider wallet networks, mint and freeze powers, Token-2022 traps, verification, liquidity, who holds it and age | $0.02 |
| `explain_tx` | Guessing from logs: real balance changes by wallet, programs used, and why it failed | $0.01 |
| `find_token` | Copycat tickers: the verified token address for a ticker, with copycats counted | $0.01 |
| `fee` | Fee unit mistakes: cheap, normal and fast prices in micro-lamports per compute unit, plus the exact cost in SOL | $0.01 |
| `wallet` | Totals inflated by spam airdrops: holdings with USD values, priced vs unpriced, verified vs unverified | $0.01 |
| `trace` | Guessing where money went after a drain: each transaction's net SOL and token change and the other side, where most of it went (and whether that's a wallet or program-controlled), and drain patterns with the transactions that show them (swept with someone else paying the fee, passed straight through, emptied, lookalike-address dust, dust from strangers), and a ready report: the problem in one line, every transaction with its Solscan link and the caller's local time, a confidence level with its reason, what it points to, and next steps | $0.02 |
| `convert` | Decimal errors: normal amounts to exact raw units using the token's real decimals | $0.01 |
| `why_failed` | Blind retries: Solana error codes in plain words, with a fix | $0.01 |
| `whats_this` | Sending to the wrong kind of address: wallet, token account, token, program and more | $0.01 |
| `token_account` | Wrong token accounts: Token-2022 aware address, whether it exists, and what creating it costs | $0.01 |
| `balance` | A balance remembered from earlier in a chat: the live SOL balance | $0.01 |
| `tokens` | Fake holdings: tokens held, ranked by USD value, with unverified (often spam) tokens flagged | $0.01 |
| `history` | Made-up transaction IDs: a wallet's recent transactions, real and checkable | $0.01 |
| `blockhash` | Expired blockhashes: a fresh one with the seconds it has left | $0.01 |
| `tx_version` | "Transaction not found" for a transaction that is on chain: says whether it is legacy, version 0 or version 1, and which RPC settings and library versions can read it | $0.01 |

Every input and returned field is documented in plain words: what an input is looking for and where to get it, what each returned value is and how it's worked out (`GET /api/tools/<name>`). The tools and their fields were renamed in October 2026 to short, plain names (`preflight_transaction` became `check_tx`, `transaction` became `tx`, `walletChanges` became `balance_changes`). The old tool names and input names still work.

Prices apply only after a tool's 25 free calls for the day.

Every tool documents each input (with how to get it) and each returned field (with what it means and exactly how it is computed): `GET /api/tools` and `GET /api/tools/<name>`. `GET /api/tools/<name>/example` returns ready-to-run inputs built from live mainnet data.

## Calling it

HTTP:

```bash
curl -X POST https://solana-pulse-gateway-1021990235790.us-central1.run.app/api/tools/convert \
  -H 'content-type: application/json' -d '{"token":"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v","amount":"5"}'
```

MCP, at `https://solana-pulse-gateway-1021990235790.us-central1.run.app/mcp`:

- **Claude** (claude.ai and the Claude apps): Customize, Connectors, Add custom connector, paste the URL, choose No sign in.
- **Claude Code**: `claude mcp add --transport http solana-pulse https://solana-pulse-gateway-1021990235790.us-central1.run.app/mcp`
- **ChatGPT** (web, developer mode on Business, Enterprise, Edu or Pro): ChatGPT Plugins, plus button, Add custom MCP server, paste the URL, Authentication: No authentication, Create as a plugin.
- **Gemini CLI**: `gemini mcp add -s user --transport http solana-pulse https://solana-pulse-gateway-1021990235790.us-central1.run.app/mcp`
- **Antigravity** (replaced Gemini CLI for free and Google One accounts): in `~/.gemini/config/mcp_config.json`, `{ "mcpServers": { "solana-pulse": { "serverUrl": "https://solana-pulse-gateway-1021990235790.us-central1.run.app/mcp" } } }`
- **Cursor** (`~/.cursor/mcp.json`) and most other clients that take a URL: `{ "mcpServers": { "solana-pulse": { "url": "https://solana-pulse-gateway-1021990235790.us-central1.run.app/mcp" } } }`
- **VS Code** (Copilot): `code --add-mcp '{"name":"solana-pulse","type":"http","url":"https://solana-pulse-gateway-1021990235790.us-central1.run.app/mcp"}'`, or `.vscode/mcp.json` with `servers` and `"type": "http"`
- **Windsurf** (`~/.codeium/windsurf/mcp_config.json`): `{ "mcpServers": { "solana-pulse": { "serverUrl": "https://solana-pulse-gateway-1021990235790.us-central1.run.app/mcp" } } }`
- **Cline** (`cline_mcp_settings.json`): `{ "mcpServers": { "solana-pulse": { "type": "streamableHttp", "url": "https://solana-pulse-gateway-1021990235790.us-central1.run.app/mcp" } } }`
- **Codex CLI**: `codex mcp add solana-pulse --url https://solana-pulse-gateway-1021990235790.us-central1.run.app/mcp`
- **Zed** (settings.json): `{ "context_servers": { "solana-pulse": { "url": "https://solana-pulse-gateway-1021990235790.us-central1.run.app/mcp" } } }`
- **OpenCode** (`opencode.json`): `{ "mcp": { "solana-pulse": { "type": "remote", "url": "https://solana-pulse-gateway-1021990235790.us-central1.run.app/mcp" } } }`
- **ElizaOS and Coinbase AgentKit**: setup on the [Connect page](https://solana-pulse-gateway-1021990235790.us-central1.run.app/docs/connect).

Solana Agent Kit (SendAI): a plugin in [`agent-kit/`](agent-kit/README.md) ([`solana-agent-kit-plugin-pulse`](https://www.npmjs.com/package/solana-agent-kit-plugin-pulse) on npm) turns each tool into an action (`PULSE_CHECK_TX`, `PULSE_TOKEN_SAFETY`, ...) and a method (`agent.methods.pulseCheckTx(agent, { tx })`). Its tool list is generated from the same registry (`npm run agent-kit`), and `tests/agent-kit.test.ts` fails if it falls behind.

Agent templates: [`templates/`](templates/README.md) has five small agents to fork (Vercel AI SDK, Claude Agent SDK, LangChain, elizaOS, Coinbase AgentKit). Each one checks every transfer with `check_tx` (must be OK) and `tx_matches` (must be MATCH) before signing, refuses when Pulse can't answer, and is a dry run by default.

## Pricing and payments

- All calls are rate-limited to 120 requests per minute per IP.
- Every tool gives each caller 25 free calls a day (reset at 00:00 UTC, counted by a keyed hash of the caller's network, shared across HTTP and MCP), then costs $0.01 USDC per call ($0.02 for `check_tx`, `tx_matches` and `token_safety`). Normal use stays free; payment covers heavy, automated use. Callers using the Solana Foundation's `pay` tool pay from the first call, because its registry (Pay.sh) lists only tools that answer `402`.
- Payment is per request with [x402](https://github.com/x402-foundation/x402) v2 (scheme `exact`, USDC on Solana mainnet). HTTP answers `402` with a `PAYMENT-REQUIRED` header; MCP returns a PaymentRequired tool result and accepts payment in `_meta["x402/payment"]`. Coinbase's x402 facilitator verifies, settles and pays network fees, with [PayAI's](https://facilitator.payai.network) as a backup if Coinbase can't be reached at startup. Calls that return an error are never charged.
- No accounts, API keys or stored balances.
- Usage records hold the route, status, client name and a keyed hash of the caller's network, never IP addresses. For tool calls they also keep the tool's input and result (up to 32 KB each) for 30 days, then clear them. Site visits are recorded the same way, with the page and referring site. The owner sees money (per tool, with the part paid under each tool's pre-rename name), tool runs, callers, visitors and the latest runs at `/owner`, one tab each, using the owner key.
- Each paid tool publishes an x402 discovery listing (the Bazaar extension: description, input schema and a real example), so facilitator directories such as Coinbase's x402 Bazaar and PayAI's list it after its first paid call through them.

### How payments evolved

Version 1 (September to October 2026) was a prepaid credit system I built directly on Solana. Its code is kept at the [`v1-sol-credits`](https://github.com/Timothymycompc/solana-pulse-ai-agent-gateway/tree/v1-sol-credits) tag.

- **Wallet sign-in**: the server issued a sign-in message and checked the wallet's ed25519 signature on it (tweetnacl). Messages expired after 5 minutes and could not be used twice. Sign-in returned an API key, and only its SHA-256 hash was stored.
- **Deposits**: a Helius webhook, authenticated with a shared secret compared in constant time, reported SOL sent to the payout wallet. Each transaction signature was recorded once, so a resent webhook could not credit twice. Every 0.0022 SOL bought one call.
- **Metering**: one conditional `UPDATE` took a credit, so concurrent calls could not spend the same credit, and a call that failed was refunded.

Version 2 replaced it with x402 because the buyers are AI agents. Under v1 an agent had to sign in, store a key, send a deposit and wait for it to be credited before its first paid call, using a client written for this one service. With x402 it pays inside the request that needs payment, using a standard that agent payment libraries already support. The switch also moved prices from SOL to USDC and removed accounts, stored balances, the webhook and four database tables.

What I would fix in v1: the server did not store the sign-in messages it issued, so it accepted any signed message carrying a recent timestamp, and a deposit smaller than one call's price added no credit.

## Architecture

- **Tool registry (`server/tools/`)**: one definition per tool holds its use-when line, documentation, live example and code. MCP tools, HTTP routes, `/api/tools`, `llms.txt`, `/.well-known/mcp.json` and the playground are all generated from it, so docs cannot drift from behavior.
- **Transaction analysis (`server/tools/decode.ts`)**: decodes System, SPL Token, Token-2022, Compute Budget, Associated Token Account and Memo instructions, resolves address lookup tables, simulates against live state and computes per-wallet balance changes.
- **Payments (`server/x402.ts`, `server/meter.ts`, `server/pricing.ts`)**: an admission gate (free tool, owner key, free call, or x402), the official `@x402/express` and `@x402/mcp` integrations, and a revenue ledger of settled payments.
- **Server**: Node.js, Express, TypeScript on Google Cloud Run, PostgreSQL on Cloud SQL (daily free-call counts, anonymous usage stats, payment ledger).
- **Frontend**: React, Vite, Tailwind with a registry-driven playground.

## Local development

```bash
npm install
cp .env.example .env   # set DATABASE_URL at minimum
npm run dev            # Express + Vite on http://localhost:3000
npm run build          # type-check, then bundle frontend and server into dist/
```

See [DEVELOPING.md](DEVELOPING.md) for the folder layout and how to add a tool, change a price, recolor the site or deploy.

## Tests

```bash
npm test               # 152 tests, offline, about a minute
npm run test:record    # re-record the mainnet scenarios (reads and simulations only)
npm run benchmark      # score the 10 attack cases
npm run everyday       # replay the 200 everyday transactions
```

- **Solana Agent Safety Benchmark** ([benchmark/README.md](benchmark/README.md), `tests/benchmark.test.ts`): 10 cases built from real mainnet accounts and simulated against live mainnet state: a correct transfer (must pass), wrong recipient, wrong amount, wrong token, extra instruction, hidden transfer, malicious program, balance drain, expired transaction and replayed payment (all must fail). Solana Pulse catches 9 of 9 attacks for the right reason, with no false alarm. `benchmark/score.ts` scores any checker on the same cases.
- **False alarms on 200 real transactions** (`benchmark/everyday.ts`, `tests/everyday.test.ts`): 200 ordinary transactions that really worked, from the newest mainnet blocks, checked the way a wallet hands them over before signing. No BLOCK; 80 of 80 transfers OK and MATCH; 26 of 27 swaps MATCH (the other paid a trading bot 1.54%); the REVIEWs are transactions calling programs check_tx doesn't recognize. Building it found that version 1 transactions couldn't be read and that fees without a compute limit were wrong; both are fixed, and fees now match what mainnet charged for all 200.

- **trace on real drains and ordinary wallets** (`tests/trace.test.ts`, `benchmark/trace-everyday.ts`): replays two real drains recorded from mainnet. For @KunalxWeb3's wallet it finds the 2.03 SOL swept out 7 seconds after it arrived with another wallet paying the fee, the wallet emptied, and the destination a program-controlled address (very likely a bridge, from the investigation); for @Adilak7777's it names the attacker wallet and the exact 2,176.26 JTO, 5,375.82 RAY and 1,446,074 PUMP sent to it. On ordinary active wallets from a recent mainnet block (2026-10-27), timing alone flagged 14 of 40 as pass-through, so the rules were tightened: pass-through now needs 90% of what arrived sent on, and each sign alone (pass-through 8, another wallet's fee 7, emptied 3 of 45) is only noted, because exchange deposit addresses, bridges and fee sponsors do the same. The drain pattern (emptied and swept) is a warning; it matched 1 of the 45. Re-run on the same 45 addresses hours later (their newest transactions had changed), it matched 5: two throwaway trading-bot wallets and three that look like exchange deposit addresses, which the chain can't tell apart from a drained personal wallet, so the summary says so whenever the warning fires. Lookalike dust matched none of them and found real poisoning in two wallets from a live investigation; plain dust from strangers (`dust_received`, noted, the probe that comes before poisoning) matched 4 of 45. Results in `benchmark/trace-everyday-results.txt` and `-results-2.txt`. On Tim's 2026-10-29 cash-out investigation it called 5 exchange deposit addresses and 2 trading-bot wallets a high-confidence drain; a sweep into a busy collection wallet (its last 1,000 transactions within 24 hours) is now noted instead, which fixed the 5 deposit addresses while both real drains stay high (`benchmark/trace-cashout.ts`, 7 of 9 right; the 2 bot wallets are still wrong). Busy fee payers can't be used the same way: both real drains had them.
- **628 tokens a real beginner bought** (`benchmark/first-wallet.ts`, `tests/first-wallet.test.ts`): what became of each, against token_safety. A mint or freeze power on the day of the buy marked 400 of the 413 tokens that have no market today (Jupiter no longer prices them), 4 of the 37 that still trade but lost most of their value, and none of the 20 that kept their value (a small group); 158 are unknown. So the power warning flags tokens that later stopped trading, not tokens that lost value while trading. It also found that tokens with no market were only CAUTION; they're now AVOID when Jupiter says they can't be traded.
- **Safety checks** (`tests/safety.test.ts`) run against real mainnet transactions recorded in `tests/fixtures/`: a drainer token approval (BLOCK), SOL moved by a hidden extra instruction, a 10x decimals slip, an extra USDC transfer to a stranger (all MISMATCH), plus clean transfers that must pass, including one that creates the recipient's token account.
- **Free-call metering** (`tests/meter.test.ts`) runs the real SQL on an in-memory Postgres (PGlite): the daily allowance, refunds for failed calls, the daily reset and percent-encoded tool names.
- **Units** (`tests/units.test.ts`): exact amount math, error explanations and instruction decoding.
- **Accuracy on real outcomes** (`server/accuracy.ts`, `tests/accuracy.test.ts`): on Google Cloud, Cloud Scheduler samples 100 tokens under 3 days old with at least $10,000 of liquidity from Jupiter's activity lists, records token_safety's full verdict and every check's result, and looks again a week later: did buyers lose most of their money (price or liquidity down 90%+, or RugCheck marks it rugged)? `npm run accuracy` answers four questions: how often each verdict's tokens lost most, how many of the losers were called AVOID or SAFE, which checks carry the signal, and how many well-known tokens are called SAFE.
- **Token watch** (`server/watch.ts`, `tests/watch.test.ts`): Pulse keeps re-reading young tokens for 7 days after it first checks them (up to 10 a day from Jupiter's activity lists, plus young tokens people run `token_safety` on): liquidity, price, holders, top-10 share and mint and freeze authority, every 2 hours, in one batched Jupiter lookup and one batched on-chain read. `token_safety` then adds a `history` of what changed since (liquidity pulled, price crashed, an authority moved). It runs in the accuracy tick, so it needs no schedule of its own.
- **Public track record** (`/track-record`, `GET /api/track-record`, `server/track-record.ts`): the accuracy test's answers and the watch's numbers, by the verdict Pulse gave first. Aggregates and public token addresses only.
- **Discovery listings** (`tests/discovery.test.ts`): every paid tool's x402 listing passes the Bazaar extension's own validators, and its example is a valid input.

GitHub Actions runs the type check, the tool check and the tests on every push.

**Seen a real transaction that robbed someone, or one Pulse got wrong?** [Report it here](https://github.com/Timothymycompc/solana-pulse-ai-agent-gateway/issues/new?template=suspicious-transaction.yml) (a GitHub account is needed). Paste the signature and say what happened. Each report is checked against the chain; confirmed ones are recorded and become test cases, and the issue says what Pulse got right or wrong.

## Uptime, honestly

Glama lists Pulse at 53.9% uptime over 54 days (2026-10-29), and that number is fair. Google Cloud's request counts show two long outages, when every request failed:

- 2026-09-06 to 09-19 (14 days): cause unknown, the logs from then have expired (they're kept 30 days).
- 2026-09-28 to 10-05 (8 days): billing on the Google Cloud project was off, so Cloud Run refused every request ("billing is disabled for this project").

Since 2026-10-06 there have been only short spells of errors (two days with a few hundred), and none lasting a whole day since 10-18. Since 2026-10-13 a Google Cloud uptime check calls the server every 5 minutes and emails the owner when it's down; it has passed 100% of the time over the 16 days it has data for.

If Pulse was useful to you, a ⭐ on GitHub helps other builders find it.

## License

MIT. See [LICENSE](LICENSE).
