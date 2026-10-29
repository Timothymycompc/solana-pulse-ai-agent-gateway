// An OpenAPI 3.1 description of the HTTP tools, built from the same registry as MCP and the docs, so it can't drift
// from what runs. Served at GET /openapi.json; the Solana Foundation's pay-skills registry (Pay.sh) lists a service
// from its OpenAPI document (npm run openapi writes a copy to commit there).
import { z } from "zod";
import { TOOLS } from "./tools";
import { FREE_CALLS_PER_TOOL, priceOf } from "./pricing";
import { VERSION } from "./version";

// One verb-first line per tool. Pay.sh shows it as the reason on a person's payment approval prompt, and its registry
// requires at least 24 characters.
const SUMMARIES: Record<string, string> = {
  check_tx: "Check a Solana transaction before signing it",
  build_tx: "Build a Solana transfer or swap, checked and ready to sign",
  tx_matches: "Check a transaction matches the requested transfer or swap",
  explain_tx: "Fetch what a confirmed Solana transaction did and why",
  fee: "Get priority fee prices for a Solana transaction",
  find_token: "Find the real token address for a ticker",
  token_safety: "Check whether a Solana token is safe to buy",
  wallet: "Summarize a wallet's holdings and recent activity",
  balance: "Read a wallet's SOL balance from the chain",
  tokens: "List the tokens a wallet holds, with USD values",
  history: "List a wallet's recent transactions",
  blockhash: "Get a fresh blockhash and how long it lasts",
  token_account: "Find the token account a transfer must go to",
  whats_this: "Check what kind of Solana address this is",
  convert: "Convert a token amount to or from raw units",
  why_failed: "Get the cause and fix for a Solana error",
  trace: "Follow a wallet's money and flag drain patterns",
};

// The JSON schema of a tool's inputs, with each input's plain-words description, as the MCP tool list has it.
const inputSchema = (inputs: z.ZodRawShape) => {
  const { $schema, ...schema } = z.toJSONSchema(z.object(inputs), { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
  return schema;
};
// Outputs are documented as dotted paths ("checks[].name"); the top-level field is the part before "." or "[".
const topField = (field: string) => field.split(/[.[ /]/)[0];

export function openApiDocument(serverUrl: string) {
  const paths: Record<string, unknown> = {};
  for (const tool of TOOLS) {
    const price = priceOf(tool.name);
    const properties: Record<string, { description: string }> = {};
    for (const out of tool.outputs) {
      const key = topField(out.field);
      const line = `${out.field} (${out.type}): ${out.is} ${out.howWorkedOut}`;
      properties[key] = { description: properties[key] ? `${properties[key].description}\n${line}` : line };
    }
    paths[`/api/tools/${tool.name}`] = {
      post: {
        operationId: tool.name,
        summary: SUMMARIES[tool.name] ?? tool.title,
        description: `${tool.useWhen} ${tool.description}${price ? ` Price: ${price} USDC per call on Solana (x402), after ${FREE_CALLS_PER_TOOL} free calls a day (from the first call through the pay tool).` : " Free."}`,
        requestBody: { required: true, content: { "application/json": { schema: inputSchema(tool.inputs) } } },
        responses: {
          "200": { description: "The answer, every field explained.", content: { "application/json": { schema: { type: "object", properties } } } },
          ...(price ? { "402": { description: `Payment required: ${price} USDC on Solana via x402. The challenge is in the PAYMENT-REQUIRED header and the body.` } } : {}),
          "400": { description: "An input is missing or invalid; the body says which and how to fix it." },
        },
      },
    };
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "Solana Pulse",
      version: VERSION,
      description: "Safety checks and answers for AI agents on Solana: check a transaction before signing (drainers, failures, exact balance changes), confirm it matches the request, token safety verdicts, fees, amounts and plain-words explanations. Every fact comes from live mainnet data with its source.",
      contact: { name: "Solana Pulse", url: "https://github.com/Timothymycompc/solana-pulse-ai-agent-gateway" },
      license: { name: "MIT" },
    },
    servers: [{ url: serverUrl }],
    paths,
  };
}
