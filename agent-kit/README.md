# solana-agent-kit-plugin-pulse

[Solana Pulse](https://github.com/Timothymycompc/solana-pulse-ai-agent-gateway) safety checks as a [Solana Agent Kit](https://github.com/sendaifun/solana-agent-kit) plugin. Before your agent signs or buys, it can check:

- **`PULSE_CHECK_TX`**: dry-runs a transaction on mainnet and answers OK, REVIEW or BLOCK, with each wallet's exact SOL and token changes. It catches drainer approvals, ownership changes, failures and expired blockhashes before you pay a fee.
- **`PULSE_TX_MATCHES`**: confirms a transfer or swap does exactly what the user asked: token, amount and recipient, nothing hidden.
- **`PULSE_TOKEN_SAFETY`**: answers SAFE, CAUTION or AVOID, with reasons. It runs a real sell test, checks whether liquidity can be pulled, and looks at the creator's record, insider wallets and the issuer's mint and freeze powers.
- **Also:** `PULSE_FIND_TOKEN` (the real mint behind a ticker), `PULSE_FEE`, `PULSE_EXPLAIN_TX`, `PULSE_WHY_FAILED`, `PULSE_WHATS_THIS`, `PULSE_TOKEN_ACCOUNT`, `PULSE_CONVERT`, `PULSE_WALLET`, `PULSE_BALANCE`, `PULSE_TOKENS`, `PULSE_HISTORY` and `PULSE_BLOCKHASH`.

Every fact comes from live mainnet data and names its source. When data is missing, Pulse says "unknown" instead of guessing. "SAFE" means none of the traps Pulse knows about are present; it can't promise a token is safe.

## Install

```bash
npm install solana-agent-kit-plugin-pulse
```

```ts
import { SolanaAgentKit, KeypairWallet, createVercelAITools } from "solana-agent-kit";
import PulsePlugin from "solana-agent-kit-plugin-pulse";

const agent = new SolanaAgentKit(wallet, RPC_URL, {}).use(PulsePlugin);

// Let the model call the checks itself:
const tools = createVercelAITools(agent, agent.actions);

// Or call them from code. tx can be base64, a Transaction or a VersionedTransaction.
const check = await agent.methods.pulseCheckTx(agent, { tx });
if (check.verdict === "BLOCK") throw new Error(check.summary);
```

To load only some tools: `createPulsePlugin({ tools: ["check_tx", "tx_matches", "token_safety"] })`.

## Cost

Each tool gives 25 free calls a day per caller, with no key. After that a call costs $0.01 USDC ($0.02 for `check_tx`, `tx_matches` and `token_safety`), paid per request with [x402](https://github.com/x402-foundation/x402) on Solana. When the free calls run out, an action returns `{ status: "error", payment_required: true, message, x402 }` instead of throwing. If you have a key (for example a builder trial), set it as `OTHER_API_KEYS.PULSE_API_KEY` in the agent config or as the `PULSE_API_KEY` environment variable. Calls that fail are never charged.

## Settings

| Setting | Where | Default |
|---|---|---|
| `PULSE_API_KEY` | `config.OTHER_API_KEYS` or env | none (free tier) |
| `PULSE_URL` | `config.OTHER_API_KEYS` or env | the public Pulse server |

## How it stays correct

The tool list, descriptions and input schemas are generated from Pulse's live tool registry (`npm run agent-kit` in the main repo). Pulse's test suite fails if this package falls behind. Every output field is explained at `GET /api/tools/<name>` on the server.

MIT licence.
