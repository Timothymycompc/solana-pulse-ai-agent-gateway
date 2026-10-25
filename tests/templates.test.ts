// The agent templates' guard (templates/shared/pulse-guard.ts): signs only when check_tx says OK and tx_matches says
// MATCH, and refuses on everything else, including Pulse being unreachable or out of free calls. Replays real answers
// recorded by tests/record-template-fixtures.ts. No network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { checkBeforeSigning, type Expected } from "../templates/shared/pulse-guard";

const fixtures = JSON.parse(readFileSync(new URL("./fixtures/template-guard.json", import.meta.url), "utf8"));
const templatesDir = new URL("../templates/", import.meta.url);

// A fetch that answers each tool with the recorded answer for one case.
const replay = (c: any): typeof fetch => (async (url: string | URL | Request) => {
  const tool = String(url).split("/").pop() as "check_tx" | "tx_matches";
  return new Response(JSON.stringify(c[tool]), { status: 200 });
}) as typeof fetch;

const guard = (name: string) => checkBeforeSigning(fixtures[name].tx, fixtures[name].expected as Expected, replay(fixtures[name]));

test("a transfer that is exactly what was asked passes both checks", async () => {
  const r = await guard("ok");
  assert.equal(r.check.verdict, "OK");
  assert.equal(r.match.verdict, "MATCH");
  assert.equal(r.allowed, true);
  assert.deepEqual(r.reasons, []);
});

test("a transfer to the wrong recipient is refused even though check_tx alone says OK", async () => {
  const r = await guard("wrongRecipient");
  assert.equal(r.check.verdict, "OK"); // a valid transfer, so the dry run alone can't tell
  assert.equal(r.match.verdict, "MISMATCH");
  assert.equal(r.allowed, false);
  assert.match(r.reasons.join(" "), /tx_matches says MISMATCH/);
});

test("a transfer that would fail is refused by both checks", async () => {
  const r = await guard("tooLarge");
  assert.equal(r.check.verdict, "BLOCK");
  assert.equal(r.allowed, false);
  assert.equal(r.reasons.length, 2);
});

test("fails closed when Pulse is out of free calls or unreachable", async () => {
  const paywall = (async () => new Response("{}", { status: 402 })) as unknown as typeof fetch;
  const offline = (async () => { throw new Error("getaddrinfo ENOTFOUND"); }) as unknown as typeof fetch;
  for (const f of [paywall, offline]) {
    const r = await checkBeforeSigning(fixtures.ok.tx, fixtures.ok.expected, f);
    assert.equal(r.allowed, false);
    assert.equal(r.reasons.length, 2);
  }
});

test("every template carries an identical copy of the shared guard and wallet", () => {
  const templates = readdirSync(templatesDir, { withFileTypes: true }).filter((d) => d.isDirectory() && d.name !== "shared");
  assert.ok(templates.length >= 1);
  for (const file of ["pulse-guard.ts", "wallet.ts"]) {
    const original = readFileSync(new URL(`shared/${file}`, templatesDir), "utf8");
    for (const t of templates) {
      const copy = new URL(`${t.name}/src/${file}`, templatesDir);
      assert.ok(existsSync(copy), `${t.name}/src/${file} is missing`);
      assert.equal(readFileSync(copy, "utf8"), original, `${t.name}/src/${file} differs from templates/shared/${file}`);
    }
  }
});
