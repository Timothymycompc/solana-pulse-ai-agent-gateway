// discovery.ts: generates /.well-known/mcp.json and /llms.txt from toolRegistry.ts only.
import {
  TOOLS, PRICE_LAMPORTS, PRICE_SOL, RATE_LIMIT, TRUST_STATEMENT,
  FREE_TOOL_NAMES, PAID_TOOL_NAMES, buildDescription, type ToolDef,
} from "./toolRegistry";
import { GUIDES, WORKFLOWS, QUICK_START } from "./toolGuide";

export const SERVER_VERSION = "1.0.0";

const free = (t: ToolDef) => t.priceLamports === 0;
const access = (t: ToolDef) =>
  free(t) ? "FREE, no key needed" : `PAID, 1 credit (${PRICE_SOL} SOL), x-api-key header required`;
const paramLine = (p: ToolDef["params"][number]) =>
  `- ${p.name} (${p.required ? "required" : "optional"}${p.default !== undefined ? `, default ${JSON.stringify(p.default)}` : ""}, ${p.type}): ${p.description}`;
const safety = (t: ToolDef) =>
  [
    t.readOnly ? "read-only" : "writes state",
    t.destructive ? "destructive" : "non-destructive",
    t.idempotent ? "idempotent" : "not idempotent",
    t.broadcasts ? "can broadcast transactions" : "never broadcasts transactions",
  ].join(", ");

export const buildMcpManifest = () => ({
  name: "Solana Pulse AI Agent Gateway",
  version: SERVER_VERSION,
  description:
    "MCP server giving AI agents live Solana data: wallet balances, token authority profiles, transaction decoding, priority-fee estimates and pre-send transaction checks. It never signs or broadcasts transactions.",
  capabilities: {
    tools: {
      description: "Balance, blockhash, token-account and transaction lookups; token authority profiles; ATA derivation; transaction decoding; fee estimates; transaction dry-runs and pre-send checks.",
    },
  },
  instructions:
    "Connect with Streamable HTTP at mcp_http_endpoint or SSE at mcp_sse_endpoint. Free tools need no key. Paid tools need your API key in the x-api-key header. Read /llms.txt for when to use each tool.",
  mcp_http_endpoint: "/mcp",
  mcp_sse_endpoint: "/mcp/sse",
  trust: TRUST_STATEMENT,
  quick_start: QUICK_START,
  workflows: WORKFLOWS,
  rate_limit: RATE_LIMIT,
  pricing: {
    unit: "credit",
    price_per_paid_call_lamports: PRICE_LAMPORTS,
    price_per_paid_call_sol: PRICE_SOL,
    free_tools: FREE_TOOL_NAMES,
    paid_tools: PAID_TOOL_NAMES,
    authentication: "x-api-key header (paid tools only)",
  },
  tools: TOOLS.map((t) => ({
    name: t.name,
    description: buildDescription(t),
    use_when: t.useWhen,
    free: free(t),
    price_lamports: t.priceLamports,
    auth: t.auth,
    annotations: { readOnlyHint: t.readOnly, destructiveHint: t.destructive, idempotentHint: t.idempotent },
    broadcasts_transactions: t.broadcasts,
    parameters: t.params,
    example_request: t.exampleRequest,
    does_not_prove: t.trust,
    guide: GUIDES[t.name],
  })),
});

const toolSection = (t: ToolDef) =>
  [
    `### ${t.name} (${free(t) ? "free" : "paid"})`,
    t.summary,
    `In plain words: ${GUIDES[t.name].plain}`,
    `Use it when: ${t.useWhen}`,
    `Good for: ${t.useCases.join("; ")}`,
    `Do not use it when: ${t.avoidWhen.length ? t.avoidWhen.join("; ") : "none"}`,
    "Inputs:",
    ...t.params.map(paramLine),
    "Input hints:",
    ...Object.entries(GUIDES[t.name].inputHints).map(([k, v]) => `- ${k}: ${v}`),
    `Returns: ${t.returns}`,
    `Response fields: ${t.responseFields.join("; ")}`,
    `Success looks like: ${GUIDES[t.name].success}`,
    `Example request: ${JSON.stringify(t.exampleRequest)}`,
    `Example result (shape only, values are placeholders): ${JSON.stringify(t.exampleResult)}`,
    `Cost and access: ${access(t)}`,
    `Network: ${t.network}`,
    `Safety: ${safety(t)}`,
    `Side effects: ${t.sideEffects}`,
    "Errors and fixes:",
    ...GUIDES[t.name].errors.map((e) => `- When: ${e.when}. You see: ${e.youSee}. Fix: ${e.fix}`),
    `Limits: ${t.limits.join(" ")}`,
    `What the result does not prove: ${t.trust}`,
    `Next step: ${GUIDES[t.name].next}`,
  ].join("\n");

export const buildLlmsTxt = (): string =>
  [
    "# Solana Pulse AI Agent Gateway",
    "",
    "> MCP server giving AI agents live Solana data. Read-only: it never signs or broadcasts transactions.",
    "",
    "## Trust statement",
    TRUST_STATEMENT,
    "",
    "## Which tool to use",
    ...TOOLS.map((t) => `- "${t.useWhen}" -> ${t.name} -> ${free(t) ? "free" : `1 credit (${PRICE_SOL} SOL), needs x-api-key`}`),
    "",
    "## Quick start",
    ...QUICK_START,
    "",
    "## Common workflows",
    ...WORKFLOWS.map((w, i) => `${i + 1}. ${w.goal}: ${w.steps.join(" -> ")}`),
    "",
    "## Pricing and access",
    `- Free tools (${FREE_TOOL_NAMES.length}): ${FREE_TOOL_NAMES.join(", ")}. No key needed.`,
    `- Paid tools (${PAID_TOOL_NAMES.length}): ${PAID_TOOL_NAMES.join(", ")}. Each call costs 1 credit = ${PRICE_SOL} SOL (${PRICE_LAMPORTS} lamports). Send your key in the x-api-key header.`,
    "- Paid tools have no free allowance; they need credits from the first call.",
    "- Tool errors are refunded automatically. A completed result is charged even if it reports a problem (for example verdict UNSAFE).",
    `- Rate limit: ${RATE_LIMIT}.`,
    "",
    "## Authentication and credits",
    "- Sign in with a wallet: GET /api/auth/challenge, sign the returned message, then POST /api/auth/login with wallet, signature (base58) and message",
    "- Send the returned key in the x-api-key header",
    "- Add credits by sending SOL to the address from GET /api/claim/deposit-info",
    "",
    "## Network",
    'Every tool accepts network "mainnet-beta" (default, real funds) or "devnet" (test network). Any other value is rejected.',
    "",
    "## Entry points",
    "- MCP Streamable HTTP endpoint: /mcp",
    "- MCP SSE endpoint: /mcp/sse",
    "- Tool manifest: /.well-known/mcp.json",
    "",
    "## Tool reference",
    "",
    ...TOOLS.map((t) => toolSection(t) + "\n"),
  ].join("\n");
