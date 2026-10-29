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
- Trading tools (asked 2026-10-16): MCP tools that look for trading edges and run trades safely. Edges and execution are two separate pieces. The edge part needs market data Pulse does not have yet (price history, volume, order flow). Any edge it claims must be backtested on recorded data, with the measured win rate, fees and slippage published. Never a "this will go up" verdict from a hunch. The execution part fits Pulse well: token_safety before every buy, a sell-test simulation, a hard spending cap per trade and per day, a dry-run mode by default, and the user signing every trade. Start only after the 2026-10-16 token_safety audit bugs are fixed. Asked again 2026-10-29: build the full transaction (not only check it) so a trade can run end to end automatically. Same conditions: Pulse builds and checks, the user's own wallet or agent signs, caps and dry run on by default, and every edge measured before any automation trades real money.
- Compromised-wallet check (from Tim's own first wallet, 2026-10-20): a stolen key shows on chain as every incoming deposit leaving within seconds, in full, to the same address (here 5qmt…XUKq, an active sweeper holding ~61 SOL), plus bursts of failed sends racing for the balance. A tool (or a wallet/history field) could say "this wallet looks drained: don't send to it" with the transactions as the source. Measure on known drained and healthy wallets first. Also note address poisoning: lookalike senders (5Gu1…ArSH copying 5Guz…KrSH) sending dust.
- Agent Kit plugin (agent-kit/, built 2026-10-20; 0.1.0 published to npm 2026-10-20, later versions via GitHub Trusted Publishing): ask SendAI to list it. Then opt-in automatic x402 payment from the agent's own wallet with a per-call and per-day spending cap (off by default); today a used-up free tier returns payment_required with the terms.
- From the first-wallet case study (2026-10-20, 598 tokens a real beginner bought, mostly 2023; data in the session scratchpad, private):
  - Done 2026-10-20 (Tim said yes): dead tokens are AVOID when Jupiter's router says not tradable. The 628 tokens are benchmark/first-wallet.json.
  - Mint or freeze power still on is datable to the buy day (it can only be given up): 279 of 315 now-dead tokens had it when bought, against 0 of 7 that kept their value. Worth a line in the accuracy write-up (small kept group).
  - 170 of 598 sell tests were skipped because Jupiter's keyless tier turned them away: the Jupiter key matters.
  - Jupiter's first_traded is later than the real buy for 43 of 52 older tokens: it's the first pool Jupiter knows, not the launch. The age check must not treat it as launch time for old tokens.
  - Copycat tickers really get bought: fake "BTC", "ARB" and "SBONK" are in the losers. find_token's copycat warning is the fix; use them as test cases.

## From the Dexra study (2026-10-20, full notes on the phone: SolanaPulse/competitors-2026-10-20.txt)
Dexra (dexra.dev) is the closest competitor: token/launch verdicts, closed source, launched 2026-10-17. Ideas worth doing after current work, each measured before it ships:
- "Check before signing" example PRs into popular bot repos (Chainstack's pumpfun-bonkfun-bot, 0xfnzero/sol-trade-sdk), the way Dexra added "check before buying" examples.
- Ready-to-fork agent templates (Solana Agent Kit, Vercel AI SDK, Claude Agent SDK, elizaOS) with check_tx + tx_matches built in, dry run by default.
- A public accuracy endpoint/page from the existing accuracy test (Dexra's score_performance publishes collapse rates with confidence intervals), and public call stats.
- One-command install into many MCP clients; Zed and Gemini CLI extensions.
- More lists: jaw9c/awesome-remote-mcp-servers, Merit-Systems/awesome-agentic-commerce, mcp.so.
- Possible collaboration with Dexra (token check + transaction check); outreach file 13 on the phone.
- Owner dashboard bot detection (found 2026-10-21): two networks (58bd04, 00273c) ran 128 calls over 3 days while claiming to be Chrome on Linux, Chrome on Windows AND Safari on macOS at the same time, and a burst on 2026-10-18 20:43-21:06 came from ~8 networks with mixed browser names. These are crawlers faking browser user agents, but the dashboard counts them as "Browser". Rule to add (measure first): a network seen with 2+ different desktop OS/browser user agents within an hour is a bot. Until then, never report browser callers as people without checking their inputs (pulse-inputs). Partly done 2026-10-21: the owner Explorer flags such networks as "fake browser" and shows own/example/empty inputs; the Overview, Callers and /status counts still count them as browsers.

## From the walkthrough video (2026-10-21)
- Connect page: copy-paste setups for agent frameworks that already speak remote MCP, so no new package is needed: Vercel AI SDK, LangChain/LangGraph (langchain-mcp-adapters), OpenAI Agents SDK, Claude Agent SDK, Mastra. Each one run for real against /mcp before it goes on the page.
- token_safety on BONK skipped the sell test twice on 2026-10-21 ("the token's holders could not be read right now"), so the most-used tokens may never get a sell test. Find out why before relying on it.

## Found 2026-10-22 (Telegram bot work)
- token_safety wording: on BONK the summary says "the creator has no rug record" and then "RugCheck is unavailable ... the creator's rug history were not checked", and Sources lists RugCheck although it couldn't be reached. Make the summary and the source list say only what was really checked.
- whats_this calls a wallet that holds tokens but no SOL "Nothing exists here yet" (e.g. the payout wallet). True for the SOL account, misleading for a person; say it holds no SOL and check for token accounts.
- Telegram bot: optional "address spotting" in groups (answer any pasted token address without /check, as RugCheck-style bots do). Needs privacy mode off in @BotFather and a per-group switch, so a busy group doesn't burn everyone's free checks.

## New project idea (Tim, 2026-10-22): scam app and site checker, built like Solana Pulse
Turn the by-hand investigations (luckquexa, GameVault, Boomwins, Prog Coin) into tools, same architecture as Pulse
(one tool registry, HTTP + MCP, x402, Telegram bot, recorded real cases as tests, measured accuracy). Its own repo.
- Possible tools: check_site (domain age, registrar, hosting, TLS history from crt.sh, Cloudflare front, sister domains
  on the same IPs/registrar batch), check_payment_page (lookalikes of real payment processors), check_telegram
  (bot/channel age, posts, links out, "earn/withdraw" mini-app patterns), check_app (APK signer, package name, what it can
  install), traffic_report (netlook on a phone capture), report_kit (abuse contacts from RDAP + ready-to-send texts).
- Every rule backed by a real recorded case, like Pulse's benchmark. A clean result only means "none of the known traps".
- Open questions: who pays (people checking a site won't pay per call; maybe free for people, paid API for wallets,
  exchanges and app stores), data limits (RDAP/WHOIS privacy, rate limits), and keeping it separate from Pulse.

## New Token Watch (Tim asked 2026-10-23)
Built 2026-10-23 as 0.7.0 (server/watch.ts, /track-record), without any buy-timing signal on purpose. Still open:
- /watch <token> in the Telegram bot: alert people when a watched token's liquidity is pulled or an authority moves.
- Use the watch's readings in the accuracy answers (when a token lost most, not only whether), once a few weeks of data exist.
- Post the first week of watch numbers on X with the track record link.

## Found while building the agent templates (2026-10-25)
- why_failed / check_tx wording: a plain SOL transfer of more than the wallet holds explains InsufficientFunds as
  "The source token account does not hold enough tokens (Assumes the failing program is SPL Token)". The verdict
  (BLOCK) is right; the explanation should say "not enough SOL" when the failing instruction is the System Program.
- Owner dashboard: Tim's own Claude Code sessions (Pulse is in his MCP config) show up as 16 "AI app" callers from
  different networks with 0 runs. Label them "You" (for example by the claude-code user agent plus 0 runs from those
  networks, or a header in his own config) so they are not read as possible users.
- LangChain's MCP client (@modelcontextprotocol/client 2.4) tried only the IPv6 address from the phone and timed out;
  plain fetch worked. Worth one line in docs/connect if users report it.
- Templates: token transfers and swaps (the guard already takes a swap `expected`); a Telegram /send demo bot.

## From the 7-day recheck, group 1 (2026-10-26; not before the grant decision)
- Group 1 (41 young tokens): AVOID did not separate losers (5 of 9 lost most vs CAUTION 22 of 32). Age at check did:
  19 of 19 first-hour tokens lost 90%+, 0 of 9 tokens 30h+ old did. insiders check showed no signal (67% vs 66%).
  Prediction for groups 2 and 3 written down first: phone SolanaPulse/applications/young-tokens-group1-notes-2026-10-26.txt
- If it holds on groups 2-3: sample a new cohort of 1-3-day-old tokens (groups 2-3 have only 2), then propose, with the
  numbers, whether age weighs more in the verdict and insiders less. The 90% "lost most" line stays as set.

## Found testing the Claude connector (2026-10-26)
- Free calls are counted per IP (trial_tool_usage.ip_hash). Every claude.ai connector call comes from Anthropic's
  servers (all 33 of Tim's test calls came from one network, de6a62, as Claude-User / Anthropic/Toolbox), so Claude
  users share one 25-a-day-per-tool counter per Anthropic address: one busy user can use up everyone's free calls.
  Not a leak (paid tools still need a key or payment past 25). Fix to weigh: count by MCP session or client, or a
  higher shared allowance for known hosted clients, measured first on how many outside Claude callers exist.
- de6a62 in known.json ("curl 8.5.0 sweep, probably Tim's Claude cloud session") is really Anthropic's network, so
  any Claude user shows up there, not just Tim. Re-label before counting callers from it.

## Token_safety re-weighting (from the 100-token accuracy test, 2026-10-26; measure before shipping)
- Finding (74/100, consistent with group 1): AVOID does NOT separate losers from CAUTION (AVOID 11/16 lost 90%+ vs
  CAUTION 38/58). The signal is AGE (flagged young 76% lost vs older-passed 17%) and creator_history (76% vs 50%).
  insiders (76% vs 63%) and liquidity_pull (55% vs 68%, backwards) carry little/no signal on young tokens.
- Plan: for tokens under ~2 days old, weight the verdict toward age + creator_history; reduce insiders + liquidity_pull
  influence. Build on a branch, run server/accuracy.ts on the same 100 + a FRESH cohort, compare lost-most separation
  before/after. Ship only if the new weighting beats the current. Publish before/after. In the grant update as a
  measured milestone (section 8). Do NOT change live rules during grant review.

## check_tx gaps found while writing the Solana Foundation pre-sign guide (2026-10-27)
- Durable nonce (first ix System AdvanceNonceAccount = never expires; a signed copy stays valid) and authority changes outside SPL Token (Stake Authorize, BPF Upgradeable SetAuthority, System AuthorizeNonceAccount) are not checked. Add as REVIEW/fail with fixtures + benchmark cases. After the grant review.

## Forensics feedback from Tim's Claude app session (2026-10-26/27, ~45 calls tracing a drained wallet)
Worked: explain_tx (balances, signers, fee payer; the fee payer exposed one key co-signing for many wallets), memos in history, whats_this, owner key over a claude.ai connector.
Ranked by impact:
1. history: add per-transaction net SOL/token change for the queried wallet + main counterparty (a trace went ~45 calls instead of ~5).
2. history: pagination (`before` cursor; stops at 50 today).
3. explain_tx: batch 10-20 tx_ids per call.
4. Name more programs: srmqPvym... (OpenBook/Serum v3) showed null; "closed OpenBook order account, rent went to X".
5. BUG (false data, fix first): whats_this said "never received anything" for 5Gu1..., which had received dust and then emptied. Should say "previously active, now empty".
6. why_failed / failure.explanation null for "`from` must not carry data" (common System transfer error).
Biggest idea: a `trace`/`risk` tool for drained-wallet investigations: lookalike-address (poisoning) dust, a fee payer co-signing for many unrelated wallets in one burst, known drainers, exchange-sized destinations. Must follow PRINCIPLES (every flag from real data with source; measured on real cases before shipping).

## Tag-to-trace X bot (parked 2026-10-28; Tim hates doing social media himself)
- Opt-in only: someone tags @solanapulsebots with a wallet, transaction or question; the bot runs the right Pulse tool (trace, why_failed, whats_this, explain_tx) and Claude writes ONE reply in plain words with the real result and a matching video link. Never replies unprompted (X bans keyword-based automated replies; AI reply bots need X's written approval).
- Needs: X's AI reply bot approval (application text: draft it), X API pay-per-use credits (~$0.20 per reply with a link per third-party guides, unverified), an Anthropic API key (a few cents per reply).
- Build after the grant's first payment or first income. Until then the X poster (pulse-x-post, PAUSED, 16 approved video posts, own timeline only) can run for ~$5 of credits if Tim wants.

## From a Gemini review (2026-10-28), checked against the code
- trace: flag SetAuthority / Assign on the wallet's token accounts (ownership handed over without tokens moving). Not checked today.
- trace: show the drain destination's current balance so a collector hub reads differently from a personal wallet.
- wallet, tokens, token_account: return `slot` like balance does, so agents can compare freshness.
- fee: optional `accounts` or `intent` (transfer/swap) input for local fee markets before the tx is built (after the fee-market.ts fix ships).
- find_token: `can_mint_more` as an enum (none / wallet / program-controlled) instead of boolean|null; LST mints are program-controlled.
- x402lens.com lists the service as "Unreachable": find which path its crawler checks.

## From an outside review (2026-10-29), checked against the code and our own uptime check
- Uptime (corrected the same day after reading Cloud Run's request counts): Glama's 53.9% over 54 days is REAL, not a robot quirk. All requests failed 2026-09-06..09-19 (cause unknown, logs expired) and 09-28..10-05 (Google Cloud billing disabled). Clean since 10-18. Written up in the README "Uptime, honestly" section. Still open: the uptime check only calls /api/debug/build, so a broken /mcp would not alert; add a second check on /mcp (POST initialize). The number recovers only as old days fall out of Glama's window.
- check_tx: a "what to do" line for every REVIEW/BLOCK check, not only failed dry runs (today only simulation carries "Fix:"). E.g. unlimited approval -> approve the exact amount; authority change -> don't sign unless you meant to hand it over; outflow to an extra wallet -> rebuild without that instruction; stale blockhash -> rebuild with a fresh one.
- Custom rules in check_tx: caller passes simple limits (max SOL per tx, allowed recipients/programs, max approval amount, daily limit) and they are checked in the same call next to the default checks. Daily limit needs per-caller state; decide where it lives first.
- DONE 2026-10-29: suspicious-transaction issue form (.github/ISSUE_TEMPLATE/suspicious-transaction.yml, label suspicious-tx), linked from the README Tests section. Label created on GitHub.
- Self-host guide: the code is MIT but there is no step-by-step to run it locally or on someone's own Cloud Run (which secrets are needed, which tools work without payments).

## trace false alarms from Tim's cash-out investigation (2026-10-29)
- Fixed: 5 exchange deposit addresses swept into the collection wallet B48k…KAAn were "high, seed leaked"; now medium with swept_to_collection_wallet (benchmark/trace-cashout.ts, results file). Both real drains (Kunal, Adilak) still high.
- Rejected on data: "don't escalate when the fee payer pays for many wallets". Both real drains had busy fee payers (FkaL…3MZp 1,000 tx in 12 min, 9WL2…YHx6 1,000 in 7.2 h).
- Still open: 2 trading-bot wallets (FrJW…Eyc, Hvyu…59ix) stay "high". Their sweeps go to quiet wallets or pools, and their "other fee payers" (Fnca, HBQ2) are a bot service's relayers paid by the wallet. Needs more bot-wallet examples before a rule (one bot per pattern would be guessing).
