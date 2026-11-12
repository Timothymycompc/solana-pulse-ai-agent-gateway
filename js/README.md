# solana-pulse

Check a Solana transaction before you sign it. One call, right before the signature:

```ts
import { checkBeforeSign } from "solana-pulse";

await checkBeforeSign(swapTransaction);   // throws PulseBlockedError unless Pulse answers OK
tx.sign([wallet]);
```

If your bot or agent signs transactions that someone else built (Jupiter's `/swap` or Ultra `/order`, PumpPortal, Bags,
a launchpad API), the key signs whatever comes back. `checkBeforeSign` dry-runs the unsigned transaction on live
mainnet first and stops anything that isn't what you meant: an extra transfer out of the wallet, a different output
token, a drainer approval, or a transaction that would simply fail.

```bash
npm install solana-pulse
```

No dependencies: uses `fetch` (Node 18+, browsers, edge runtimes). Takes base64, bytes, or a `@solana/web3.js`
`Transaction` / `VersionedTransaction`.

## Confirm it's the swap or transfer you asked for

```ts
// Jupiter swap: sells exactly 0.5 SOL and pays the bought USDC back to your own wallet, nothing else.
await checkBeforeSign(tx, { expected: { action: "swap", sell: "SOL", amount: "0.5", buy: USDC_MINT } });

// Transfer built from "send 5 USDC to X":
await checkBeforeSign(tx, { expected: { token: USDC_MINT, amount: "5", to: recipient } });
```

`PulseBlockedError` carries `.verdict` (`BLOCK`, `REVIEW`, `MISMATCH`, `UNKNOWN` or `PAYMENT_REQUIRED`), `.check`
(Pulse's full answer) and `.x402` (payment terms when free calls are used up). When Pulse can't be reached it throws
too: not checked is never treated as safe. `allowReview: true` accepts REVIEW.

Lower-level calls return Pulse's answer: `checkTx(tx)`, `txMatches(tx, expected)`, `tokenSafety(mint)`.

Every answer comes from live mainnet data and names its source. "OK" means none of the traps Pulse knows about are
present; no check can promise a transaction is safe.

## Pay automatically (opt-in, from 0.2.0)

By default a call past the free tier throws `PAYMENT_REQUIRED`. Give the client a wallet and caps and it pays those calls itself with [x402](https://github.com/x402-foundation/x402) (USDC on Solana), so a busy bot keeps running:

```ts
// npm install solana-pulse @x402/fetch @x402/svm @solana/kit
await checkBeforeSign(tx, {
  pay: { secretKey: payerKeypair.secretKey, maxPerCallUsd: 0.05, maxPerDayUsd: 1 },
});
```

- Caps are checked against Pulse's price **before anything is signed**: a call over `maxPerCallUsd`, or one that would take today's total (UTC, this process) over `maxPerDayUsd`, throws `PAYMENT_REFUSED` and nothing is paid. Defaults: $0.05 per call, $50 a day.
- Only USDC on Solana mainnet is ever paid. The paying wallet needs USDC but no SOL (the facilitator pays network fees).
- A payment is counted only when the paid call succeeds. Pulse never charges a call that fails.
- Off unless you pass `pay`. Without it the package has no dependencies and never pays.

## Cost

Each tool gives 25 free calls a day per caller, with no key. After that a call costs $0.02 USDC, paid per request with
[x402](https://github.com/x402-foundation/x402), or set `PULSE_API_KEY` / pass `apiKey`. Calls that fail are never
charged.

## Also

- Python: `pip install solana-pulse` ([PyPI](https://pypi.org/project/solana-pulse/))
- Coinbase AgentKit: `npm install agentkit-solana-pulse`
- elizaOS: `npm install elizaos-plugin-solana-pulse`
- MCP server and HTTP API: [Solana Pulse](https://github.com/Timothymycompc/solana-pulse-ai-agent-gateway)

Tests replay real answers recorded from the live service. MIT license.
