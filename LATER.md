# Later

Ideas parked on purpose. Solana Pulse is finished as it is; nothing here goes in until it's picked as the next piece of work. New ideas go at the bottom.

## Shared starter (for every chain's project)
- Per-payment failover: if Coinbase's facilitator fails a payment, PayAI's tries it, so either can settle. Today PayAI only takes over when Coinbase is unreachable at startup.
- Pull the shared plumbing (payments, free calls, usage log, secrets, MCP and HTTP server, owner dashboard) out of Solana Pulse into a small starter each new chain begins from.

## Solana Pulse
- Publish the accuracy test's catch rate and false-alarm rate (README, site) once its first 100 tokens are followed up (built 2026-10-16: server/accuracy.ts).
- token_safety metadata check: a Token-2022 token whose metadata update authority is 1111…1111 (none) is reported as "can still be changed by 11111111111111111111111111111111" (Tesla xStock, 2026-10-16). It should read as locked.
- Coinbase Bazaar: confirm the tools get listed now that its checker and indexer receive 402; add output examples to the listings (Bazaar ranks complete listings higher).
- Accept payments on Base as well as Solana.
- Live usage page: leave bots out of the "callers besides you" counts.
- Get the 8 renamed tools listed on PayAI's directory under their new names.

- X menu (npm run x): approve or add queue posts from the menu instead of editing x-queue.ts and deploying.

- Short address for free: Firebase Hosting (e.g. solanapulse.web.app) forwarding to Cloud Run. Check first: the free-call allowance must still see each caller's own address through the extra hop (trust proxy), Firebase cuts requests at 60s (keep Cloud Scheduler on the run.app address for video posts), then update links, llms.txt, mcp.json and the registry. Or a paid domain once there is income. Another registry entry is called "Solana Pulse XaaS", so a distinct address helps.

- Post to more places, the X poster's way (same pick of what to post, one small sender per platform, all in the pulsex menu). Asked 2026-10-16. Open questions for Tim: which channels (Discord webhook into his own server; Telegram bot into his own channel; Bluesky with an app password; Farcaster, which usually needs paid Neynar), and whether alerts should reach him (Telegram DM recommended: first payment, new real caller, site down, failed post; also covers the uptime alerts CLAUDE.md asks for). Automated posts only in places he owns; other communities get a prepared post he shares by hand.
- Weekly X stats must not mislead: name the share from the biggest single client (week of 2026-10-12: algebra-executor made 940 of 1,226 calls) and say the owner's own tests from unrecognised networks may be included.
- tx_matches swaps (2026-10-19): take an optional minimum the agent's quote promised and check received against it, so a route that pays far less than quoted is caught. Today it says what arrives but doesn't judge the price.
- Done 2026-10-19 (Tim chose: up to 1% is a fee note): tips and fees in swaps, measured by the everyday test.
- check_tx unknown programs: 58 of 70 "other" everyday transactions got REVIEW for programs check_tx doesn't know (42 programs: perps, games, bots). A sourced list could name more of them, e.g. programs with a verified build (OtterSec's verify API), each named with its source. Measure the REVIEW rate before and after with npm run everyday.
- Run npm run everyday:record on Google Cloud (a Cloud Run job), not the phone: one phone run died on a DNS drop at 149 of 200.

## Next projects
- EVM token safety (Base first, then Ethereum, BNB, Arbitrum, Polygon), its own repo, 8-15 tools.
- Trading tools (asked 2026-10-16): MCP tools that look for trading edges and run trades safely. Edges and execution are two separate pieces. The edge part needs market data Pulse does not have yet (price history, volume, order flow). Any edge it claims must be backtested on recorded data, with the measured win rate, fees and slippage published. Never a "this will go up" verdict from a hunch. The execution part fits Pulse well: token_safety before every buy, a sell-test simulation, a hard spending cap per trade and per day, a dry-run mode by default, and the user signing every trade. Start only after the 2026-10-16 token_safety audit bugs are fixed.
- Compromised-wallet check (from Tim's own first wallet, 2026-10-20): a stolen key shows on chain as every incoming deposit leaving within seconds, in full, to the same address (here 5qmt…XUKq, an active sweeper holding ~61 SOL), plus bursts of failed sends racing for the balance. A tool (or a wallet/history field) could say "this wallet looks drained: don't send to it" with the transactions as the source. Measure on known drained and healthy wallets first. Also note address poisoning: lookalike senders (5Gu1…ArSH copying 5Guz…KrSH) sending dust.
- Agent Kit plugin (agent-kit/, built 2026-10-20; 0.1.0 published to npm 2026-10-20, later versions via GitHub Trusted Publishing): ask SendAI to list it. Then opt-in automatic x402 payment from the agent's own wallet with a per-call and per-day spending cap (off by default); today a used-up free tier returns payment_required with the terms.
- From the first-wallet case study (2026-10-20, 598 tokens a real beginner bought, mostly 2023; data in the session scratchpad, private):
  - Done 2026-10-20 (Tim said yes): dead tokens are AVOID when Jupiter's router says not tradable. The 628 tokens are benchmark/first-wallet.json.
  - Mint or freeze power still on is datable to the buy day (it can only be given up): 279 of 315 now-dead tokens had it when bought, against 0 of 7 that kept their value. Worth a line in the accuracy write-up (small kept group).
  - 170 of 598 sell tests were skipped because Jupiter's keyless tier turned them away: the Jupiter key matters.
  - Jupiter's first_traded is later than the real buy for 43 of 52 older tokens: it's the first pool Jupiter knows, not the launch. The age check must not treat it as launch time for old tokens.
  - Copycat tickers really get bought: fake "BTC", "ARB" and "SBONK" are in the losers. find_token's copycat warning is the fix; use them as test cases.
