# Solana Pulse AI Agent Gateway

A monetized Model Context Protocol (MCP) gateway bridging autonomous AI agents (Claude Desktop, Cursor, custom bots) with the live Solana blockchain. Every endpoint makes a real, cryptographic call to the Solana cluster — no mock data.

## Why this exists

LLM agents that call raw Solana RPC directly must interpret transaction logs, token authorities, token-account addresses, and fee estimates themselves. This gateway provides those lookups and transaction analysis as structured JSON. Token authority checks are heuristics and do not detect honeypots.

## Architecture

* **Backend:** Node.js + Express + TypeScript
* **Blockchain integration:** `@solana/web3.js`, live RPC connections to Solana mainnet-beta and devnet
* **Frontend:** React + Vite + Tailwind CSS (includes a live in-browser sandbox to test every endpoint)
* **Payments:** x402 v2 pay-per-call in USDC on Solana mainnet, verified and settled by a facilitator (PayAI by default) that also pays network fees. No accounts or API keys.
* **Protocol:** MCP tool manifest auto-published at `/.well-known/mcp.json`, plus SSE and streamable-HTTP MCP endpoints for direct agent/tool-use integration

## Pricing

* Basic reads (balance, blockhash, token accounts, recent transactions, find-ata, inspect-address) are free and rate-limited.
* Every other tool has 3 free calls per caller (counted by IP address, shared across HTTP and MCP), then costs $0.001, $0.005 or $0.01 USDC per call. Prices live in `pricing.ts`.
* Paid calls follow x402: HTTP returns 402 with a `PAYMENT-REQUIRED` header; MCP returns a PaymentRequired tool result and accepts payment in `_meta["x402/payment"]`.
* Data routes are rate-limited to 120 requests per minute per IP. Failed calls are refunded and do not use up free calls.

## Live Endpoints

* `GET /api/solana/balance?wallet=<base58>` — native SOL balance
* `GET /api/solana/blockhash` — latest finalized blockhash
* `GET /api/solana/token-accounts?wallet=<base58>` — all SPL token balances for a wallet
* `GET /api/solana/transactions?wallet=<base58>` — recent transaction signatures
* `POST /api/solana/simulate` — simulate a base64-encoded transaction without broadcasting
* `POST /api/solana/validate-and-simulate` — simulate a transaction and get a plain-language Safe/Unsafe verdict with a specific fix for common failure modes (insufficient balance, missing account, bad fee payer)
* `GET /api/solana/find-ata?wallet=<base58>&mint=<base58>` — derive an Associated Token Account address
* `GET /api/solana/token-profile?mint=<base58>` — mint decimals/supply, freeze & mint authority, top holders; freeze-authority risk is a heuristic, not honeypot detection
* `GET /api/solana/optimal-fee` — tiered priority fee recommendations based on live network congestion
* `GET /api/solana/decode-tx?signature=<sig>` — translate raw transaction logs into a plain-English summary
* `GET /api/trial/status` — show trial calls used per tool for this caller
* `GET /.well-known/mcp.json` — MCP tool manifest for agent auto-discovery
* `/mcp/sse`, `/mcp/messages`, `/mcp` — MCP server endpoints (SSE and streamable HTTP transports)

## Getting Started (Local Dev)

1. `npm install`
2. `npm run dev` — starts the Express server + Vite frontend

## Production Build

`npm run build` compiles the TypeScript backend via esbuild and the React frontend via Vite into a single container-ready execution layer, deployed on Google Cloud Run.
