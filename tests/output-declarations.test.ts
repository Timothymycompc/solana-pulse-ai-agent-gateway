// Each paid tool declares in its 402 what a paid answer always contains (server/output-declarations.generated.ts).
// A declared key that is missing from an answer counts against the tool (vet402 "L2 mismatch" = BLOCK), so the
// declaration must stay true: only keys every recorded answer had, and every one of them documented as an output.
import { test } from "node:test";
import assert from "node:assert/strict";
import { OUTPUT_DECLARATIONS } from "../server/output-declarations.generated";
import { TOOL_PRICES } from "../server/pricing";
import { TOOLS_BY_NAME } from "../server/tools";

const PAID = Object.entries(TOOL_PRICES).filter(([, price]) => price).map(([name]) => name);

test("every paid tool declares its output, measured on hundreds of real answers", () => {
  assert.deepEqual(Object.keys(OUTPUT_DECLARATIONS).sort(), [...PAID].sort());
  for (const name of PAID) {
    const d = OUTPUT_DECLARATIONS[name];
    assert.ok(d.answers >= 100, `${name}: measured on only ${d.answers} answers`);
    assert.ok(d.required.length > 0, `${name}: declares no keys`);
    assert.deepEqual(Object.keys(d.example).sort(), [...d.required].sort(), `${name}: example shows exactly the required keys`);
    assert.ok(JSON.stringify(d.example).length <= 1500, `${name}: example too big for a 402`);
  }
});

test("every declared key is a documented output or a repeated input of the tool", () => {
  const undocumented: string[] = [];
  for (const name of PAID) {
    const tool = TOOLS_BY_NAME.get(name)!;
    // Output docs name fields like "found / slot / time" or "prices.cheap"; any of those names counts.
    const documented = new Set(tool.outputs.flatMap((o) => o.field.split(/\s*[\/,]\s*/).map((f) => f.trim().split(/[.\[ ]/)[0])));
    for (const input of Object.keys(tool.inputs)) documented.add(input);  // answers repeat inputs like network and wallet
    for (const key of OUTPUT_DECLARATIONS[name].required) if (!documented.has(key)) undocumented.push(`${name}.${key}`);
  }
  assert.deepEqual(undocumented, []);
});
