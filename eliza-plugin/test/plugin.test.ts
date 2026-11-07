// Replays real answers recorded from the live Solana Pulse (test/fixtures, made by scripts/record-fixtures.mjs).
// fetch is replaced, so nothing goes out. Run: npx tsx --test test/plugin.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, it } from "node:test";
import plugin, { ACTION_NAMES, assertSafeToSign, createPulsePlugin, findAddress, findError, findSignature, findTicker, findTx, PulseBlockedError } from "../src/index";

const fixture = (tool: string) => JSON.parse(readFileSync(new URL(`./fixtures/${tool}.json`, import.meta.url), "utf8"));
const DRAINER_TX: string = fixture("check_tx").input.tx;
const V1_SIGNATURE: string = fixture("explain_tx").input.tx_id;
const JUP = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN";

type Seen = { url: string; headers: Record<string, string>; body: any };
let seen: Seen[] = [];
let answer: (tool: string) => Response;
const realFetch = globalThis.fetch;

beforeEach(() => {
  seen = [];
  answer = (tool) => new Response(JSON.stringify(fixture(tool).body), { status: 200, headers: { "content-type": "application/json" } });
  globalThis.fetch = (async (url: string, init: any) => {
    seen.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    return answer(url.split("/").pop()!);
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

const runtime = (settings: Record<string, string> = {}) => ({ getSetting: (k: string) => settings[k] ?? null });
const message = (text: string) => ({ content: { text, source: "test" } });
const action = (name: string) => plugin.actions.find((a) => a.name === name)!;

async function run(name: string, text: string, options?: Record<string, unknown>, settings?: Record<string, string>) {
  const said: string[] = [];
  const result = await action(name).handler(runtime(settings), message(text), undefined, options, async (r) => said.push(r.text));
  return { result, said };
}

describe("plugin shape", () => {
  it("has every action with a description, similes and an example", () => {
    assert.equal(plugin.name, "solana-pulse");
    assert.deepEqual(plugin.actions.map((a) => a.name), ACTION_NAMES);
    for (const a of plugin.actions) {
      assert.ok(a.description.length > 40, a.name);
      assert.ok(a.similes.length > 0, a.name);
      assert.equal(a.examples[0][1].content.actions?.[0], a.name);
    }
  });

  it("can load only some actions", () => {
    assert.deepEqual(createPulsePlugin({ actions: ["PULSE_CHECK_TX"] }).actions.map((a) => a.name), ["PULSE_CHECK_TX"]);
  });
});

describe("finding inputs by their exact shape", () => {
  it("tells a transaction, a signature and an address apart", () => {
    assert.equal(findTx(`check this ${DRAINER_TX}`), DRAINER_TX);
    assert.equal(findSignature(`what did ${V1_SIGNATURE} do`), V1_SIGNATURE);
    assert.equal(findAddress(`is ${JUP} safe?`), JUP);
    assert.equal(findAddress(`what did ${V1_SIGNATURE} do`), undefined, "a signature is never read as an address");
    assert.equal(findSignature(`is ${JUP} safe?`), undefined);
  });

  it("finds tickers and errors, and nothing in plain chat", () => {
    assert.equal(findTicker("what's the address for $BONK?"), "BONK");
    assert.equal(findTicker("find the token called Jupiter."), "Jupiter");
    assert.equal(findError("swap failed: custom program error: 0x1771"), "custom program error: 0x1771");
    assert.equal(findError("Transaction failed: InsufficientFundsForRent"), "InsufficientFundsForRent");
    for (const find of [findTx, findSignature, findAddress, findTicker, findError]) assert.equal(find("how are you today?"), undefined);
  });

  it("only offers an action when its input is in the message", async () => {
    assert.equal(await action("PULSE_CHECK_TX").validate(runtime(), message("is this safe to sign?")), false);
    assert.equal(await action("PULSE_CHECK_TX").validate(runtime(), message(`is this safe to sign? ${DRAINER_TX}`)), true);
    assert.equal(await action("PULSE_TOKEN_SAFETY").validate(runtime(), message(`is ${JUP} safe?`)), true);
  });
});

describe("answers from real Pulse data", () => {
  it("check_tx says BLOCK for the frozen-account transaction, with the reason", async () => {
    const { result, said } = await run("PULSE_CHECK_TX", `is this safe to sign? ${DRAINER_TX}`);
    assert.equal(result.success, true);
    assert.equal(result.values?.pulseVerdict, "BLOCK");
    assert.match(said[0], /^BLOCK: Dry run failed: AccountFrozen/);
    assert.match(said[0], /Source: Solana Pulse/);
    assert.equal(seen[0].body.tx, DRAINER_TX);
  });

  it("token_safety never claims a token is safe without saying what that means", async () => {
    const { said } = await run("PULSE_TOKEN_SAFETY", `is ${JUP} safe?`);
    assert.match(said[0], /can't promise a token is safe/);
    assert.equal(seen[0].body.token, JUP);
  });

  it("find_token gives the address and warns about copycats", async () => {
    const { said } = await run("PULSE_FIND_TOKEN", "address for $BONK?");
    assert.match(said[0], /DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263/);
    assert.match(said[0], /2 other tokens use a similar name/);
  });

  it("why_failed gives the meaning, cause and fix", async () => {
    const { said } = await run("PULSE_WHY_FAILED", "my swap failed with custom program error: 0x1771");
    assert.match(said[0], /Custom program error 6001/);
    assert.match(said[0], /Fix: /);
  });

  it("explain_tx and whats_this pass the right field", async () => {
    await run("PULSE_EXPLAIN_TX", `what did ${V1_SIGNATURE} do`);
    await run("PULSE_WHATS_THIS", "what is EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
    assert.deepEqual(seen.map((s) => Object.keys(s.body)[0]), ["tx_id", "address"]);
  });

  it("input from code wins over the message", async () => {
    await run("PULSE_TOKEN_SAFETY", "check this token", { token: JUP });
    assert.equal(seen[0].body.token, JUP);
  });
});

describe("when something is missing or fails", () => {
  it("asks for the input and calls nothing", async () => {
    const { result, said } = await run("PULSE_CHECK_TX", "is this safe?");
    assert.equal(result.success, false);
    assert.match(said[0], /base64/);
    assert.equal(seen.length, 0);
  });

  it("a used-up free tier says how to pay, never throws", async () => {
    const terms = Buffer.from(JSON.stringify({ accepts: [{ amount: "20000" }] })).toString("base64");
    answer = () => new Response("{}", { status: 402, headers: { "payment-required": terms } });
    const { result, said } = await run("PULSE_TOKEN_SAFETY", `is ${JUP} safe?`);
    assert.equal(result.success, false);
    assert.equal(result.data?.paymentRequired, true);
    assert.match(said[0], /25 free calls/);
    assert.match(said[0], /0\.02 USDC/);
  });

  it("an unreachable Pulse says so and is never a verdict", async () => {
    globalThis.fetch = (async () => {
      throw new Error("offline");
    }) as typeof fetch;
    const { result, said } = await run("PULSE_CHECK_TX", `check ${DRAINER_TX}`);
    assert.equal(result.success, false);
    assert.match(said[0], /Could not reach Solana Pulse/);
    assert.equal(result.values, undefined);
  });

  it("sends the key and uses another server when set, and names itself", async () => {
    await run("PULSE_TOKEN_SAFETY", `is ${JUP} safe?`, undefined, { PULSE_API_KEY: "k1", PULSE_URL: "https://example.test/" });
    assert.equal(seen[0].url, "https://example.test/api/tools/token_safety");
    assert.equal(seen[0].headers["x-api-key"], "k1");
    assert.match(seen[0].headers["user-agent"], /^elizaos-plugin-solana-pulse\//);
  });
});

describe("assertSafeToSign, for wallet code", () => {
  it("throws on BLOCK with Pulse's reason", async () => {
    await assert.rejects(assertSafeToSign({}, DRAINER_TX), (e: unknown) => e instanceof PulseBlockedError && e.verdict === "BLOCK" && /AccountFrozen/.test(e.message));
  });

  it("returns the check on OK", async () => {
    answer = () => new Response(JSON.stringify({ verdict: "OK", summary: "OK: sends 0.01 SOL." }), { status: 200 });
    assert.equal((await assertSafeToSign({}, DRAINER_TX))?.verdict, "OK");
  });

  it("REVIEW stops unless allowed", async () => {
    answer = () => new Response(JSON.stringify({ verdict: "REVIEW", summary: "REVIEW: new account." }), { status: 200 });
    await assert.rejects(assertSafeToSign({}, DRAINER_TX), PulseBlockedError);
    assert.equal((await assertSafeToSign({}, DRAINER_TX, { allowReview: true }))?.verdict, "REVIEW");
  });

  it("couldn't check is never treated as safe unless asked", async () => {
    globalThis.fetch = (async () => {
      throw new Error("offline");
    }) as typeof fetch;
    await assert.rejects(assertSafeToSign({}, DRAINER_TX), (e: unknown) => e instanceof PulseBlockedError && e.verdict === "UNKNOWN");
    assert.equal(await assertSafeToSign({}, DRAINER_TX, { onUnknown: "allow" }), null);
  });
});
