# Later

Ideas parked on purpose. Solana Pulse is finished as it is; nothing here goes in until it's picked as the next piece of work. New ideas go at the bottom.

## Shared starter (for every chain's project)
- Per-payment failover: if Coinbase's facilitator fails a payment, PayAI's tries it, so either can settle. Today PayAI only takes over when Coinbase is unreachable at startup.
- Pull the shared plumbing (payments, free calls, usage log, secrets, MCP and HTTP server, owner dashboard) out of Solana Pulse into a small starter each new chain begins from.

## Solana Pulse
- Measure token_safety on real rugs: record verdicts on ~100 new tokens, check a week later which ones rugged, publish the catch rate and false-alarm rate.
- Coinbase Bazaar: confirm the tools get listed now that its checker and indexer receive 402; add output examples to the listings (Bazaar ranks complete listings higher).
- Accept payments on Base as well as Solana.
- Live usage page: leave bots out of the "callers besides you" counts.
- Get the 8 renamed tools listed on PayAI's directory under their new names.

- X menu (npm run x): approve or add queue posts from the menu instead of editing x-queue.ts and deploying.

## Next projects
- EVM token safety (Base first, then Ethereum, BNB, Arbitrum, Polygon), its own repo, 8-15 tools.
