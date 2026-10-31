// CrawlHive (crawlhive.xyz). Measured on mainnet on 2026-10-30.
// Raw data: ~/v1-ready FINDINGS.md section 4, results/crawlhive-*, results/money-DgCogtUu*.json, proofs/5MRa9r*.json.
import type { Report } from "./types";

export const crawlhive: Report = {
  name: "crawlhive",
  kind: "code",
  published: { at: "2026-10-30", told: "GitHub issue h100envy/crawl-hive#6 was posted" },
  project: "CrawlHive",
  repo: "https://github.com/h100envy/crawl-hive",
  commit: "72dd7ab5 (last public commit; development moved private on 2026-10-24)",
  summary: "CrawlHive reads other people's transactions with maxSupportedTransactionVersion: 0 in 13 places. Since 2026-09-15 a version 1 transaction read that way fails with RPC error -32015, so scans miss buys and a version 1 burn would not be credited. Nobody had been hit as of 2026-10-30.",
  findings: [
    {
      title: "Sniper, first-buyer and bundle scans drop version 1 buys",
      severity: "breaks accuracy",
      what: "Early buys are fetched with version 0 and failures become null (.catch(() => null)), so every version 1 buy is skipped without an error. A token can look cleaner than it is. In 2,201 sampled blocks from Oct 16-30, 55% of swaps on Pump.fun's bonding curve were version 1.",
      where: ["src/lib/server/scan-snipers.ts:114", "src/lib/server/scan-first-buyers.ts:120", "src/lib/server/scan-first-buyers.ts:152", "src/lib/server/scan-bundles.ts:79"],
      fix: "maxSupportedTransactionVersion: 1 in these calls.",
    },
    {
      title: "Burn-to-pay would not credit a version 1 burn",
      severity: "breaks money",
      what: "The user's burn is read with version 0, so for a burn sent as version 1 the read throws on the first try and the confirm request errors out after the tokens are already burned.",
      where: ["src/lib/server/user-burns.ts:147", "src/lib/server/spawn-burn.ts:160"],
      fix: "maxSupportedTransactionVersion: 1 in these calls.",
    },
    {
      title: "Same read in seven more places",
      severity: "breaks accuracy",
      what: "These also read transactions with version 0 and fail on version 1.",
      where: ["src/lib/server/tg-verify.ts:168", "src/lib/server/rewards.ts:227", "src/lib/server/buyback.ts:383", "src/lib/server/dexfund.ts:197", "src/lib/server/solana.ts:316", "src/lib/server/proof.ts:319", "src/components/proof-card.tsx:65"],
      fix: "maxSupportedTransactionVersion: 1. @solana/web3.js is already ^1.99.0, the first 1.x that reads version 1, so nothing else changes.",
    },
  ],
  issue: "https://github.com/h100envy/crawl-hive/issues/6",
  facts: [
    { label: "$CRAWLHIVE transactions since burn-to-pay launched (Oct 21 18:20 UTC)", value: "1,743 successful: 415 version 1 (24%), 1,216 version 0, 112 legacy", source: "Every signature for the mint, each read with getTransaction max version 1", checkedAt: "2026-10-30T22:38:15Z" },
    { label: "Burns of $CRAWLHIVE in that window", value: "2, both version 0, both by BUYBACK_TREASURY. No user burned to pay, so no payment was lost.", source: "spl-token burn/burnChecked instructions on the mint in those transactions", checkedAt: "2026-10-30T22:38:15Z" },
    { label: "Treasury income since Oct 10", value: "71 transactions (55 legacy, 16 version 0, 0 version 1); 54 incoming, about 2.78 SOL and 11.12 USDC", source: "Treasury wallet and its USDC account, every signature since 2026-10-10", checkedAt: "2026-10-30T22:45:39Z" },
  ],
  proof: [
    { signature: "5MRa9rSrdwN2Ys5eLqPG5rhXj73sw1tQ1iz5uG5nsEMKBmnY9aakLMHybH5c8WC35AGZTEa4pUxEppGN3atZCoyB", slot: 463414568, withMaxVersion0: "error -32015: Transaction version (1) is not supported by the requesting client", withMaxVersion1: "the transaction, version 1", checkedAt: "2026-10-30T22:20:00Z" },
  ],
  watched: [
    { label: "$CRAWLHIVE token", address: "D4jNDQa3Cu4v8VMCAc2z7pgGGo7aGqzjXmwGR9wapump", kind: "token", source: "src/lib/token.ts and README" },
    { label: "BUYBACK_TREASURY (project treasury; spawn payments go here)", address: "DgCogtUuki6MZzypK1dKHYWfHLMUnKkNUBQwo6rWTGUJ", kind: "wallet", source: "src/lib/economy.ts:47 and README" },
  ],
};
