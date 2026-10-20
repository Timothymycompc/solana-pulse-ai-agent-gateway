import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { Keypair, PublicKey, SystemProgram, Transaction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { KeypairWallet, SolanaAgentKit, createLangchainTools, createVercelAITools } from "solana-agent-kit";
import pulse, { actions, createPulsePlugin, toBase64, TOOLS } from "../src/index";

// A stand-in for the Pulse server: records each request and answers what the test sets.
async function fakePulse(answer: (path: string, body: any) => { status: number; body?: unknown; headers?: Record<string, string> }) {
  const seen: { path: string; body: any; headers: http.IncomingHttpHeaders }[] = [];
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = raw ? JSON.parse(raw) : {};
      seen.push({ path: req.url ?? "", body, headers: req.headers });
      const a = answer(req.url ?? "", body);
      res.writeHead(a.status, { "content-type": "application/json", ...(a.headers ?? {}) });
      res.end(JSON.stringify(a.body ?? {}));
    });
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, seen, close: () => server.close() };
}

const agentFor = (url: string, key?: string) =>
  new SolanaAgentKit(new KeypairWallet(Keypair.generate(), "http://127.0.0.1:1"), "http://127.0.0.1:1", { OTHER_API_KEYS: { PULSE_URL: url, ...(key ? { PULSE_API_KEY: key } : {}) } });

test("every Pulse tool is one action with a name, phrases, a description and a schema that takes its example", () => {
  assert.equal(actions.length, TOOLS.length);
  assert.equal(new Set(actions.map((a) => a.name)).size, actions.length);
  for (const a of actions) {
    assert.match(a.name, /^PULSE_[A-Z_]+$/);
    assert.ok(a.similes.length >= 3, a.name);
    assert.ok(a.description.length > 80, a.name);
    const example = a.examples[0][0].input;
    // Placeholders like "<base64>" stand for real values; the rest must be valid input as written.
    if (!JSON.stringify(example).includes("<")) assert.ok(a.schema.safeParse(example).success, `${a.name} example`);
  }
});

test("a call goes to /api/tools/<name> with the plugin's user agent and the key, and returns Pulse's answer", async () => {
  const pulseServer = await fakePulse(() => ({ status: 200, body: { verdict: "SAFE", summary: "none of the traps we know about" } }));
  try {
    const agent = agentFor(pulseServer.url, "trial-key-123").use(pulse);
    const out = await (agent.methods as any).pulseTokenSafety(agent, { token: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" });
    assert.deepEqual(out, { status: "success", verdict: "SAFE", summary: "none of the traps we know about" });
    const req = pulseServer.seen[0];
    assert.equal(req.path, "/api/tools/token_safety");
    assert.deepEqual(req.body, { token: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", network: "mainnet-beta" }, "defaults filled in");
    assert.match(String(req.headers["user-agent"]), /^solana-agent-kit-plugin-pulse\/\d/);
    assert.equal(req.headers["x-api-key"], "trial-key-123");
  } finally {
    pulseServer.close();
  }
});

test("used-up free calls come back as a payment_required result with the price, not a throw", async () => {
  const terms = Buffer.from(JSON.stringify({ x402Version: 2, accepts: [{ scheme: "exact", amount: "20000", asset: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" }] })).toString("base64");
  const pulseServer = await fakePulse(() => ({ status: 402, headers: { "payment-required": terms } }));
  try {
    const agent = agentFor(pulseServer.url).use(pulse);
    const out = await (agent.methods as any).pulseCheckTx(agent, { tx: "A".repeat(40) });
    assert.equal(out.status, "error");
    assert.equal(out.payment_required, true);
    assert.match(out.message, /0\.02 USDC/);
    assert.equal(out.x402.accepts[0].amount, "20000");
    assert.equal(pulseServer.seen[0].headers["x-api-key"], undefined, "no key sent when none is set");
  } finally {
    pulseServer.close();
  }
});

test("Pulse's own errors keep their fix; bad input never reaches the network", async () => {
  const pulseServer = await fakePulse(() => ({ status: 400, body: { error: "That isn't a Solana address.", fix: "Pass the token's mint address." } }));
  try {
    const agent = agentFor(pulseServer.url).use(pulse);
    assert.deepEqual(await (agent.methods as any).pulseWhatsThis(agent, { address: "nope" }), { status: "error", message: "That isn't a Solana address.", fix: "Pass the token's mint address." });
    const bad = await (agent.methods as any).pulseConvert(agent, { token: "SOL" });
    assert.equal(bad.status, "error");
    assert.match(bad.message, /amount/);
    assert.equal(pulseServer.seen.length, 1);
  } finally {
    pulseServer.close();
  }
});

test("transactions can be passed as objects: legacy ones serialize unsigned, versioned ones as they are", () => {
  const payer = Keypair.generate().publicKey;
  const ix = SystemProgram.transfer({ fromPubkey: payer, toPubkey: new PublicKey("11111111111111111111111111111112"), lamports: 1 });
  const legacy = new Transaction({ feePayer: payer, recentBlockhash: "11111111111111111111111111111111" }).add(ix);
  assert.equal(toBase64(legacy), Buffer.from(legacy.serialize({ requireAllSignatures: false, verifySignatures: false })).toString("base64"));
  const v0 = new VersionedTransaction(new TransactionMessage({ payerKey: payer, recentBlockhash: "11111111111111111111111111111111", instructions: [ix] }).compileToV0Message());
  assert.equal(toBase64(v0), Buffer.from(v0.serialize()).toString("base64"));
  assert.equal(toBase64("already-base64"), "already-base64");
});

test("the actions become Vercel AI and LangChain tools, and a subset plugin carries only what was asked", () => {
  const agent = agentFor("http://127.0.0.1:1").use(createPulsePlugin({ tools: ["check_tx", "token_safety"] }));
  assert.deepEqual(agent.actions.map((a) => a.name), ["PULSE_CHECK_TX", "PULSE_TOKEN_SAFETY"]);
  assert.deepEqual(Object.keys(agent.methods).sort(), ["pulseCheckTx", "pulseTokenSafety"]);
  assert.equal(Object.keys(createVercelAITools(agent, agent.actions)).length, 2);
  assert.equal(createLangchainTools(agent, agent.actions).length, 2);
  assert.throws(() => createPulsePlugin({ tools: ["nope" as any] }), /Unknown Solana Pulse tool/);
});
