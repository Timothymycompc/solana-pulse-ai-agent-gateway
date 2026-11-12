// Replays real answers recorded from the live Solana Pulse (test/fixtures, recorded by python/scripts/record_fixtures.py).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { VersionedTransaction } from "@solana/web3.js";
import { checkBeforeSign, checkTx, PulseBlockedError, toBase64, tokenSafety } from "../src/index";

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"));
const TRANSFER: string = fixture("check_tx_transfer").input.tx;
const DRAINER: string = fixture("check_tx_drainer").input.tx;

const sent: { tool: string; body: any; headers: Record<string, string> }[] = [];
function replay(answers: Record<string, string | number | Error>) {
  sent.length = 0;
  globalThis.fetch = (async (url: string, init: any) => {
    const tool = String(url).split("/").pop()!;
    sent.push({ tool, body: JSON.parse(init.body), headers: init.headers });
    const a = answers[tool];
    if (a instanceof Error) throw a;
    if (typeof a === "number") return new Response("{}", { status: a, headers: { "payment-required": Buffer.from(JSON.stringify({ accepts: [{ amount: "20000" }] })).toString("base64") } });
    return new Response(JSON.stringify(fixture(a).body), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

test("OK: returns Pulse's check", async () => {
  replay({ check_tx: "check_tx_transfer" });
  const check = await checkBeforeSign(TRANSFER);
  assert.equal(check.verdict, "OK");
  assert.equal(sent[0].body.tx, TRANSFER);
  assert.match(sent[0].headers["user-agent"], /^solana-pulse-js\//);
});

test("BLOCK: throws with Pulse's reason", async () => {
  replay({ check_tx: "check_tx_drainer" });
  await assert.rejects(checkBeforeSign(DRAINER), (e: PulseBlockedError) => e.verdict === "BLOCK" && /AccountFrozen/.test(e.message));
});

test("expected: a correct transfer passes, a wrong amount is refused", async () => {
  replay({ check_tx: "check_tx_transfer", tx_matches: "tx_matches_transfer" });
  const ok = await checkBeforeSign(TRANSFER, { expected: fixture("tx_matches_transfer").input.expected });
  assert.equal(ok.tx_matches.verdict, "MATCH");
  replay({ check_tx: "check_tx_transfer", tx_matches: "tx_matches_transfer_wrong_amount" });
  await assert.rejects(checkBeforeSign(TRANSFER, { expected: fixture("tx_matches_transfer_wrong_amount").input.expected }), (e: PulseBlockedError) => e.verdict === "MISMATCH");
});

test("couldn't reach Pulse: never treated as safe", async () => {
  replay({ check_tx: new TypeError("fetch failed") });
  await assert.rejects(checkBeforeSign(TRANSFER), (e: PulseBlockedError) => e.verdict === "UNKNOWN");
});

test("free calls used up: PAYMENT_REQUIRED with the x402 terms", async () => {
  replay({ check_tx: 402 });
  await assert.rejects(checkTx(TRANSFER), (e: PulseBlockedError) => e.verdict === "PAYMENT_REQUIRED" && (e.x402 as any).accepts[0].amount === "20000");
});

test("takes a web3.js VersionedTransaction and sends the key", async () => {
  replay({ check_tx: "check_tx_transfer" });
  const tx = VersionedTransaction.deserialize(Buffer.from(TRANSFER, "base64"));
  assert.equal(toBase64(tx), TRANSFER);
  await checkTx(tx, { apiKey: "k-1", network: "devnet" });
  assert.equal(sent[0].headers["x-api-key"], "k-1");
  assert.equal(sent[0].body.network, "devnet");
});

test("token_safety passes the verdict through", async () => {
  replay({ token_safety: "token_safety_jup" });
  assert.equal((await tokenSafety("JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN")).verdict, "SAFE");
});
