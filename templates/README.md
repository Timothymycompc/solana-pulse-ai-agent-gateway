# Agent templates: check before signing

Four small agents you can fork, one per framework. Each has a `send_sol` tool that builds the transfer, has Solana Pulse check it, and only then signs:

1. **check_tx** dry-runs the transaction on live mainnet and must answer **OK** (not REVIEW or BLOCK).
2. **tx_matches** compares it with what the user asked for (token, amount, recipient) and must answer **MATCH**.

Anything else means nothing is signed, and the agent gets the reasons in plain words. That includes Pulse being unreachable or out of free calls: the templates fail closed.

**Dry run by default.** Nothing is signed or sent unless you set both `PULSE_SEND=1` and `SOLANA_PRIVATE_KEY`. With only `WALLET_ADDRESS` set, the agent runs both checks for real against mainnet and stops there.

| Template | Framework | How Pulse is used | Start |
|---|---|---|---|
| [vercel-ai-sdk](vercel-ai-sdk) | Vercel AI SDK 7 | `send_sol` tool | `npm start -- "send 0.001 SOL to <address>"` |
| [claude-agent-sdk](claude-agent-sdk) | Claude Agent SDK | `send_sol` tool, plus Pulse's read-only tools over MCP | same |
| [langchain](langchain) | LangChain 1 | `send_sol` tool, plus Pulse's read-only tools through `@langchain/mcp-adapters` | same |
| [elizaos](elizaos) | elizaOS 1.7 | `SEND_SOL` action in a plugin | add `pulseSafetyPlugin` to your character |

## Try the safety path first, with no AI model

Every template has the same check script. It builds a real transfer on mainnet and runs both checks. Nothing is signed.

```bash
cd templates/vercel-ai-sdk   # or any other template
npm install
WALLET_ADDRESS=<your wallet> npm run check -- <recipient> 0.001
```

## Settings

| Variable | Needed for | Default |
|---|---|---|
| `WALLET_ADDRESS` | A dry run with no key | none |
| `SOLANA_PRIVATE_KEY` | Signing (base58, or the JSON array from `solana-keygen`) | none |
| `PULSE_SEND` | Set to `1` to send after both checks pass | off |
| `ANTHROPIC_API_KEY` | The Vercel and LangChain agents (the Claude Agent SDK can also use a Claude Code sign-in) | none |
| `MODEL` | Which model the agent uses | `claude-sonnet-5-5` |
| `PULSE_API_KEY` | Calls past the 25 free calls per tool per day | none |
| `SOLANA_RPC_URL` | Fetching a blockhash and sending | public mainnet RPC |

## What was tested, and how (2026-10-25)

- `tests/templates.test.ts` replays real Pulse answers recorded on mainnet: a correct transfer passes, a transfer to the wrong recipient is refused (check_tx alone says OK there, which is why both checks are needed), a transfer that would fail is refused, and an outage or used-up free calls refuse too. It also checks that every template's `pulse-guard.ts` and `wallet.ts` are identical to `shared/`.
- Each template type-checks against the real packages. `npm run check` was run against mainnet for each one.
- Claude Agent SDK: a full agent run (the model called `send_sol`, both checks passed, dry run).
- LangChain: Pulse's tools loaded through the MCP adapter and `token_safety` answered (run on Google Cloud Build).
- elizaOS: the `SEND_SOL` action ran with a stand-in runtime.
- Not run: the Vercel and LangChain agents' model step, because it needs an Anthropic API key.

These templates only send SOL. Token transfers and swaps work the same way: build the transaction, call `checkBeforeSigning(tx, expected)` from `pulse-guard.ts`, and sign only if `allowed` is true.
