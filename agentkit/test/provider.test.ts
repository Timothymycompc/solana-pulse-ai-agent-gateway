// Replays real answers recorded from the live Solana Pulse (test/fixtures, recorded by python/scripts/record_fixtures.py).
// fetch is swapped for a fake that answers each tool from a fixture; the wallet is a fake that records what it signs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { VersionedTransaction } from "@solana/web3.js";
import { checkBeforeSign, PulseBlockedError, solanaPulseActionProvider, type SvmWalletLike } from "../src/index";

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"));
const TRANSFER: string = fixture("check_tx_transfer").input.tx;
const DRAINER: string = fixture("check_tx_drainer").input.tx;

const sent: { tool: string; body: any; headers: Record<string, string> }[] = [];
function replay(answers: Record<string, string | number>) {
  sent.length = 0;
  globalThis.fetch = (async (url: string, init: any) => {
    const tool = String(url).split("/").pop()!;
    sent.push({ tool, body: JSON.parse(init.body), headers: init.headers });
    const a = answers[tool];
    if (typeof a === "number") return new Response("{}", { status: a, headers: { "payment-required": Buffer.from(JSON.stringify({ accepts: [{ amount: "20000" }] })).toString("base64") } });
    return new Response(JSON.stringify(fixture(a).body), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

function wallet(networkId = "solana-mainnet") {
  const signed: unknown[] = [];
  const w: SvmWalletLike & { signed: unknown[] } = {
    signed,
    getPublicKey: () => ({ toBase58: () => "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM" }),
    getNetwork: () => ({ protocolFamily: "svm", networkId }),
    signAndSendTransaction: async (tx) => { signed.push(tx); return "sig-123"; },
  };
  return w;
}

const action = (w: SvmWalletLike, n: string) => solanaPulseActionProvider().getActions(w).find((a) => a.name.endsWith(n))!;

test("only Solana networks are supported", () => {
  const p = solanaPulseActionProvider();
  assert.equal(p.supportsNetwork({ protocolFamily: "svm" }), true);
  assert.equal(p.supportsNetwork({ protocolFamily: "evm" }), false);
});

test("actions follow AgentKit's naming and validate their input", () => {
  const actions = solanaPulseActionProvider().getActions(wallet());
  assert.deepEqual(actions.map((a) => a.name), ["SolanaPulseActionProvider_check_tx", "SolanaPulseActionProvider_tx_matches", "SolanaPulseActionProvider_token_safety", "SolanaPulseActionProvider_check_and_send"]);
  assert.equal(actions[0].schema.safeParse({ tx: "short" }).success, false);
  assert.equal(actions[1].schema.safeParse({ tx: TRANSFER, expected: { action: "swap", sell: "SOL", amount: "1", buy: "USDC" } }).success, true);
});

test("check_and_send signs and sends when Pulse answers OK", async () => {
  replay({ check_tx: "check_tx_transfer" });
  const w = wallet();
  const out = JSON.parse(await action(w, "check_and_send").invoke({ tx: TRANSFER }));
  assert.equal(out.sent, true);
  assert.equal(out.signature, "sig-123");
  assert.ok(w.signed[0] instanceof VersionedTransaction);
  assert.equal(sent[0].body.network, "mainnet-beta");
});

test("check_and_send refuses a BLOCK and never signs", async () => {
  replay({ check_tx: "check_tx_drainer" });
  const w = wallet();
  const out = JSON.parse(await action(w, "check_and_send").invoke({ tx: DRAINER }));
  assert.equal(out.sent, false);
  assert.equal(out.verdict, "BLOCK");
  assert.equal(w.signed.length, 0);
});

test("check_and_send refuses when the amount isn't what was asked", async () => {
  replay({ check_tx: "check_tx_transfer", tx_matches: "tx_matches_transfer_wrong_amount" });
  const w = wallet();
  const expected = fixture("tx_matches_transfer_wrong_amount").input.expected;
  const out = JSON.parse(await action(w, "check_and_send").invoke({ tx: TRANSFER, expected }));
  assert.equal(out.sent, false);
  assert.equal(out.verdict, "MISMATCH");
  assert.match(out.reason, /Wrong amount/);
  assert.equal(w.signed.length, 0);
});

test("used-up free calls: no signing, and the x402 terms are returned", async () => {
  replay({ check_tx: 402 });
  await assert.rejects(checkBeforeSign(TRANSFER), (e: PulseBlockedError) => e.verdict === "PAYMENT_REQUIRED");
  const out = JSON.parse(await action(wallet(), "check_tx").invoke({ tx: TRANSFER }));
  assert.equal(out.payment_required, true);
  assert.equal(out.x402.accepts[0].amount, "20000");
});

test("devnet wallets are checked on devnet; api key is sent", async () => {
  replay({ check_tx: "check_tx_transfer" });
  const p = solanaPulseActionProvider({ apiKey: "k-123" });
  await p.getActions(wallet("solana-devnet"))[0].invoke({ tx: TRANSFER });
  assert.equal(sent[0].body.network, "devnet");
  assert.equal(sent[0].headers["x-api-key"], "k-123");
});

test("token_safety passes Pulse's verdict through", async () => {
  replay({ token_safety: "token_safety_jup" });
  const out = JSON.parse(await action(wallet(), "token_safety").invoke({ token: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN" }));
  assert.equal(out.verdict, "SAFE");
});
