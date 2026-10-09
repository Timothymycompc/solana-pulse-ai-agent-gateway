# Solana Pulse AI Agent Gateway

A monetized Model Context Protocol (MCP) gateway bridging autonomous AI agents (Claude Desktop, Cursor, custom bots) with the live Solana blockchain. Every endpoint makes a real, cryptographic call to the Solana cluster — no mock data.

## Why this exists

LLM agents that call raw Solana RPC directly must interpret transaction logs, token authorities, token-account addresses, and fee estimates themselves. This gateway provides those lookups and transaction analysis as structured JSON. Token authority checks are heuristics and do not detect honeypots.

## Architecture

* **Backend:** Node.js + Express + TypeScript
* **Blockchain integration:** `@solana/web3.js`, live RPC connections to Solana mainnet-beta and devnet
* **Frontend:** React + Vite + Tailwind CSS (includes a live in-browser sandbox to test every endpoint)
* **Payments:** Postgres-backed API key credit balances, funded via SOL deposits verified through a Helius webhook, claimed via a wallet-signed challenge — no centralized custody of funds beyond the deposit itself
* **Protocol:** MCP tool manifest auto-published at `/.well-known/mcp.json`, plus SSE and streamable-HTTP MCP endpoints for direct agent/tool-use integration

## Pricing

* Flat rate: 0.0022 SOL per paid call
* Free lookups: balance, blockhash, token accounts, recent transactions, and ATA lookup. These routes are rate-limited to 120 requests per minute per IP.
* There is no annual or lifetime free-call allowance for paid endpoints.

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
* `GET /.well-known/mcp.json` — MCP tool manifest for agent auto-discovery
* `/mcp/sse`, `/mcp/messages`, `/mcp` — MCP server endpoints (SSE and streamable HTTP transports)

## Getting Started (Local Dev)

1. `npm install`
2. `npm run dev` — starts the Express server + Vite frontend

## Production Build

`npm run build` compiles the TypeScript backend via esbuild and the React frontend via Vite into a single container-ready execution layer, deployed on Google Cloud Run.
