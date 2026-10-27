# Solana Pulse + Coinbase AgentKit: check before signing

A Coinbase AgentKit agent with three Solana Pulse actions:

- `pulse_send_sol` builds the transfer and asks Solana Pulse to check it: `check_tx` must say OK and `tx_matches` must say MATCH. Otherwise nothing is signed, and the agent gets the reasons in plain words.
- `pulse_token_safety` checks a token for the known traps before buying, accepting or recommending it.
- `pulse_trace` follows a wallet's money and flags drain patterns.

It's a dry run unless `PULSE_SEND=1` and `SOLANA_PRIVATE_KEY` are set.

```bash
npm install
WALLET_ADDRESS=<your wallet> npm run check -- <recipient> 0.001   # the safety path through AgentKit, no AI model
ANTHROPIC_API_KEY=... WALLET_ADDRESS=<your wallet> npm start -- "send 0.001 SOL to <address>"
```

## How it fits AgentKit

- **Actions:** `src/pulse-actions.ts` is an AgentKit `ActionProvider`. Add it to your own agent with `actionProviders: [pulseActionProvider()]`.
- **Wallet:** `src/pulse-wallet.ts` is the AgentKit wallet provider. AgentKit never holds the key: signing stays in `wallet.ts`, behind Pulse's checks. Its `nativeTransfer` goes through the same checks.
- **Model:** the Vercel AI SDK runs it. AgentKit's own Vercel bridge (`@coinbase/agentkit-vercel-ai-sdk` 0.1.0) needs AI SDK 4, so `src/agent.ts` turns the actions into AI SDK 7 tools itself, in four lines.
- **Keep it the only way to send:** don't add AgentKit's own transfer actions (`walletActionProvider`, `splActionProvider`) next to these. They sign without asking Pulse, and the model could use them instead.

## Two things AgentKit does that this template avoids

Both are in `@coinbase/agentkit` 0.10.4:

1. **Analytics with your wallet address.** AgentKit's wallet providers, and every action built with `customActionProvider` or `@CreateAction`, send an event to Coinbase (`cca-lite.coinbase.com`) with the action name and the wallet address. There is no setting to turn it off. This template's wallet provider and actions don't send it.
2. **A crash when that event fails.** The analytics request's failure isn't caught. When the endpoint answered HTTP 400 in our test, the agent crashed before running anything.

## What was tested, and how (2026-10-27, on Google Cloud Build)

- `npm install` and `tsc --noEmit` against `@coinbase/agentkit` 0.10.4, `ai` 7.0.154, `zod` 3.25.76 and `@solana/web3.js` 1.99.0.
- **A 0.001 SOL transfer** from a funded mainnet wallet, run through AgentKit's `pulse_send_sol` with `npm run check`. Both checks passed ("sends exactly 0.001 SOL … and nothing else"). It was a dry run: nothing was signed.
- **A transfer from a wallet that doesn't exist on chain.** It was refused, and nothing was signed: `check_tx` said BLOCK (AccountNotFound) and `tx_matches` said MISMATCH.
- **Every web request was logged** during both runs. They went only to the Solana RPC and Solana Pulse; none went to Coinbase's analytics.
- **Not run:** the model step in `npm start`, because it needs an Anthropic API key.

`src/pulse-guard.ts` and `src/wallet.ts` are the same in every template. See [../README.md](../README.md) for the settings.
