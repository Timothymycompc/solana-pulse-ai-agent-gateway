// The Telegram bot: what it reads from a message, how it words real answers, and that free calls and logging work
// like the API's. The answers in fixtures/telegram/ are real tool output recorded from the live server on 2026-10-22.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import express from "express";
import { formatExplainTx, formatFindToken, formatTokenSafety, formatWhatsThis, handleUpdate, parseAsk, telegramWebhook, webhookSecret, type BotDeps } from "../server/telegram";

const fixture = (name: string) => JSON.parse(fs.readFileSync(path.join("tests/fixtures/telegram", name), "utf8"));
const BONK = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
const SIG = "4eKP4PXxvDq2pUXEK3cfHK6mop1hJ5BWghuLSRDjFvqxoHKcXMCZ2eASg7MZd4Vq8N9bf7Q8VUXhSbUoNmEmD6Eb";

test("reads addresses and signatures from bare text and from links", () => {
  assert.deepEqual(parseAsk(BONK, false), { kind: "token_or_address", address: BONK });
  assert.deepEqual(parseAsk(`https://pump.fun/coin/${BONK}`, false), { kind: "token_or_address", address: BONK });
  assert.deepEqual(parseAsk(`look https://solscan.io/tx/${SIG}?cluster=mainnet`, false), { kind: "tx", signature: SIG });
  assert.deepEqual(parseAsk("is $BONK legit?", false), { kind: "ticker", name: "BONK" });
  assert.deepEqual(parseAsk("/find bonk", false), { kind: "ticker", name: "bonk" });
  assert.deepEqual(parseAsk("hello", false), { kind: "help" }, "a private chat with nothing to check gets the help text");
});

test("in a group it answers only its commands, so normal chat never uses free calls", () => {
  assert.deepEqual(parseAsk(BONK, true), { kind: "none" });
  assert.deepEqual(parseAsk("gm $BONK", true), { kind: "none" });
  assert.deepEqual(parseAsk(`/check@SolanaPulseBot ${BONK}`, true), { kind: "token_or_address", address: BONK });
  assert.deepEqual(parseAsk("/help@SolanaPulseBot", true), { kind: "help" });
});

test("a token verdict keeps the honest SAFE wording and names its sources", () => {
  const text = formatTokenSafety(fixture("token_safety-bonk.json"), BONK);
  assert.match(text, /none of the scam traps we know about/);
  assert.match(text, /can't make a token safe/);
  assert.match(text, /Sources: .*Solana mainnet/);
  assert.ok(text.includes(BONK));
  assert.ok(text.length < 4096, "fits one Telegram message");
});

test("a failed check is shown first and an AVOID is never softened", () => {
  const avoid = { verdict: "AVOID", summary: "The sale was blocked.", about: { symbol: "SCAM" }, checks: [
    { name: "freeze_authority", result: "pass", detail: "Nobody can freeze.", source: "on-chain" },
    { name: "sell_test", result: "fail", detail: "A real holder's sale failed in a simulation.", source: "simulation" },
  ] };
  const text = formatTokenSafety(avoid, BONK);
  assert.match(text, /AVOID/);
  assert.ok(text.indexOf("sell test") < text.indexOf("Passed"));
});

test("transaction, address and name answers read as plain words with a source", () => {
  const tx = formatExplainTx(fixture("explain_tx-ok.json"), SIG);
  assert.match(tx, /Succeeded/);
  assert.match(tx, /Source: Solana mainnet/);
  const addr = formatWhatsThis(fixture("whats_this-wallet.json"), "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1");
  assert.match(addr, /program-derived address/);
  const name = formatFindToken(fixture("find_token-bonk.json"));
  assert.ok(name.includes(BONK), "the real BONK address is the best match");
});

// A fake Telegram and a fake meter: every reply, free call and logged run is kept so the test can look at it.
function fakeDeps(o: { freeLeft?: number; status?: number; token?: boolean; owner?: number[] } = {}) {
  let left = o.freeLeft ?? 25;
  const log = { sent: [] as string[], ran: [] as string[], refunds: 0, recorded: [] as any[] };
  const deps: BotDeps = {
    runTool: async (tool) => { log.ran.push(tool); return { status: o.status ?? 200, body: o.status ? { error: "RPC down" } : fixture("token_safety-bonk.json") }; },
    isToken: async () => o.token ?? true,
    send: async (_chat, html) => { log.sent.push(html); },
    typing: async () => {},
    reserve: async () => (left-- > 0),
    refund: async () => { log.refunds++; },
    record: async (r) => { log.recorded.push(r); },
    ownerIds: new Set(o.owner ?? []),
  };
  return { deps, log };
}
const message = (text: string, from = 7, type = "private") => ({ update_id: 1, message: { message_id: 3, text, chat: { id: 99, type }, from: { id: from, is_bot: false } } });

test("a token address runs token_safety, uses one free call and is logged", async () => {
  const { deps, log } = fakeDeps();
  await handleUpdate(message(BONK), deps);
  assert.deepEqual(log.ran, ["token_safety"]);
  assert.equal(log.recorded.length, 1);
  assert.equal(log.recorded[0].owner, false);
  assert.match(log.sent[0], /SAFE/);
});

test("other addresses get whats_this instead", async () => {
  const { deps, log } = fakeDeps({ token: false });
  await handleUpdate(message(BONK), deps);
  assert.deepEqual(log.ran, ["whats_this"]);
});

test("after the free calls, it says so and runs nothing", async () => {
  const { deps, log } = fakeDeps({ freeLeft: 0 });
  await handleUpdate(message(BONK), deps);
  assert.deepEqual(log.ran, []);
  assert.match(log.sent[0], /used today's 25 free token checks/);
});

test("a failed run gives the free call back", async () => {
  const { deps, log } = fakeDeps({ status: 502 });
  await handleUpdate(message(BONK), deps);
  assert.equal(log.refunds, 1);
  assert.match(log.sent[0], /never count against/);
});

test("the owner's own checks are unlimited and marked as the owner's", async () => {
  const { deps, log } = fakeDeps({ freeLeft: 0, owner: [7] });
  await handleUpdate(message(BONK), deps);
  assert.deepEqual(log.ran, ["token_safety"]);
  assert.equal(log.recorded[0].owner, true);
});

test("the webhook turns away anything without Telegram's secret, and answers a resent update once", async () => {
  const { deps, log } = fakeDeps();
  const app = express().use(express.json()).post("/hook", telegramWebhook("123:abc", deps));
  const server = app.listen(0);
  const url = `http://127.0.0.1:${(server.address() as any).port}/hook`;
  const post = (secret: string) => fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": secret }, body: JSON.stringify(message(BONK)) });
  try {
    assert.equal((await post("wrong")).status, 401);
    assert.equal((await post(webhookSecret("123:abc"))).status, 200);
    assert.equal((await post(webhookSecret("123:abc"))).status, 200);
    assert.equal(log.ran.length, 1, "the same update_id twice runs once");
  } finally { server.close(); }
});
