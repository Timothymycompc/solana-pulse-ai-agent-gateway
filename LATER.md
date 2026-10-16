# Later

Ideas parked on purpose. Solana Pulse is finished as it is; nothing here goes in until it's picked as the next piece of work. New ideas go at the bottom.

## Shared starter (for every chain's project)
- Per-payment failover: if Coinbase's facilitator fails a payment, PayAI's tries it, so either can settle. Today PayAI only takes over when Coinbase is unreachable at startup.
- Pull the shared plumbing (payments, free calls, usage log, secrets, MCP and HTTP server, owner dashboard) out of Solana Pulse into a small starter each new chain begins from.

## Solana Pulse
- Measure token_safety on real rugs: record verdicts on ~100 new tokens, check a week later which ones rugged, publish the catch rate and false-alarm rate. Next up once the 2026-10-16 rule changes are deployed, so the recorded verdicts use them.
- token_safety metadata check: a Token-2022 token whose metadata update authority is 1111…1111 (none) is reported as "can still be changed by 11111111111111111111111111111111" (Tesla xStock, 2026-10-16). It should read as locked.
- Coinbase Bazaar: confirm the tools get listed now that its checker and indexer receive 402; add output examples to the listings (Bazaar ranks complete listings higher).
- Accept payments on Base as well as Solana.
- Live usage page: leave bots out of the "callers besides you" counts.
- Get the 8 renamed tools listed on PayAI's directory under their new names.

- X menu (npm run x): approve or add queue posts from the menu instead of editing x-queue.ts and deploying.

- Short address for free: Firebase Hosting (e.g. solanapulse.web.app) forwarding to Cloud Run. Check first: the free-call allowance must still see each caller's own address through the extra hop (trust proxy), Firebase cuts requests at 60s (keep Cloud Scheduler on the run.app address for video posts), then update links, llms.txt, mcp.json and the registry. Or a paid domain once there is income. Another registry entry is called "Solana Pulse XaaS", so a distinct address helps.

- Post to more places, the X poster's way (same pick of what to post, one small sender per platform, all in the pulsex menu). Asked 2026-10-16. Open questions for Tim: which channels (Discord webhook into his own server; Telegram bot into his own channel; Bluesky with an app password; Farcaster, which usually needs paid Neynar), and whether alerts should reach him (Telegram DM recommended: first payment, new real caller, site down, failed post; also covers the uptime alerts CLAUDE.md asks for). Automated posts only in places he owns; other communities get a prepared post he shares by hand.
- Weekly X stats must not mislead: name the share from the biggest single client (week of 2026-10-12: algebra-executor made 940 of 1,226 calls) and say the owner's own tests from unrecognised networks may be included.

## Next projects
- EVM token safety (Base first, then Ethereum, BNB, Arbitrum, Polygon), its own repo, 8-15 tools.
- Trading tools (asked 2026-10-16): MCP tools that look for trading edges and run trades safely. Edges and execution are two separate pieces. The edge part needs market data Pulse does not have yet (price history, volume, order flow). Any edge it claims must be backtested on recorded data, with the measured win rate, fees and slippage published. Never a "this will go up" verdict from a hunch. The execution part fits Pulse well: token_safety before every buy, a sell-test simulation, a hard spending cap per trade and per day, a dry-run mode by default, and the user signing every trade. Start only after the 2026-10-16 token_safety audit bugs are fixed.
