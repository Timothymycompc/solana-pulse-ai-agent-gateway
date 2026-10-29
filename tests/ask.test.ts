import { test } from "node:test";
import assert from "node:assert/strict";
import { askPulse, askTools } from "../server/ask";
import { TOOLS } from "../server/tools";
import { handleUpdate, parseAsk, type BotDeps } from "../server/telegram";

const WALLET = "5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9";

// A stand-in for the Messages API: returns the scripted replies in order and keeps every request it was sent.
function fakeClient(replies: any[]) {
  const sent: any[] = [];
  const client = { beta: { messages: { create: async (req: any) => { sent.push(structuredClone(req)); return replies.shift(); } } } };
  return { client: client as any, sent };
}
const toolUse = (id: string, name: string, input: unknown) => ({ stop_reason: "tool_use", content: [{ type: "tool_use", id, name, input }] });
const text = (t: string) => ({ stop_reason: "end_turn", content: [{ type: "text", text: t }] });

test("every Pulse tool is offered to the model with its input schema", () => {
  const tools = askTools();
  assert.equal(tools.length, TOOLS.length);
  const trace = tools.find((t) => t.name === "trace")!;
  assert.ok((trace.input_schema as any).properties.wallet, "trace takes a wallet");
});

test("runs the tool the model asks for, returns its result, and answers from it", async () => {
  const { client, sent } = fakeClient([toolUse("t1", "balance", { wallet: WALLET }), text("balance found 1.5 SOL in that wallet.")]);
  const runs: any[] = [];
  const result = await askPulse(`how much SOL is in ${WALLET}`, async (name, args) => { runs.push([name, args]); return { status: 200, body: { sol: "1.5" } }; }, client);
  assert.deepEqual(runs, [["balance", { wallet: WALLET }]]);
  assert.equal(result.answer, "balance found 1.5 SOL in that wallet.");
  assert.deepEqual(result.tools, [{ name: "balance", status: 200 }]);
  assert.equal(result.stopped, "done");
  const second = sent[1].messages;
  assert.equal(second[2].content[0].type, "tool_result");
  assert.equal(second[2].content[0].content, JSON.stringify({ sol: "1.5" }));
  assert.equal(sent[0].fallbacks, "default");
  assert.equal(sent[0].output_config.effort, "low");
});

test("a failed tool is passed back as an error, not dropped", async () => {
  const { client, sent } = fakeClient([toolUse("t1", "explain_tx", { tx_id: "bad" }), text("explain_tx couldn't read it, so that's unknown.")]);
  await askPulse("what happened in tx bad", async () => ({ status: 400, body: { error: "Invalid input." } }), client);
  assert.equal(sent[1].messages[2].content[0].is_error, true);
});

test("tool calls are capped: past six, the model is told to answer with what it has", async () => {
  const many = Array.from({ length: 8 }, (_, i) => ({ type: "tool_use", id: `t${i}`, name: "balance", input: { wallet: WALLET } }));
  const { client, sent } = fakeClient([{ stop_reason: "tool_use", content: many }, text("Partial answer.")]);
  let runs = 0;
  const result = await askPulse("check lots", async () => { runs++; return { status: 200, body: {} }; }, client);
  assert.equal(runs, 6);
  const results = sent[1].messages[2].content;
  assert.equal(results.length, 8, "every tool_use still gets a tool_result");
  assert.equal(results[7].is_error, true);
  assert.equal(sent[1].tool_choice.type, "none", "after the cap the model may not call tools again");
  assert.equal(result.answer, "Partial answer.");
});

test("a refusal or a model error gives no answer", async () => {
  const refused = await askPulse("x", async () => ({ status: 200, body: {} }), fakeClient([{ stop_reason: "refusal", content: [] }]).client);
  assert.equal(refused.stopped, "refusal");
  assert.equal(refused.answer, "");
  const broken = { beta: { messages: { create: async () => { throw new Error("down"); } } } } as any;
  assert.equal((await askPulse("x", async () => ({ status: 200, body: {} }), broken)).stopped, "error");
});

test("plain-English routing: only when on, only sentences; bare addresses keep the direct check", () => {
  assert.deepEqual(parseAsk("where did my sol go yesterday", false), { kind: "help" }, "off: same as before");
  assert.deepEqual(parseAsk("where did my sol go yesterday", false, true), { kind: "question", text: "where did my sol go yesterday" });
  assert.deepEqual(parseAsk(`where did the money in ${WALLET} go`, false, true), { kind: "question", text: `where did the money in ${WALLET} go` });
  assert.deepEqual(parseAsk(WALLET, false, true), { kind: "token_or_address", address: WALLET });
  assert.deepEqual(parseAsk("is $BONK legit?", false, true), { kind: "ticker", name: "BONK" }, "short: still the direct name search");
  assert.deepEqual(parseAsk("where did my sol go yesterday", true, true), { kind: "none" }, "groups: only commands");
  assert.deepEqual(parseAsk("/ask is this wallet drained", true, true), { kind: "question", text: "is this wallet drained" });
  assert.deepEqual(parseAsk("/ask is this wallet drained", true, false), { kind: "help" });
});

function botDeps(over: Partial<BotDeps> = {}) {
  const sentMsgs: string[] = [];
  const records: any[] = [];
  const reserves: string[] = [];
  const refunds: string[] = [];
  const deps: BotDeps = {
    runTool: async () => ({ status: 200, body: {} }), isToken: async () => false,
    send: async (_c, html) => { sentMsgs.push(html); }, typing: async () => {},
    reserve: async (_u, tool) => { reserves.push(tool); return true; }, refund: async (_u, tool) => { refunds.push(tool); },
    record: async (r) => { records.push(r); }, ownerIds: new Set(), ...over,
  };
  return { deps, sentMsgs, records, reserves, refunds };
}
const dm = (text: string) => ({ update_id: 1, message: { message_id: 1, text, chat: { id: 5, type: "private" }, from: { id: 9, is_bot: false } } });

test("bot: a question uses one 'ask' allowance, answers in safe HTML, and names the tools", async () => {
  const b = botDeps({ ask: async () => ({ answer: "trace found 2 SOL <sent> out.", tools: [{ name: "trace", status: 200 }, { name: "trace", status: 200 }], stopped: "done" }) });
  await handleUpdate(dm("where did the sol in my wallet go"), b.deps);
  assert.deepEqual(b.reserves, ["ask"]);
  assert.equal(b.sentMsgs[0], "trace found 2 SOL &lt;sent&gt; out.\n\n<i>Checked with trace.</i>");
  assert.equal(b.records[0].tool, "ask");
});

test("bot: a question that gets no answer is refunded and says so", async () => {
  const b = botDeps({ ask: async () => ({ answer: "", tools: [], stopped: "error" }) });
  await handleUpdate(dm("where did the sol in my wallet go"), b.deps);
  assert.deepEqual(b.refunds, ["ask"]);
  assert.match(b.sentMsgs[0], /didn't count against your questions/);
});

test("bot: without the API key, sentences get the help text as before", async () => {
  const b = botDeps();
  await handleUpdate(dm("where did the sol in my wallet go"), b.deps);
  assert.deepEqual(b.reserves, []);
  assert.match(b.sentMsgs[0], /Just paste one of these/);
  assert.doesNotMatch(b.sentMsgs[0], /Or ask in plain words/);
});
