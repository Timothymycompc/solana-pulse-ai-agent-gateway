// The MCP library answers 406 to a POST whose Accept header doesn't list both application/json and
// text/event-stream. Pulse always answers /mcp in plain JSON (enableJsonResponse), so a client that sends no Accept
// header, or only one of the two, can read the answer anyway: it is served instead of refused. An uptime checker
// with a bare Accept header got 406 on every check from 2026-10-05 to 2026-10-14, which directories count as down.
// The library reads rawHeaders (through @hono/node-server), so those are what is rewritten.
import type { IncomingMessage } from "node:http";

export const MCP_ACCEPT = "application/json, text/event-stream";

export function acceptMcpResponses(req: IncomingMessage) {
  const accept = req.headers.accept ?? "";
  if (accept.includes("application/json") && accept.includes("text/event-stream")) return;
  const raw: string[] = [];
  for (let i = 0; i < req.rawHeaders.length; i += 2) {
    if (req.rawHeaders[i].toLowerCase() !== "accept") raw.push(req.rawHeaders[i], req.rawHeaders[i + 1]);
  }
  raw.push("Accept", MCP_ACCEPT);
  req.rawHeaders.splice(0, req.rawHeaders.length, ...raw);
  req.headers.accept = MCP_ACCEPT;
}
