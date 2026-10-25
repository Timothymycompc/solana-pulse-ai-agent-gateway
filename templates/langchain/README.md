# Solana Pulse + LangChain: check before signing

A LangChain agent whose `send_sol` tool asks Solana Pulse to check each transfer before signing: `check_tx` must say OK and `tx_matches` must say MATCH. Otherwise nothing is signed. It's a dry run unless `PULSE_SEND=1` and `SOLANA_PRIVATE_KEY` are set.

```bash
npm install
WALLET_ADDRESS=<your wallet> npm run check -- <recipient> 0.001   # the safety path, no AI model
```

Agent: `ANTHROPIC_API_KEY=... WALLET_ADDRESS=<your wallet> npm start -- "send 0.001 SOL to <address>"`

`src/pulse-guard.ts` and `src/wallet.ts` are the same in every template. See [../README.md](../README.md) for the settings and what was tested.

Note: some IPv4-only networks time out in the MCP client's first request (it tries the IPv6 address). If Pulse's tools fail to load, run it from a network with IPv6 or a cloud machine.
