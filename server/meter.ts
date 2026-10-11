import { createHmac, timingSafeEqual } from "crypto";
import { keyFromReq } from "./auth";
import type { Request, Response, NextFunction, RequestHandler } from "express";
import { pool } from "./db";
import { FREE_CALLS_PER_TOOL, priceOf, toolForRoute } from "./pricing";

// Free calls: each paid tool can be called a few times per caller IP (IPv6 grouped by /64), shared across HTTP and MCP.
// Keyed by IP rather than a cookie, because most agents and MCP clients do not keep cookies.

function normalizeIp(raw: string): string {
  const ip = (raw || "unknown").replace(/^::ffff:/i, "");
  if (!ip.includes(":")) return ip;
  const [head, tail = ""] = ip.split("::");
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  const full = [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t];
  return full.slice(0, 4).map((x) => x.toLowerCase().replace(/^0+(?=.)/, "")).join(":");
}
// Keyed hash so stored caller IDs cannot be reversed into IP addresses by brute force.
const callerHashKey = () => process.env.CALLER_HASH_SECRET || process.env.DATABASE_URL || "local-development-caller-key";
export const hashIp = (ip: string) => createHmac("sha256", callerHashKey()).update("ip:" + normalizeIp(ip)).digest("hex");

// The owner key (OWNER_API_KEY secret, sent as x-api-key) gets unlimited calls on every tool.
export function isOwnerKey(apiKey?: string): boolean {
  const owner = process.env.OWNER_API_KEY;
  if (!owner || !apiKey) return false;
  const a = Buffer.from(apiKey), b = Buffer.from(owner);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function reserveFreeCall(ip: string, tool: string): Promise<number | null> {
  const result = await pool.query(
    `INSERT INTO trial_tool_usage (ip_hash, tool, calls_used)
     VALUES ($1, $2, 1)
     ON CONFLICT (ip_hash, tool) DO UPDATE SET
       calls_used = trial_tool_usage.calls_used + 1,
       last_call_at = NOW()
     WHERE trial_tool_usage.calls_used < $3
     RETURNING calls_used`,
    [hashIp(ip), tool, FREE_CALLS_PER_TOOL]
  );
  return result.rowCount ? Number(result.rows[0].calls_used) : null;
}

export async function refundFreeCall(ip: string, tool: string): Promise<void> {
  try {
    await pool.query(
      `UPDATE trial_tool_usage SET calls_used = GREATEST(calls_used - 1, 0) WHERE ip_hash = $1 AND tool = $2`,
      [hashIp(ip), tool]
    );
  } catch (error) { console.error("free call refund failed:", error); }
}

// Free calls used per paid tool for this caller; tools never called are omitted.
export async function getFreeCallStatus(ip: string): Promise<Record<string, number>> {
  const result = await pool.query(`SELECT tool, calls_used FROM trial_tool_usage WHERE ip_hash = $1`, [hashIp(ip)]);
  return Object.fromEntries(result.rows.map((r: any) => [r.tool, Number(r.calls_used)]));
}

// How a call is admitted before any payment is asked for.
export type Admission =
  | { via: "free_tool" }
  | { via: "owner" }
  | { via: "free_call"; remaining: number }
  | { via: "x402" };

export async function admitCall(o: { tool: string; ip: string; apiKey?: string; hasPayment: boolean }): Promise<Admission> {
  if (!priceOf(o.tool)) return { via: "free_tool" };
  if (isOwnerKey(o.apiKey)) return { via: "owner" };
  // A caller that already attached an x402 payment pays; free calls are not spent on it.
  if (!o.hasPayment && o.ip && o.ip !== "unknown") {
    const used = await reserveFreeCall(o.ip, o.tool);
    if (used !== null) return { via: "free_call", remaining: Math.max(FREE_CALLS_PER_TOOL - used, 0) };
  }
  return { via: "x402" };
}

// HTTP gate for data routes: free tools, the owner key and free calls pass straight through; everything else goes to x402.
export function paidRouteMiddleware(x402Middleware: RequestHandler): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Express decodes the :name param, so "/api/tools/token%5Fverdict" shares token_verdict's free calls
    // instead of getting its own allowance (req.path keeps the percent-encoding).
    const tool = typeof req.params.name === "string" ? req.params.name : toolForRoute(req.path);
    const ip = req.ip || "unknown";
    const hasPayment = Boolean(req.headers["payment-signature"] || req.headers["x-payment"]);
    let admission: Admission;
    try {
      admission = await admitCall({ tool, ip, apiKey: keyFromReq(req), hasPayment });
    } catch (error) {
      console.error("free call metering error:", error);
      return res.status(503).json({ error: "Usage metering is temporarily unavailable. Retry shortly." });
    }

    res.setHeader("Access-Control-Expose-Headers", "x-free-calls-remaining, payment-required, payment-response");
    if (admission.via === "free_call") res.setHeader("x-free-calls-remaining", String(admission.remaining));

    res.once("finish", () => {
      if (res.statusCode >= 400 && admission.via === "free_call") void refundFreeCall(ip, tool);
    });

    if (admission.via === "x402") return x402Middleware(req, res, next);
    return next();
  };
}
