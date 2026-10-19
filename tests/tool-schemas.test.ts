// Every tool input carries a description in the JSON schema agents read (MCP tools/list and /api/tools).
import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { mcpDescription, TOOLS } from "../server/tools";

test("every input of every tool is described in its JSON schema", () => {
  const missing: string[] = [];
  for (const tool of TOOLS) {
    const schema: any = z.toJSONSchema(z.object(tool.inputs), { io: "input" });
    for (const [name, prop] of Object.entries<any>(schema.properties ?? {})) {
      if (!(prop.description ?? "").trim()) missing.push(`${tool.name}.${name}`);
    }
  }
  assert.deepEqual(missing, []);
});

test("describing inputs keeps what counts as valid", () => {
  const fee = TOOLS.find((t) => t.name === "fee")!;
  assert.equal(z.object(fee.inputs).safeParse({}).success, true);
  const find = TOOLS.find((t) => t.name === "find_token")!;
  assert.equal(z.object(find.inputs).safeParse({}).success, false);
});

// Directories that score MCP servers (VerifyMCP, October 2026) look for an example call in each tool and count how
// much of an agent's context the tool list takes, so each tool shows one example and describes its inputs only once.
test("every tool shows an example call, and its MCP description doesn't repeat the inputs", () => {
  for (const tool of TOOLS) {
    assert.ok(tool.usage.trim(), `${tool.name} has an example`);
    const text = mcpDescription(tool);
    assert.match(text, /Example: /, tool.name);
    assert.doesNotMatch(text, /Inputs: /, tool.name);
  }
});
