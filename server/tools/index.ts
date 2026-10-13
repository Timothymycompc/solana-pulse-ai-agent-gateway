// The tool registry: one definition per tool drives MCP, HTTP, docs, llms.txt, mcp.json and the playground.
import { z } from "zod";
import { BASIC_TOOLS } from "./basic";
import { TOKEN_TOOLS } from "./tokens";
import { TRANSACTION_TOOLS } from "./transactions";
import { WALLET_TOOLS } from "./wallet";
import type { ToolDef } from "./types";
import { FREE_CALLS_TEXT, priceOf } from "../pricing";

export const TOOLS: ToolDef[] = [...TRANSACTION_TOOLS, ...TOKEN_TOOLS, ...WALLET_TOOLS, ...BASIC_TOOLS];
// Looks a tool up by its current name or the name it had before the October 2026 rename.
export const TOOLS_BY_NAME = new Map(TOOLS.flatMap((t) => [[t.name, t], [t.oldName, t]] as [string, ToolDef][]));

// Arguments written with a tool's old input names, moved to the current ones ("transaction" -> "tx",
// "intent.recipient" -> "expected.to"). Current names win when a caller sends both.
export function currentArgs(tool: ToolDef, args: unknown): unknown {
  if (!tool.oldInputs || !args || typeof args !== "object" || Array.isArray(args)) return args;
  const out: Record<string, any> = { ...(args as Record<string, unknown>) };
  const move = (obj: Record<string, any>, from: string, to: string) => {
    if (!(from in obj)) return;
    if (!(to in obj)) obj[to] = obj[from];
    delete obj[from];
  };
  for (const [from, to] of Object.entries(tool.oldInputs)) if (!from.includes(".")) move(out, from, to);
  for (const [from, to] of Object.entries(tool.oldInputs)) {
    if (!from.includes(".")) continue;
    const [parent, key] = from.split(".");
    if (out[parent] && typeof out[parent] === "object" && !Array.isArray(out[parent])) move(out[parent] = { ...out[parent] }, key, to);
  }
  return out;
}

export const priceText = (name: string) => {
  const price = priceOf(name);
  return price ? `${FREE_CALLS_TEXT}, then ${price} USDC per call (x402)` : "Free (rate-limited)";
};

// What an MCP client sees: use-when line first, then what it does, inputs, and cost.
export function mcpDescription(tool: ToolDef): string {
  const inputs = tool.inputDocs.map((i) => `${i.name}${i.required ? "" : " (optional)"}: ${i.lookingFor}`).join(" ");
  return `${tool.useWhen} ${tool.description} Inputs: ${inputs} Cost: ${priceText(tool.name)}. Full field-by-field docs: GET /api/tools/${tool.name}.`;
}

// Public documentation for one tool (everything except the code).
export function toolDoc(tool: ToolDef) {
  return {
    name: tool.name, oldName: tool.oldName, title: tool.title, category: tool.category, useWhen: tool.useWhen, benefit: tool.benefit, description: tool.description,
    price: priceOf(tool.name), priceText: priceText(tool.name),
    http: { method: "POST", path: `/api/tools/${tool.name}`, body: "JSON object with the inputs below" },
    mcp: { method: "tools/call", name: tool.name },
    inputs: tool.inputDocs, outputs: tool.outputs, notes: tool.notes ?? [],
    inputSchema: z.toJSONSchema(z.object(tool.inputs), { io: "input" }),
  };
}

export { ToolError } from "./types";
export type { ToolContext, ToolDef } from "./types";
