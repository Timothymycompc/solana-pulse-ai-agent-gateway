// /mcp serves clients whose Accept header lacks application/json or text/event-stream, through the real MCP library.
import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { acceptMcpResponses } from "../server/mcp-accept";

const INIT = { jsonrpc: "2.0", id: 1, method: "initialize",
  params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "checker", version: "1" } } };

async function post(fix: boolean, accept?: string) {
  const app = express();
  app.use(express.json());
  app.post("/mcp", async (req, res) => {
    const server = new McpServer({ name: "t", version: "1" });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => { transport.close(); server.close(); });
    if (fix) acceptMcpResponses(req);
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });
  const http = app.listen(0);
  try {
    const res = await fetch(`http://127.0.0.1:${(http.address() as any).port}/mcp`, { method: "POST",
      headers: { "content-type": "application/json", ...(accept === undefined ? {} : { accept }) }, body: JSON.stringify(INIT) });
    return { status: res.status, body: await res.json() as any };
  } finally {
    http.close();
  }
}

test("without the fix the MCP library refuses a bare Accept header (the 406 checkers got)", async () => {
  assert.equal((await post(false, "application/json")).status, 406);
});

test("with it, no Accept header, JSON only, */* and the full header all initialize", async () => {
  for (const accept of [undefined, "application/json", "*/*", "text/event-stream", "application/json, text/event-stream"]) {
    const r = await post(true, accept);
    assert.equal(r.status, 200, `Accept: ${accept}`);
    assert.equal(r.body.result.serverInfo.name, "t");
  }
});
