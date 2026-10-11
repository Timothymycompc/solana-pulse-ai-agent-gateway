// x402 v2 payments: USDC on Solana mainnet, verified and settled by a facilitator that also pays network fees.
import type { RequestHandler } from "express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactSvmScheme } from "@x402/svm/exact/server";
import { createPaymentWrapper } from "@x402/mcp";
import { TOOL_PRICES, TOOL_ROUTE_PREFIX, type ToolPrice } from "./pricing";
import { recordPayment } from "./db";

export const X402_NETWORK = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
const FACILITATOR_URL = process.env.X402_FACILITATOR_URL || "https://facilitator.payai.network";

export function createX402(payTo: string) {
  const resourceServer = new x402ResourceServer(new HTTPFacilitatorClient({ url: FACILITATOR_URL }))
    .register(X402_NETWORK, new ExactSvmScheme());

  // Revenue ledger: every successful settlement, HTTP or MCP. The tool is the last segment of the resource URL.
  resourceServer.onAfterSettle(async ({ paymentPayload, requirements, result }) => {
    if (!result.success || !result.transaction) return;
    const resourceUrl = String(paymentPayload.resource?.url ?? "");
    await recordPayment({
      txSignature: result.transaction, tool: resourceUrl.split(/[/?#]/).filter(Boolean).pop() ?? "unknown", payer: result.payer ?? null,
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
    routes[`POST ${TOOL_ROUTE_PREFIX}${tool}`] = {
      accepts: [{ scheme: "exact", price, network: X402_NETWORK, payTo, maxTimeoutSeconds: 60 }],
      description: `Solana Pulse ${tool}`,
      mimeType: "application/json",
    };
  }
  // Syncs with the facilitator in the background and retries on the next request if that fails.
  const httpMiddleware: RequestHandler = paymentMiddleware(routes, resourceServer);

  // Wrap an MCP tool handler: without _meta["x402/payment"] it returns PaymentRequired; with it, verify, run, settle.
  const wrapMcpTool = async (tool: string, price: Exclude<ToolPrice, null>, handler: (...args: any[]) => any) => {
    const paid = createPaymentWrapper(resourceServer, {
      accepts: await acceptsFor(price),
      resource: { url: `mcp://tool/${tool}`, description: `Solana Pulse ${tool}`, mimeType: "application/json" },
    });
    return paid(handler);
  };

  return { httpMiddleware, wrapMcpTool };
}
