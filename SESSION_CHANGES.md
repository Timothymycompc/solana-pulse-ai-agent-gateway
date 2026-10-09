# Full session change list

This is the chronological inventory of the project changes covered by this coding session, from the live-wallet/API work through the playground update and release. Commit IDs are included so each section can be checked against Git history.

## 1. Live API, wallets, metering, and app consolidation

### Live wallet and account behavior

- Added or consolidated wallet challenge and sign-in flows, personal API keys, account lookup, credit balances, and call history.
- Added wallet-linked account state and per-key defaults so a signed-in developer can retain preferred request settings.
- Added the account panel and related wallet claim/profile/credit UI, and connected those views to the API.
- Kept API keys out of returned profile data and allowed the playground to send the supported key headers.

### API and payment behavior

- Consolidated usage metering and payment handling in the server and database code; removed the redundant metering middleware.
- Added/updated the Solana HTTP endpoints and MCP handlers for balances, blockhashes, token accounts, recent transactions, ATA lookup, transaction simulation and preflight validation, token profile, priority fees, and transaction decoding.
- Added credit and payment status handling and Helius payment webhook processing.
- Added token lookup/resolution support and made token-profile lookups time-bounded, cached, and tolerant of incomplete holder data.
- Updated endpoint defaults, schemas, examples, and caller-facing error handling to match the live routes.
- Moved supporting logic into focused modules including `authKey.ts`, `userDefaults.ts`, `resolver.ts`, `meter.ts`, and later `src/mcp/intelligenceTools.ts`; `server.ts` still owns many HTTP route registrations and was not fully split into small route modules.

### App simplification and cleanup

- Removed legacy or stale surfaces that were not part of the maintained product flow, including the AI discovery, Bash script, diagnostics, file-audit, devnet-wallet, and RPC-bridge studios.
- Removed the stale owner promotion and owner analytics panels and their navigation; retained the current service usage views.
- Removed unused diagnostic/snippet data and the obsolete metering layer as the maintained flows moved into the current API and playground.

Related history includes `0af02046`, `a1e59988`, `b1c7d748`, `2dec20b4`, `9c3895d1`, and `5e68214c`.

In chronological order, those commits cover per-key defaults/account behavior, token-profile timeouts and caching, development cleanup/refactoring, live wallet and API updates, integration of that wallet/API work, and removal of the stale owner panels.

## 2. Pages, docs, discoverability, and developer onboarding

- Refreshed the homepage, header, navigation, endpoint playground, MCP docs, standalone docs, and metadata to describe a hosted Solana API/MCP gateway for developers and agents.
- Added a developer home and step-by-step getting-started walkthrough.
- Reworked the playground request/response panes, endpoint selection, controls, endpoint examples, and wallet claim flow to make requests easier to configure and inspect.
- Added service usage/account presentation and connected it to live API data.
- Updated `README.md`, `public/docs/index.html`, `public/llms.txt`, server-generated `/llms.txt`, robots and sitemap information, and MCP discovery metadata to reflect the maintained routes and tools.
- Added VerifyMCP security metadata and adjusted page metadata for clearer service discovery.
- Labeled example response shapes as illustrative where live data can vary.

Related commits: `d23f2ed6` and `4831ce8b`.

The work touched both server and client surfaces: `server.ts`, `db.ts`, `meter.ts`, `resolver.ts`, `userDefaults.ts`, `authKey.ts`, `src/App.tsx`, `src/components/DeveloperHome.tsx`, `src/components/Toolbar.tsx`, `src/components/ApiGatewaySandbox.tsx`, `src/components/SecureWalletClaim.tsx`, `src/components/ServiceUsagePanel.tsx`, the sandbox components and endpoint data, `src/components/McpDocsView.tsx`, `README.md`, `index.html`, and the public docs/discovery files. Older unused studio components and data files were deleted as part of the cleanup above.

## 3. 27-call anonymous visitor trial and paid-call behavior

- Added a 27-successful-call trial per visitor, usable without wallet sign-in.
- Shared that allowance across metered HTTP data routes and MCP tools. After the trial, a successful call costs one credit (0.0022 SOL) and requires an API key.
- Added signed `pulse_trial` visitor cookies, hashed server-side visitor tracking, atomic usage reservations, a trial status endpoint, remaining-call reporting, and refunds for failed calls.
- Added trial status to the playground and surfaced the count in call responses and MCP metadata.
- Updated wallet connection copy, playground guidance, endpoint labels, cURL cookie-jar examples, README/docs/LLM discovery text, pricing and page metadata.

## 4. Ten additional intelligence MCP tools

Added ten read-only, documented tools that combine or interpret underlying chain and market data:

1. `get_wallet_snapshot` — SOL, token accounts, and recent activity in one response.
2. `summarize_wallet_activity` — recent successful/failed transaction counts and signatures.
3. `resolve_token_symbol` — token candidates from a ticker or name, ranked by reported liquidity.
4. `get_token_market_snapshot` — most liquid pair, price, liquidity, volume, and link.
5. `analyze_token_concentration` — top-ten token-account share and mint authority details.
6. `compare_tokens` — side-by-side supply, authorities, and concentration for two mints.
7. `inspect_address` — account/program/mint/token-account classification from chain data.
8. `explain_transaction_effects` — transaction status, fees, balance changes, and programs touched.
9. `analyze_wallet_portfolio` — estimated priced/unpriced SOL and token values.
10. `estimate_transaction_cost` — estimated base/priority fee plus simulation, without signing or broadcasting.

- Added schemas, input descriptions, cost/trial guidance, usage caveats, and examples in `src/mcp/intelligenceTools.ts`, MCP docs, server discovery metadata, and LLM-facing docs.
- Checked the live MCP `tools/list` response and confirmed all ten are registered in production.

## 5. Playground and visual navigation update

- Made the playground the obvious first task on the homepage and gave the starter instructions more room.
- Moved account, credits, live usage, and diagnostics into a supporting-tools disclosure.
- Changed the MCP docs list to show concise summaries first and expand schemas/output details on demand.
- Added a selectable, editable JSON-RPC `tools/call` request for each of the ten new MCP tools in the playground. These are MCP calls over `POST /mcp`, not separate REST routes.
- Updated playground billing awareness and cURL generation for MCP tool calls, including visitor-cookie persistence and refresh of the shared trial count.
- Marked the tool-call entries as read-only so the POST transport does not show an incorrect state-change warning.
- Kept request path, headers, and JSON body editable; added realistic example arguments where a live lookup can run directly.

## 6. Safety and data presentation

- Made invalid network values fail closed instead of silently selecting mainnet.
- Clarified when market values are third-party estimates, when account concentration does not mean unique people, and when transaction interpretation is incomplete.
- Kept testimonial and usage claims tied to real data; no fake testimonials or fabricated usage counts were added.

## 7. Build, release, and repository state

- Production builds passed in Termux and Debian for the application changes.
- Deployed the application and verified the live build endpoint, visitor trial status endpoint, and MCP tool list.
- Deployed playground commit `072c74ea` to Cloud Run revision `solana-pulse-gateway-00116-cxx`; checked that the live homepage points to the deployed bundle and that its JavaScript includes the new tool entries.
- The repository's `npm run lint` still reports three pre-existing missing exports in `test_payment_flow.ts` (`recordPayment`, `isPaymentAlreadyUsed`, and `consumePayment`). `package.json` has no test script.
- Direct `git push` from Debian/Google Cloud was attempted and failed because that environment has no interactive GitHub credentials. Commits were published using the connected GitHub account instead.
- Added this file as a fuller change inventory. The documentation-only commit does not change the deployed app.
- Termux, Debian, and GitHub `main` are synced at `5579c34f` (including this inventory); Cloud Run is serving app commit `072c74ea` on revision `solana-pulse-gateway-00116-cxx`.
