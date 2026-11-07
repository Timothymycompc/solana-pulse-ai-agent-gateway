// Records real answers from the live Solana Pulse for the plugin's tests. Each call carries x-pulse-test, so it shows in
// Pulse's usage log as the owner's test, never as a user. Run: node scripts/record-fixtures.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const BASE = "https://solana-pulse-gateway-1021990235790.us-central1.run.app";
const drainer = JSON.parse(readFileSync(new URL("../../tests/fixtures/preflight-drainer-approval.json", import.meta.url))).args.transaction;
const V1_SIGNATURE = "4nh2hRWKbWLdzJijZWgZv3Fgmh1bMrBUho5fWJFGJYAZkv7d9x3Yz2qMhAG5o2i6Qfd9AeRakKC88aqwtvg5Mr8H";
const CALLS = {
  check_tx: { tx: drainer },
  token_safety: { token: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN" },
  whats_this: { address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" },
  explain_tx: { tx_id: V1_SIGNATURE },
  find_token: { name: "BONK" },
  why_failed: { error: "custom program error: 0x1771" },
};
mkdirSync(new URL("../test/fixtures/", import.meta.url), { recursive: true });
for (const [tool, input] of Object.entries(CALLS)) {
  const res = await fetch(`${BASE}/api/tools/${tool}`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "elizaos-plugin-solana-pulse/record", "x-pulse-test": "eliza-plugin-fixtures" },
    body: JSON.stringify(input),
  });
  const body = await res.json();
  writeFileSync(new URL(`../test/fixtures/${tool}.json`, import.meta.url), JSON.stringify({ tool, recordedAt: new Date().toISOString(), status: res.status, input, body }, null, 2));
  console.log(tool, res.status, Object.keys(body).slice(0, 10).join(","), "|", String(body.summary ?? body.answer ?? body.verdict ?? "").slice(0, 120));
}
