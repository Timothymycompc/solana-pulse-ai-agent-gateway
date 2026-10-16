// One version everywhere: what the MCP Registry, the MCP handshake and the package say must match.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { VERSION } from "../server/version";

test("package.json, package-lock.json and server.json carry the same version as the server", () => {
  const read = (f: string) => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url), "utf8"));
  assert.equal(read("package.json").version, VERSION);
  assert.equal(read("package-lock.json").version, VERSION);
  assert.equal(read("server.json").version, VERSION);
});
