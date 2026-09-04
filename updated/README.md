# Solana Pulse AI Agent Gateway

A true, production-grade Model Context Protocol (MCP 1.0) Gateway bridging autonomous AI Agents (like Claude Desktop and Cursor) with the live Solana Blockchain.

## Architecture
- **Backend:** Node.js + Express
- **Blockchain Integration:** `@solana/web3.js` Native RPC connection to Solana Mainnet & Devnet
- **Frontend UI:** React + Vite + Tailwind CSS
- **Protocol:** Standardized MCP `/.well-known/mcp.json` auto-discovery.

## Live Endpoints
This server makes **real**, cryptographic calls to the Solana cluster. It does not use mock data.

- `GET /api/solana/balance?wallet=<base58>` : Queries the live ledger for the wallet balance.
- `GET /api/solana/blockhash` : Fetches the most recent blockhash for transaction signing.
- `GET /.well-known/mcp.json` : Exposes the MCP tool manifest to autonomous agents.

## Getting Started (Local Dev)
1. `npm install`
2. `npm run dev` (Starts the Express server + Vite frontend on port 3000)

## Production Build
`npm run build` compiles the TypeScript backend via esbuild and the React frontend via Vite, resulting in a single container-ready execution layer.
