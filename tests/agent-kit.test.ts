import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import { agentKitSource, zodSource } from "../scripts/agent-kit";

test("the Agent Kit plugin's tool list is current with the registry (run npm run agent-kit if not)", () => {
  assert.equal(fs.readFileSync("agent-kit/src/tools.generated.ts", "utf8"), agentKitSource());
});

test("input schemas turn into zod 3 source with limits, defaults, optional fields and choices", () => {
  assert.equal(zodSource({ type: "integer", minimum: 1, maximum: 50, default: 10, description: "How many." }), 'z.number().int().min(1).max(50).describe("How many.").default(10)');
  assert.equal(zodSource({ type: "string", minLength: 64 }, false), "z.string().min(64).optional()");
  assert.equal(zodSource({ anyOf: [{ type: "string" }, { type: "object", additionalProperties: {} }] }), "z.union([z.string(), z.record(z.any())])");
  assert.equal(zodSource({ type: "object", properties: { action: { type: "string", const: "swap" }, from: { type: "string" } }, required: ["action"] }), 'z.object({ action: z.literal("swap"), from: z.string().optional() })');
});
