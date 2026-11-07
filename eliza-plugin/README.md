# elizaos-plugin-solana-pulse

[Solana Pulse](https://github.com/Timothymycompc/solana-pulse-ai-agent-gateway) safety checks for [elizaOS](https://github.com/elizaOS/eliza) agents. Before your agent signs or buys, it can check:

- **`PULSE_CHECK_TX`**: dry-runs a transaction on mainnet and answers OK, REVIEW or BLOCK, with each wallet's SOL and token changes. It catches drainer approvals, ownership changes, failures and expired blockhashes before you pay a fee.
- **`PULSE_TOKEN_SAFETY`**: answers SAFE, CAUTION or AVOID, with reasons, from a real sell test, whether liquidity can be pulled, the creator's record and insider wallets.
- **`PULSE_WHATS_THIS`**: what an address is (wallet, token mint, program or token account) before you send to it.
- **`PULSE_EXPLAIN_TX`**: what a sent transaction did, in plain words.
- **`PULSE_WHY_FAILED`**: why a transaction failed, from the error as you got it, with the fix.
- **`PULSE_FIND_TOKEN`**: the real token behind a ticker like `$BONK`, with a warning about copycats.

Every answer comes from live Solana mainnet data and names its source. An action runs only when its input is in the message (a base64 transaction, an address, a signature, a `$TICKER` or an error). If it isn't, the agent asks for it. Nothing is guessed. "SAFE" means none of the traps Pulse knows about are present; no check can promise a token is safe.

## Install

```bash
npm install elizaos-plugin-solana-pulse
```

Add it to your character:

```json
{ "plugins": ["@elizaos/plugin-bootstrap", "elizaos-plugin-solana-pulse"] }
```

Or in code:

```ts
import pulsePlugin, { createPulsePlugin } from "elizaos-plugin-solana-pulse";

const character = { /* ... */ plugins: [pulsePlugin] };
// Only some actions:
const checksOnly = createPulsePlugin({ actions: ["PULSE_CHECK_TX", "PULSE_TOKEN_SAFETY"] });
```

## Check before signing, from wallet code

```ts
import { assertSafeToSign, PulseBlockedError } from "elizaos-plugin-solana-pulse";

// tx: base64, a Transaction or a VersionedTransaction. Pass the runtime to use its settings.
const check = await assertSafeToSign(runtime, tx); // throws PulseBlockedError on BLOCK
```

It throws on BLOCK, and on REVIEW unless you pass `{ allowReview: true }`. If Pulse can't be reached or the free calls are used up, it also throws, because "couldn't check" is not "safe". Pass `{ onUnknown: "allow" }` to go ahead in that case.

To confirm a transfer or swap does exactly what the user asked (token, amount, recipient): `txMatches(runtime, tx, expected)`.

## Settings

| Setting | Default |
|---|---|
| `PULSE_API_KEY` | none. Optional: a key lifts the free limit. |
| `PULSE_URL` | the public Pulse server |

Read with `runtime.getSetting`, then the environment.

## Cost

Each tool gives 25 free calls a day per caller, with no key and no sign-up. After that a call costs $0.01 USDC ($0.02 for transaction checks and token safety), paid per request with [x402](https://github.com/x402-foundation/x402) on Solana. When the free calls run out, the action says so and how to pay. It never throws in chat. Calls that fail are never charged.

## Works with

elizaOS 1.x. Checked against the types of `@elizaos/core` 1.7.2. The package has no runtime dependencies.

## Tests

`npm test` replays real answers recorded from the live Pulse (`test/fixtures`, made by `scripts/record-fixtures.mjs`).

MIT licensed. See Pulse's [principles](https://github.com/Timothymycompc/solana-pulse-ai-agent-gateway/blob/main/PRINCIPLES.md).
