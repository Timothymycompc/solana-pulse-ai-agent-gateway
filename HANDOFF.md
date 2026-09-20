# Project Handoff: Solana Pulse AI Agent Gateway

## 🎯 Project Vision
The goal is to transform a standard RPC bridge into an **Intelligence Gateway**. Instead of providing raw blockchain data, the gateway provides "processed intelligence" that removes the cognitive load from AI agents (LLMs). By handling the "plumbing" (math, address derivation, log parsing) on the server, we eliminate the most common causes of agent hallucination and transaction failure on Solana.

## 🚦 Current Status

### Completed
- **Pre-paid Credit System**: API keys with balances managed in PostgreSQL.
- **Secure Claim Flow**: Cryptographic signature verification for key claims.
- **Secret Management**: GSM integrated for production security.
- **Core "Pain-Killer" Suite**:
    - `find-ata` (Address Resolution)
    - `token-profile` (Security & Decimals)
    - `optimal-fee` (Congestion Management)
    - `decode-tx` (Log Translation)
- **AI Discovery**: `/llms.txt` and `/.well-known/mcp.json` are live to attract autonomous agents.

### Pending / Blocked
- **GitHub Push**: The `ollamasclaude` branch is ready locally but cannot be pushed due to permissions for `metatim89-a11y`. **Action: Update repo permissions.**
- **Frontend Build**: `src/components/ApiGatewaySandbox.tsx` has a suspected JSX syntax error around line 670 that prevents a clean production build. **Action: Audit JSX tag balance.**

## 🗺️ Roadmap & Future Direction

### 1. Action Validation Suite (Immediate Next Step)
The next priority is the **`validate_and_simulate`** endpoint.
- **Goal**: A one-stop-shop where an agent sends a proposed transaction.
- **Logic**: The server checks for common agent mistakes (wrong ATA, missing balance, incorrect decimals) *before* simulating.
- **Output**: A "Safe/Unsafe" verdict with a specific fix hint.

### 2. The "Oracle" Suite
- **`get_accurate_price`**: Aggregate price from Jupiter/Pyth to avoid slippage errors.
- **`check_liquidity_depth`**: Provide a "Trade-ability Score" for low-cap tokens.

### 3. Expanding the Translator
- **Deep-Parse**: Move beyond simple string matching in `decode-tx` to actual instruction parsing for more complex programs.

### 4. Registry Integration
- Create a `manifest.json` for community MCP registries.
- Provide one-click `claude_desktop_config.json` snippets for users.

## 🛠️ Tech Stack Reference
- **Backend**: Node.js, Express, TypeScript, `tsx`.
- **Blockchain**: `@solana/web3.js`, `@solana/spl-token`.
- **Database**: PostgreSQL (via `pg`).
- **Security**: GSM, `tweetnacl`, `bs58`.
- **Frontend**: React, Vite, Tailwind CSS.
- **Discovery**: MCP (Model Context Protocol), SSE.
