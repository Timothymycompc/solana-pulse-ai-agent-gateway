# Solana Pulse AI Agent Gateway

A monetized Model Context Protocol (MCP) gateway bridging autonomous AI agents (Claude Desktop, Cursor, custom bots) with the live Solana blockchain. Every endpoint makes a real, cryptographic call to the Solana cluster — no mock data.

## Why this exists

LLM agents that call raw Solana RPC directly tend to hallucinate or mishandle results: they misread transaction logs, miss honeypot/freeze-authority risks on tokens, derive the wrong token account address, or get transactions stuck from bad priority fee estimates. This gateway does that interpretation work server-side and returns clean, structured, agent-ready JSON.

## Architecture

* **Backend:** Node.js + Express + TypeScript
* **Blockchain integration:** `@solana/web3.js`, live RPC connections to Solana mainnet-beta and devnet
* **Frontend:** React + Vite + Tailwind CSS (includes a live in-browser sandbox to test every endpoint)
* **Payments:** Postgres-backed API key credit balances, funded via SOL deposits verified through a Helius webhook, claimed via a wallet-signed challenge — no centralized custody of funds beyond the deposit itself
* **Protocol:** MCP tool manifest auto-published at `/.well-known/mcp.json`, plus SSE and streamable-HTTP MCP endpoints for direct agent/tool-use integration

## Pricing

* Flat rate: 0.0022 SOL per paid call
* Free tier: 50 lifetime calls per wallet/API key, capped at 15 free calls per day within that pool
* `GET /api/solana/balance` and `GET /api/solana/blockhash` are free, uncapped

## Live Endpoints

* `GET /api/solana/balance?wallet=<base58>` — native SOL balance
* `GET /api/solana/blockhash` — latest finalized blockhash
* `GET /api/solana/token-accounts?wallet=<base58>` — all SPL token balances for a wallet
* `GET /api/solana/transactions?wallet=<base58>` — recent transaction signatures
* `POST /api/solana/simulate` — simulate a base64-encoded transaction without broadcasting
* `POST /api/solana/validate-and-simulate` — simulate a transaction and get a plain-language Safe/Unsafe verdict with a specific fix for common failure modes (insufficient balance, missing account, bad fee payer)
* `GET /api/solana/find-ata?wallet=<base58>&mint=<base58>` — derive an Associated Token Account address
* `GET /api/solana/token-profile?mint=<base58>` — mint decimals/supply, freeze & mint authority, honeypot risk flag, top holders
* `GET /api/solana/optimal-fee` — tiered priority fee recommendations based on live network congestion
* `GET /api/solana/decode-tx?signature=<sig>` — translate raw transaction logs into a plain-English summary
* `GET /.well-known/mcp.json` — MCP tool manifest for agent auto-discovery
* `/mcp/sse`, `/mcp/messages`, `/mcp` — MCP server endpoints (SSE and streamable HTTP transports)

## Getting Started (Local Dev)

1. `npm install`
2. `npm run dev` — starts the Express server + Vite frontend

## Production Build

`npm run build` compiles the TypeScript backend via esbuild and the React frontend via Vite into a single container-ready execution layer, deployed on Google Cloud Run.
