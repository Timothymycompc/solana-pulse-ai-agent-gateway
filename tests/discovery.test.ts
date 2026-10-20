// Discovery listings (x402 Bazaar extension) for every paid tool, checked with the extension's own validators,
// so a facilitator's directory accepts them. No network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { bazaarResourceServerExtension, declareDiscoveryExtension, sanitizeTags, validateDiscoveryExtension } from "@x402/extensions/bazaar";
import { discoveryFor } from "../server/x402";
import { TOOL_PRICES, TOOL_ROUTE_PREFIX } from "../server/pricing";
import { TOOLS_BY_NAME } from "../server/tools";

const PAID = Object.entries(TOOL_PRICES).filter(([, price]) => price).map(([name]) => name);

test("every paid tool has a listing within the directory limits", () => {
  assert.ok(PAID.length > 0);
  for (const name of PAID) {
    const { description, tags } = discoveryFor(name);
    assert.ok(description.length > 0 && description.length <= 500, `${name}: description is ${description.length} characters`);
    assert.ok(description.endsWith("."), `${name}: description is cut mid-sentence`);
    assert.deepEqual(sanitizeTags(tags), tags, `${name}: a tag would be dropped`);
  }
});

test("every listing example is a valid input for its tool", () => {
  for (const name of PAID) {
    const parsed = z.object(TOOLS_BY_NAME.get(name)!.inputs).safeParse(discoveryFor(name).example);
    assert.ok(parsed.success, `${name}: ${parsed.error?.message}`);
  }
});

test("HTTP and MCP listings pass the Bazaar schema check", () => {
  for (const name of PAID) {
    const { description, inputSchema, example } = discoveryFor(name);
    // The resource server adds the HTTP method from the request before sending the listing; do the same here.
    const path = `${TOOL_ROUTE_PREFIX}${name}`;
    const request = { method: "POST", routePattern: path, adapter: { getPath: () => path } };
    const http = bazaarResourceServerExtension.enrichDeclaration!(
      declareDiscoveryExtension({ bodyType: "json", input: example, inputSchema }).bazaar, request as any);
    const mcp = declareDiscoveryExtension({ toolName: name, description, transport: "streamable-http", inputSchema, example }).bazaar;
    for (const [kind, listing] of Object.entries({ http, mcp })) {
      const result = validateDiscoveryExtension(listing as any);
      assert.ok(result.valid, `${name} ${kind}: ${JSON.stringify(result.errors)}`);
    }
  }
});

test("the OpenAPI document lists every tool with a payment-prompt summary Pay.sh accepts", async () => {
  const { openApiDocument } = await import("../server/openapi");
  const { TOOLS } = await import("../server/tools");
  const doc: any = openApiDocument("https://example.com");
  assert.equal(Object.keys(doc.paths).length, TOOLS.length);
  for (const tool of TOOLS) {
    const op = doc.paths[`/api/tools/${tool.name}`].post;
    assert.ok(op.summary.length >= 24, `${tool.name}: Pay.sh needs a summary of 24+ characters`);
    assert.ok(op.requestBody.content["application/json"].schema.properties, `${tool.name} documents its inputs`);
  }
});
