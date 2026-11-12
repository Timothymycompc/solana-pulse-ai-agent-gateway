# solana-pulse

Check a Solana transaction before you sign it. One call, right before the signature:

```python
from solana_pulse import check_before_sign

check_before_sign(swap_tx)                       # raises PulseBlocked unless Pulse answers OK
signed = VersionedTransaction(swap_tx.message, [keypair])
```

If your bot or agent signs transactions that someone else built (Jupiter's `/swap` or Ultra `/order`, PumpPortal, Bags,
a launchpad API), the key signs whatever comes back. `check_before_sign` dry-runs the unsigned transaction on live
mainnet first and stops anything that isn't what you meant: an extra transfer out of the wallet, a different output
token, a drainer approval, or a transaction that would simply fail.

- **`check_tx`**: decodes each step, dry-runs it, and answers **OK**, **REVIEW** or **BLOCK** with each wallet's SOL and
  token changes.
- **`tx_matches`**: confirms a transfer or swap does exactly what you asked: token, amount and recipient, nothing hidden.
- **`token_safety`**: **SAFE**, **CAUTION** or **AVOID** for a token, with reasons, from a real sell test.

Every answer comes from live mainnet data and names its source. "OK" means none of the traps Pulse knows about are
present; no check can promise a transaction is safe.

## Install

```bash
pip install solana-pulse
```

No dependencies: the standard library only. Works with solders, solana-py, raw bytes or base64.

## Use

```python
from solana_pulse import check_before_sign, PulseBlocked, PulseUnavailable

# A Jupiter swap: also confirm it sells exactly what you asked and pays the bought token back to your wallet.
check = check_before_sign(
    tx,                                   # base64, bytes, or a solders VersionedTransaction (unsigned is fine)
    expected={"action": "swap", "sell": "SOL", "amount": "0.5", "buy": USDC_MINT},
)
print(check["summary"])                   # e.g. "OK: Your wallet sends: 0.5 SOL ..."

# A transfer built from "send 5 USDC to X":
check_before_sign(tx, expected={"token": USDC_MINT, "amount": "5", "to": recipient})
```

`check_before_sign` raises:

| Error | When |
| --- | --- |
| `PulseBlocked` | Pulse answered BLOCK, or REVIEW (unless `allow_review=True`), or the transfer/swap doesn't match `expected`. `.verdict` and `.check` hold Pulse's full answer. |
| `PulseUnavailable` | Pulse couldn't be reached or couldn't check. Not checked is never treated as safe. |
| `PulsePaymentRequired` | Today's free calls are used up. `.terms` holds the x402 payment terms. |
| `PulsePaymentRefused` | `pay` is set but the call was over a cap or couldn't be paid. Nothing was paid. |

Lower-level calls return Pulse's answer as a dict: `check_tx(tx)`, `tx_matches(tx, expected)`, `token_safety(mint)`, or
the same methods on `PulseClient(api_key=..., base_url=..., timeout=...)`.

## Pay automatically (opt-in, from 0.2.0)

By default a call past the free tier raises `PulsePaymentRequired`. Give the client a wallet and caps and it pays those
calls itself with [x402](https://github.com/x402-foundation/x402) (USDC on Solana), so a busy bot keeps running:

```python
# pip install "solana-pulse[pay]"
from solana_pulse import Pay, PulseClient

pulse = PulseClient(pay=Pay(secret_key="~/payer.json", max_per_call_usd=0.05, max_per_day_usd=1))
pulse.check_before_sign(tx)
```

- Caps are checked against Pulse's price **before anything is signed**: a call over `max_per_call_usd`, or one that
  would take today's total (UTC, this process) over `max_per_day_usd`, raises `PulsePaymentRefused` and nothing is
  paid. Defaults: $0.05 per call, $50 a day.
- `secret_key` is a keypair file path, its list of numbers, or 64 bytes. Only USDC on Solana mainnet is ever paid; the
  wallet needs USDC but no SOL (the facilitator pays network fees).
- A payment is counted only when the paid call succeeds. Pulse never charges a call that fails.
- Off unless you pass `pay`. Without it the package has no dependencies and never pays.

## Cost

Each tool gives 25 free calls a day per caller, with no key. After that a call costs $0.02 USDC (check_tx, tx_matches,
token_safety), paid per request with [x402](https://github.com/x402-foundation/x402), or set `PULSE_API_KEY`. Calls that
fail are never charged.

## Also

- JavaScript / TypeScript: `npm install solana-pulse` (`await checkBeforeSign(tx)`)
- Coinbase AgentKit: `npm install agentkit-solana-pulse` · elizaOS: `npm install elizaos-plugin-solana-pulse`
- MCP server and HTTP API: [Solana Pulse](https://github.com/Timothymycompc/solana-pulse-ai-agent-gateway)

## Tests

```bash
python -m unittest discover -s tests
```

The tests replay real answers recorded from the live service (`scripts/record_fixtures.py`); no network needed.

Part of [Solana Pulse](https://github.com/Timothymycompc/solana-pulse-ai-agent-gateway) ([principles](https://github.com/Timothymycompc/solana-pulse-ai-agent-gateway/blob/main/PRINCIPLES.md)). MIT license.
