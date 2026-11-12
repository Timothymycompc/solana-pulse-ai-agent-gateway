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
