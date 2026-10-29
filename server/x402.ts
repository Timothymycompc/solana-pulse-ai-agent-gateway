// x402 v2 payments: USDC on Solana mainnet, verified and settled by a facilitator that also pays network fees.
import type { RequestHandler } from "express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactSvmScheme } from "@x402/svm/exact/server";
import { createPaymentWrapper } from "@x402/mcp";
import { bazaarResourceServerExtension, declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { z } from "zod";
import { TOOL_PRICES, TOOL_ROUTE_PREFIX, type ToolPrice } from "./pricing";
import { recordPayment } from "./db";
import { TOOLS_BY_NAME } from "./tools";
import { cdpFacilitator } from "./cdp";
import { BONK_MINT, EXAMPLE_RECIPIENT, EXAMPLE_WALLET, USDC_MINT } from "./tools/lib";

export const X402_NETWORK = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
const PAYAI_FACILITATOR_URL = "https://facilitator.payai.network";

// Discovery listing (the x402 Bazaar extension). Facilitators that keep a directory of paid tools, Coinbase's Bazaar
// and PayAI's (which Coinbase AgentKit searches), list a tool after its first payment settled through them, with this name, description,
// tags and input schema. Limits from @x402/extensions: description 500 characters, at most 5 tags of 32 characters.
const SERVICE_NAME = "Solana Pulse";
const DESCRIPTION_LIMIT = 500;

const fitDescription = (text: string) => {
  if (text.length <= DESCRIPTION_LIMIT) return text;
  const cut = text.slice(0, DESCRIPTION_LIMIT);
  return cut.slice(0, cut.lastIndexOf(". ") + 1) || cut;
};

// A fixed, real input for each paid tool's listing, matching the playground's examples where those are fixed.
// The transaction tools' playground examples fetch live data, which listings built at startup can't, so they use an
// unsigned 0.01 SOL transfer recorded from mainnet (tests/fixtures/intent-sol-match.json) and, for
// explain_tx, a confirmed swap by the payout wallet.
const SOL_TRANSFER = "AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAQABA0jAG1BZAFRV2dywxrzs3LT7Wy6rwamoK1c5K6qkDwTmoVgoILMOQ1EYfPamO+NIM+DFNelaCpg5VLgCvW3mbJ8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEEtNEWetTmK6RLkue8tADNy8eH6av+X5ckYlACi5O/AAQICAAEMAgAAAICWmAAAAAAAAA==";
const JUPITER = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";
export const LISTING_EXAMPLES: Record<string, Record<string, unknown>> = {
  balance: { wallet: EXAMPLE_WALLET },
  tokens: { wallet: EXAMPLE_WALLET, how_many: 10 },
  history: { wallet: EXAMPLE_WALLET, how_many: 5 },
  blockhash: {},
  token_account: { wallet: EXAMPLE_WALLET, token: USDC_MINT },
  whats_this: { address: USDC_MINT },
  convert: { token: USDC_MINT, amount: "5", to: "raw" },
  why_failed: { error: `Program ${JUPITER} failed: custom program error: 0x1771`, program: JUPITER },
  check_tx: { tx: SOL_TRANSFER },
  tx_matches: { tx: SOL_TRANSFER, expected: { token: "SOL", amount: "0.01", to: EXAMPLE_RECIPIENT } },
  explain_tx: { tx_id: "3VC82Y2Uq42qczUPPzxuyUqeDPzgqKQf5utk1sKUsjgaTn9JZqDwMxqBb73U1FetJLF8WZqjrRyjsXovESSq3Phv" },
  fee: { tx: SOL_TRANSFER },
  find_token: { name: "BONK" },
  token_safety: { token: BONK_MINT },
  wallet: { wallet: EXAMPLE_WALLET },
  trace: { wallet: EXAMPLE_WALLET, how_many: 10 },
  build_tx: { action: "transfer", from: EXAMPLE_WALLET, to: EXAMPLE_RECIPIENT, token: "SOL", amount: "0.01" },
};

export function discoveryFor(name: string) {
  const tool = TOOLS_BY_NAME.get(name);
  const example = LISTING_EXAMPLES[name];
  if (!tool || !example) throw new Error(`Paid tool ${name} needs a tool definition and a LISTING_EXAMPLES entry`);
  return {
    description: fitDescription(`${tool.useWhen} ${tool.description}`),
    tags: ["solana", "ai-agents", "agent-safety", "mcp", tool.category],
    inputSchema: z.toJSONSchema(z.object(tool.inputs), { io: "input" }) as Record<string, unknown>,
    example,
  };
}

// Coinbase's facilitator first, so payments settle there and tools are listed in Coinbase's Bazaar; PayAI's takes
// over if Coinbase can't be reached when the server starts (the first facilitator that supports Solana is used).
// Without a CDP key, PayAI alone, as before. X402_FACILITATOR_URL forces a single facilitator.
function facilitators() {
  if (process.env.X402_FACILITATOR_URL) return [new HTTPFacilitatorClient({ url: process.env.X402_FACILITATOR_URL })];
  const payai = new HTTPFacilitatorClient({ url: PAYAI_FACILITATOR_URL });
  try {
    const cdp = cdpFacilitator();
    return cdp ? [cdp, payai] : [payai];
  } catch (error) {
    console.error("Coinbase facilitator not configured, using PayAI:", error);
    return [payai];
  }
}

export function createX402(payTo: string) {
  const resourceServer = new x402ResourceServer(facilitators())
    .register(X402_NETWORK, new ExactSvmScheme())
    .registerExtension(bazaarResourceServerExtension);

  // Revenue ledger: every successful settlement, HTTP or MCP. The tool is the last segment of the resource URL,
  // decoded so a percent-encoded request ("token%5Fverdict") is credited to the real tool name.
  resourceServer.onAfterSettle(async ({ paymentPayload, requirements, result }) => {
    if (!result.success || !result.transaction) return;
    const resourceUrl = String(paymentPayload.resource?.url ?? "");
    const segment = resourceUrl.split(/[/?#]/).filter(Boolean).pop() ?? "unknown";
    let tool = segment;
    try { tool = decodeURIComponent(segment); } catch { /* keep the raw segment */ }
    tool = TOOLS_BY_NAME.get(tool)?.name ?? tool;
    await recordPayment({
      txSignature: result.transaction, tool, payer: result.payer ?? null,
      amountBaseUnits: String(result.amount ?? requirements.amount), asset: requirements.asset, network: result.network,
    });
  });

  // Facilitator sync happens once; a failure is retried on the next paid request instead of crashing startup.
  let ready: Promise<void> | null = null;
  const ensureReady = () => {
    ready ??= resourceServer.initialize().catch((error) => { ready = null; throw error; });
    return ready;
  };

  const accepts = new Map<string, ReturnType<typeof resourceServer.buildPaymentRequirements>>();
  const acceptsFor = (price: Exclude<ToolPrice, null>) => {
    if (!accepts.has(price)) {
      const built = ensureReady().then(() => resourceServer.buildPaymentRequirements({ scheme: "exact", network: X402_NETWORK, payTo, price, maxTimeoutSeconds: 60 }));
      built.catch(() => accepts.delete(price));
      accepts.set(price, built);
    }
    return accepts.get(price)!;
  };

  // One Express middleware covering every paid tool route; it buffers the response and only settles on status < 400.
  const routes: Record<string, any> = {};
  for (const [tool, price] of Object.entries(TOOL_PRICES)) {
    if (!price) continue;
    const { description, tags, inputSchema, example } = discoveryFor(tool);
    routes[`POST ${TOOL_ROUTE_PREFIX}${tool}`] = {
      accepts: [{ scheme: "exact", price, network: X402_NETWORK, payTo, maxTimeoutSeconds: 60 }],
      description,
      mimeType: "application/json",
      serviceName: SERVICE_NAME,
      tags,
      extensions: declareDiscoveryExtension({ bodyType: "json", input: example, inputSchema }),
    };
  }
  // Syncs with the facilitator in the background and retries on the next request if that fails.
  const httpMiddleware: RequestHandler = paymentMiddleware(routes, resourceServer);

  // Wrap an MCP tool handler: without _meta["x402/payment"] it returns PaymentRequired; with it, verify, run, settle.
  const wrapMcpTool = async (tool: string, price: Exclude<ToolPrice, null>, handler: (...args: any[]) => any) => {
    const { description, tags, inputSchema, example } = discoveryFor(tool);
    const paid = createPaymentWrapper(resourceServer, {
      accepts: await acceptsFor(price),
      resource: { url: `mcp://tool/${tool}`, description, mimeType: "application/json", serviceName: SERVICE_NAME, tags },
      extensions: declareDiscoveryExtension({ toolName: tool, description, transport: "streamable-http", inputSchema, example }),
    });
    return paid(handler);
  };

  return { httpMiddleware, wrapMcpTool };
}
