# agentkit-solana-pulse

[Solana Pulse](https://github.com/Timothymycompc/solana-pulse-ai-agent-gateway) for
[Coinbase AgentKit](https://github.com/coinbase/agentkit): check a Solana transaction before the agent signs it.

AgentKit agents sign what an API hands them: Jupiter's swap transaction, a launchpad's buy, a payment from a checkout
API. If that response is ever wrong (a bad config, a compromised endpoint, a proxy in between), the wallet signs it
anyway. This provider dry-runs the unsigned transaction on live mainnet first and only signs when it does what was
asked.

```ts
import { AgentKit } from "@coinbase/agentkit";
import { solanaPulseActionProvider } from "agentkit-solana-pulse";

const agentkit = await AgentKit.from({
  walletProvider,                                   // any SvmWalletProvider
  actionProviders: [solanaPulseActionProvider()],
});
```

## Actions

| Action | What it does |
| --- | --- |
| `SolanaPulseActionProvider_check_tx` | Dry-runs a base64 transaction and answers **OK**, **REVIEW** or **BLOCK** with what each wallet gains and loses. |
| `SolanaPulseActionProvider_tx_matches` | Confirms a swap sells exactly that amount and pays the bought token back to this wallet, or a transfer sends exactly that token and amount to that recipient. |
| `SolanaPulseActionProvider_token_safety` | **SAFE**, **CAUTION** or **AVOID** for a token, with reasons from a real sell test. |
| `SolanaPulseActionProvider_check_and_send` | Signs and sends with the agent's wallet only after Pulse answers OK (and, with `expected`, MATCH). Otherwise returns why it didn't. |

Actions are offered on Solana wallets only (mainnet and devnet).

## From your own code

Put the check right where the agent signs:

```ts
import { checkedSignAndSend, checkBeforeSign, PulseBlockedError } from "agentkit-solana-pulse";

// Jupiter swap: check, confirm it's the swap that was asked for, then sign and send.
const { signature } = await checkedSignAndSend(walletProvider, swapTransactionBase64, {
  expected: { action: "swap", sell: "SOL", amount: "0.5", buy: USDC_MINT },
});

// Or only the check, before your own signing code:
await checkBeforeSign(tx);   // throws PulseBlockedError unless Pulse answers OK
```

`PulseBlockedError` carries `.verdict` (`BLOCK`, `REVIEW`, `MISMATCH`, `UNKNOWN` or `PAYMENT_REQUIRED`) and `.check`
(Pulse's full answer). When Pulse can't be reached, the transaction is **not** signed: not checked is never treated as
safe.

Every answer comes from live mainnet data and names its source. "OK" means none of the traps Pulse knows about are
present; no check can promise a transaction is safe.

## Settings

`solanaPulseActionProvider({ apiKey, baseUrl, allowReview })`. `apiKey` defaults to `PULSE_API_KEY`, `baseUrl` to
`PULSE_URL`. `allowReview: true` lets `check_and_send` sign on REVIEW (default: OK only).

## Cost

Each tool gives 25 free calls a day per caller, with no key. After that a call costs $0.02 USDC, paid per request with
[x402](https://github.com/x402-foundation/x402), or use a key. When free calls run out, actions return
`{ payment_required: true, x402 }` with the terms instead of throwing. Calls that fail are never charged.

## Tests

`npm test` replays real answers recorded from the live service; the AgentKit integration test runs when
`@coinbase/agentkit` is installed.

Part of [Solana Pulse](https://github.com/Timothymycompc/solana-pulse-ai-agent-gateway) ([principles](https://github.com/Timothymycompc/solana-pulse-ai-agent-gateway/blob/main/PRINCIPLES.md)). MIT license.
