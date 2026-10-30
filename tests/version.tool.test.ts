// tx_version against real mainnet data: raw bytes of a legacy, a version 0 and a version 1 transaction from one block,
// and a recorded getTransaction for a version 1 signature (see `npm run test:record -- version-v1`).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { z } from "zod";
import { txVersion, versionFromBytes } from "../server/tools/version";
import { currentArgs, TOOLS_BY_NAME } from "../server/tools";
import { FIXTURES, loadFixture, replayContext } from "./helpers/replay";

const bytes = JSON.parse(fs.readFileSync(path.join(FIXTURES, "tx-bytes.json"), "utf8")).by_version as Record<string, string>;
const run = (args: Record<string, unknown>, ctx: any = {}) => txVersion.run(z.object(txVersion.inputs).parse(args), ctx);

test("reads legacy, version 0 and version 1 from real transaction bytes", () => {
  for (const v of ["legacy", "0", "1"]) assert.equal(versionFromBytes(Buffer.from(bytes[v], "base64")), v, v);
});

test("version 1 bytes start with 0x81, before the signatures", () => {
  assert.equal(Buffer.from(bytes["1"], "base64")[0], 0x81);
  assert.ok(Buffer.from(bytes["0"], "base64")[0] < 0x80, "v0 starts with the signature count");
});

test("tx input: a version 1 transaction is not readable with max version 0, and says how to fix it", async () => {
  const r: any = await run({ tx: bytes["1"] });
  assert.equal(r.version, "1");
  assert.equal(r.readable_with_max_version_0, false);
  assert.match(r.fix, /maxSupportedTransactionVersion: 1/);
  assert.match(r.who_can_read_it, /1\.99\.0/);
  const legacy: any = await run({ tx: bytes.legacy });
  assert.equal(legacy.readable_with_max_version_0, true);
  assert.equal(legacy.fix, null);
});

test("garbage bytes give unknown, never a guess", async () => {
  assert.equal(versionFromBytes(new Uint8Array([0x85, 1, 2])), "unknown");
  assert.equal(versionFromBytes(new Uint8Array([5, 1, 2])), "unknown");
  const r: any = await run({ tx: Buffer.from([0x85, 1, 2]).toString("base64") });
  assert.equal(r.readable_with_max_version_0, null);
});

test("tx_id input: recorded mainnet version 1 signature", async () => {
  const fixture = loadFixture("version-v1");
  const r: any = await txVersion.run(z.object(txVersion.inputs).parse(currentArgs(txVersion, fixture.args)), replayContext(fixture));
  assert.equal(r.found, true);
  assert.equal(r.version, "1");
  assert.equal(r.readable_with_max_version_0, false);
  assert.ok(r.slot > 447120004, "after version 1 went live");
});

test("needs tx_id or tx", async () => {
  await assert.rejects(() => run({}), /tx_id .* or tx/);
});

test("is registered and priced like the other transaction reads", () => {
  assert.equal(TOOLS_BY_NAME.get("tx_version"), txVersion);
});
