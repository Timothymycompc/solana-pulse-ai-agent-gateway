import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import { answerLine, groupTrail, moneyFlow, parseTrail, REPORT_FORM, reportUrl } from "../src/lib/flow";
import { describeUrl, rpcMethods } from "../server/trail";

// Real responses from the live service (2026-10-29), saved by running each tool's own live example.
const load = (name: string) => JSON.parse(fs.readFileSync(`tests/fixtures/flow/${name}.json`, "utf8"));

test("check_tx: what would come in and go out for the signer, with the receiving wallet", () => {
  const flow = moneyFlow("check_tx", load("check_tx"))!;
  assert.equal(flow.wallet, "5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9");
  assert.deepEqual(flow.cameIn, []);
  assert.equal(flow.wentOut.length, 1);
  assert.deepEqual(flow.wentOut[0], { amount: "0.0100052", symbol: "SOL", other: ["Brpc8HoPo1d3Uiyo7kbERnjMqwLJJmbWxtwxHxzar6DU"] });
  assert.match(flow.note!, /Nothing has moved yet/);
});

test("explain_tx: the fee payer's USDT went out and every receiver is named", () => {
  const body = load("explain_tx");
  const flow = moneyFlow("explain_tx", body)!;
  const usdt = flow.wentOut.find((m) => m.symbol === "USDT")!;
  assert.equal(usdt.amount, "1148.6");
  const receivers = body.token_changes.filter((r: any) => r.symbol === "USDT" && Number(r.change) > 0).map((r: any) => r.owner);
  assert.equal(receivers.length, 3, "this transaction paid USDT to three wallets");
  assert.deepEqual(usdt.other, receivers);
  assert.ok(flow.wentOut.some((m) => m.symbol === "SOL"), "SOL out (fee and rent) is listed");
});

test("trace: every flow lands on the right side, with its counterparty and transaction", () => {
  const body = load("trace");
  const flow = moneyFlow("trace", body)!;
  assert.equal(flow.wallet, body.wallet);
  assert.equal(flow.cameIn.length, 0, "all 10 recorded flows went out");
  const first = flow.wentOut[0];
  assert.deepEqual(first, { amount: "0.51344317", symbol: "SOL", other: [body.flows[0].counterparty], time: body.flows[0].time, tx: body.flows[0].tx_id });
  assert.ok(flow.wentOut.some((m) => m.symbol === "USDT" && m.amount === "35.59"));
});

test("tools without money movement get no money flow", () => {
  assert.equal(moneyFlow("balance", { wallet: "x", sol: "1" }), null);
  assert.equal(moneyFlow("check_tx", "not json"), null);
});

test("report link: fills only what the call knows, and stays on the Pulse repo's form", () => {
  const explain = reportUrl("explain_tx", load("explain_tx.args"), load("explain_tx"))!;
  assert.ok(explain.startsWith(REPORT_FORM));
  const q = new URL(explain).searchParams;
  assert.equal(q.get("template"), "suspicious-transaction.yml");
  assert.equal(q.get("signature"), load("explain_tx.args").tx_id);
  assert.match(q.get("pulse_answer")!, /^explain_tx said Succeeded/);

  const check = new URL(reportUrl("check_tx", load("check_tx.args"), load("check_tx"))!).searchParams;
  assert.equal(check.get("signature"), null, "an unsigned transaction has no signature yet");
  assert.match(check.get("pulse_answer")!, /check_tx said REVIEW: /);
  assert.match(check.get("pulse_answer")!, /base64/);

  const trace = new URL(reportUrl("trace", load("trace.args"), load("trace"))!).searchParams;
  assert.equal(trace.get("wallet"), load("trace.args").wallet);
  assert.equal(reportUrl("balance", { wallet: "x" }, {}), null);
});

test("answer line uses the verdict when there is one", () => {
  assert.equal(answerLine("check_tx", { verdict: "BLOCK", summary: "Drains the wallet." }), "check_tx said BLOCK: Drains the wallet.");
  assert.equal(answerLine("trace", { report: { problem: "None found." } }), "trace said None found.");
});

test("trail: RPC method names from single and batch bodies; outside URLs lose addresses and query", () => {
  assert.deepEqual(rpcMethods(JSON.stringify({ method: "getBalance" })), ["getBalance"]);
  assert.deepEqual(rpcMethods(JSON.stringify([{ method: "getTransaction" }, { method: "getTransaction" }])), ["getTransaction", "getTransaction"]);
  assert.deepEqual(rpcMethods("garbage"), ["unknown"]);
  assert.deepEqual(describeUrl("https://api.rugcheck.xyz/v1/tokens/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/report?x=1"), { to: "RugCheck", what: "/v1/tokens/{address}/report" });
});

test("trail: unreadable headers are ignored; repeated calls group with a count", () => {
  assert.equal(parseTrail(null), null);
  assert.equal(parseTrail("{nope"), null);
  const steps = parseTrail(JSON.stringify([
    { to: "Solana RPC", what: "getSignaturesForAddress", at: 0, ms: 80, ok: true },
    { to: "Solana RPC", what: "getTransaction", at: 85, ms: 100, ok: true },
    { to: "Solana RPC", what: "getTransaction", at: 90, ms: 120, ok: false },
  ]))!;
  const grouped = groupTrail(steps);
  assert.equal(grouped.length, 2);
  assert.deepEqual({ ...grouped[1] }, { to: "Solana RPC", what: "getTransaction", at: 85, ms: 125, ok: false, count: 2, failed: 1 });
});
