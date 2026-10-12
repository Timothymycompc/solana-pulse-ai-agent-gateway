# Solana Pulse

**An intelligence layer between Solana and AI agents.** It checks transactions before an agent signs them, confirms a transaction does exactly what the agent meant, gives token safety verdicts, explains failures, and converts amounts with real on-chain decimals, so agents stop losing money to hallucinated values.

- Live: https://solana-pulse-gateway-1021990235790.us-central1.run.app
- MCP endpoint: `POST /mcp` (Streamable HTTP) or `/mcp/sse`
- Listed in the official MCP Registry as `io.github.Timothymycompc/solana-pulse-gateway`
- Open source (MIT) and free to use: basic tools have no daily limit, every other tool gives 25 free calls a day

## Why

Automated accounts fail on Solana far more often than people expect: a study of over 1.5 billion failed transactions found bots failing 58% of the time ([Why Does My Transaction Fail?](https://arxiv.org/abs/2504.18055), ISSTA 2025). For AI agents the usual causes are mistakes a model makes confidently: wrong decimals, copycat tickers, invented addresses or signatures, expired blockhashes, priority fees in the wrong unit, and signing transactions whose effects nobody checked. Each tool here removes one of those mistakes and returns a verdict, the reasons and a fix.

## Tools

| Tool | Prevents | Price |
|---|---|---|
| `preflight_transaction` | Signing a drainer or a doomed transaction: shows each wallet's exact gains and losses, flags approvals, authority changes and account closures, expired blockhashes and fee overpay | $0.01 |
| `check_transaction_intent` | A transaction that differs from what was asked ("send 5 USDC to X"): compares asset, exact amount, recipient and sender, and flags anything extra | $0.01 |
| `token_verdict` | Buying scam tokens: SAFE / CAUTION / AVOID from mint and freeze powers, Token-2022 traps, verification, liquidity, concentration and age | $0.01 |
| `explain_transaction` | Guessing from logs: real balance changes by wallet, programs used, and the decoded failure reason | $0.005 |
| `resolve_token` | Copycat tickers: the verified mint for a ticker, with copycats counted | $0.001 |
| `fee_advice` | Fee unit mistakes: tiers in micro-lamports per compute unit plus the exact cost in SOL | $0.001 |
| `wallet_snapshot` | Inflated totals from spam airdrops: holdings with USD values, priced vs unpriced, verified vs unverified | $0.001 |
| `convert_amount` | Decimal errors: human amounts to exact base units using the mint's real decimals | Free |
| `explain_error` | Blind retries: Solana error codes in plain language with a fix | Free |
| `inspect_address` | Sending to the wrong kind of address: wallet, token account, mint, program and more | Free |
| `find_ata` | Wrong token accounts: Token-2022 aware derivation, existence check and creation cost | Free |
| `get_solana_balance`, `get_token_accounts`, `get_recent_transactions`, `get_solana_blockhash` | Stale or invented data: live reads (holdings ranked by value with spam flagged; blockhash with seconds left) | Free |

Prices apply only after a tool's 25 free calls for the day.

Every tool documents each input (with how to get it) and each returned field (with what it means and exactly how it is computed): `GET /api/tools` and `GET /api/tools/<name>`. `GET /api/tools/<name>/example` returns ready-to-run inputs built from live mainnet data.

## Calling it

HTTP:

```bash
curl -X POST https://solana-pulse-gateway-1021990235790.us-central1.run.app/api/tools/convert_amount \
  -H 'content-type: application/json' -d '{"mint":"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v","amount":"5"}'
```

MCP, at `https://solana-pulse-gateway-1021990235790.us-central1.run.app/mcp`:

- **Claude** (claude.ai and the Claude apps): Customize, Connectors, Add custom connector, paste the URL, choose No sign in.
- **Claude Code**: `claude mcp add --transport http solana-pulse https://solana-pulse-gateway-1021990235790.us-central1.run.app/mcp`
- **Cursor and other clients that take a URL**: `{ "mcpServers": { "solana-pulse": { "url": "https://solana-pulse-gateway-1021990235790.us-central1.run.app/mcp" } } }`
- **ElizaOS and Coinbase AgentKit**: setup on the [Connect page](https://solana-pulse-gateway-1021990235790.us-central1.run.app/docs/connect).

## Pricing and payments

- Free tools are rate-limited to 120 requests per minute per IP.
- Every other tool gives each caller 25 free calls a day (reset at 00:00 UTC, counted by a keyed hash of the caller's network, shared across HTTP and MCP), then costs $0.001 to $0.01 USDC per call. Normal use stays free; payment covers heavy, automated use.
- Payment is per request with [x402](https://github.com/x402-foundation/x402) v2 (scheme `exact`, USDC on Solana mainnet). HTTP answers `402` with a `PAYMENT-REQUIRED` header; MCP returns a PaymentRequired tool result and accepts payment in `_meta["x402/payment"]`. The [PayAI](https://facilitator.payai.network) facilitator verifies, settles and pays network fees. Calls that return an error are never charged.
- No accounts, API keys or stored balances.
- Each paid tool publishes an x402 discovery listing (the Bazaar extension: description, input schema and a real example), so facilitator directories such as PayAI's, which Coinbase AgentKit can search, list it after its first paid call.

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
npm test               # 24 tests, offline, about 15 seconds
npm run test:record    # re-record the mainnet scenarios (reads and simulations only)
```

- **Safety checks** (`tests/safety.test.ts`) run against real mainnet transactions recorded in `tests/fixtures/`: a drainer token approval (BLOCK), SOL moved by a hidden extra instruction, a 10x decimals slip, an extra USDC transfer to a stranger (all MISMATCH), plus clean transfers that must pass, including one that creates the recipient's token account.
- **Free-call metering** (`tests/meter.test.ts`) runs the real SQL on an in-memory Postgres (PGlite): the daily allowance, refunds for failed calls, the daily reset and percent-encoded tool names.
- **Units** (`tests/units.test.ts`): exact amount math, error explanations and instruction decoding.
- **Discovery listings** (`tests/discovery.test.ts`): every paid tool's x402 listing passes the Bazaar extension's own validators, and its example is a valid input.

GitHub Actions runs the type check, the tool check and the tests on every push.

## License

MIT. See [LICENSE](LICENSE).
