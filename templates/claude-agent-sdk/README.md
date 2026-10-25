# Solana Pulse + Claude Agent SDK: check before signing

A Claude Agent SDK agent whose `send_sol` tool asks Solana Pulse to check each transfer before signing: `check_tx` must say OK and `tx_matches` must say MATCH. Otherwise nothing is signed. It's a dry run unless `PULSE_SEND=1` and `SOLANA_PRIVATE_KEY` are set.

```bash
npm install
WALLET_ADDRESS=<your wallet> npm run check -- <recipient> 0.001   # the safety path, no AI model
```

Agent: `WALLET_ADDRESS=<your wallet> npm start -- "send 0.001 SOL to <address>"` (signed in to Claude Code, or with `ANTHROPIC_API_KEY` set).

`src/pulse-guard.ts` and `src/wallet.ts` are the same in every template. See [../README.md](../README.md) for the settings and what was tested.
