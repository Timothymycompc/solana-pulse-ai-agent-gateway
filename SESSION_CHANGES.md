# Session changes

This file summarizes the project work completed during this coding session.

## Visitor trial and paid calls

- Added a 27-call anonymous trial per visitor, so a new visitor can try calls without connecting a wallet.
- Shared trial usage across metered HTTP data routes and MCP tools. After the trial, successful calls cost one credit (0.0022 SOL) and require an API key.
- Added signed visitor cookies, server-side usage tracking, trial status reporting, and refunds for failed metered calls.
- Updated the wallet dialog, playground trial counter, cURL examples, endpoint information, pricing copy, and documentation to explain the trial.

## MCP intelligence tools

- Added ten read-only, documented tools: `get_wallet_snapshot`, `summarize_wallet_activity`, `resolve_token_symbol`, `get_token_market_snapshot`, `analyze_token_concentration`, `compare_tokens`, `inspect_address`, `explain_transaction_effects`, `analyze_wallet_portfolio`, and `estimate_transaction_cost`.
- Added their schemas and descriptions to the MCP documentation and discovery information.
- Verified that the live MCP `tools/list` response includes all ten tools.

## Playground and navigation

- Reorganized the homepage and playground to make the main task and starter examples easier to find.
- Moved account, live usage, and diagnostics into a supporting-tools disclosure.
- Made MCP documentation cards show summaries first, with detailed schemas and outputs available on demand.
- Added editable JSON-RPC `tools/call` examples for all ten intelligence tools to the API playground. The playground sends these through the live `/mcp` endpoint, tracks their shared trial usage, and includes cookie persistence in copied cURL commands.
- Marked these MCP calls as read-only in the playground so the POST transport does not trigger a misleading state-change warning.

## API, docs, and safety

- Updated the README, standalone docs page, `llms.txt`, MCP discovery metadata, endpoint descriptions, and page metadata for the current tools and trial behavior.
- Improved wallet connection guidance and API request/result handling in the playground.
- Changed invalid network selection to fail closed instead of silently defaulting to mainnet.
- Kept sample output labeled as illustrative where values are live and may change; did not add fabricated testimonials or usage counts.

## Verification and release

- Production builds passed in Termux and Debian.
- Deployed Cloud Run revision `solana-pulse-gateway-00116-cxx` for commit `072c74ea`.
- Verified the live build endpoint and the 27-call trial status endpoint. Verified all ten MCP tools in the live MCP tool list.
- The project lint command still reports three existing missing exports in `test_payment_flow.ts`: `recordPayment`, `isPaymentAlreadyUsed`, and `consumePayment`. No test script is defined in `package.json`.
- Debian has no interactive GitHub credentials, so its direct `git push` attempt failed. Changes were published through the connected GitHub account instead.

## Current checkout and live deployment

- Termux, Debian, and GitHub `main` are synced at commit `072c74ea` for the playground update.
- Confirmed the live homepage references the latest bundle and that the deployed JavaScript contains the new MCP tool selections.
