import { createHash, createHmac } from "crypto";
import { keyFromReq } from "./authKey";
import type { Request, Response, NextFunction } from "express";
import { pool, logCall } from "./db";

// Trial: each tool can be tried a few times per caller IP (IPv6 grouped by /64), shared across HTTP and MCP.
// Keyed by IP rather than a cookie, because most agents and MCP clients do not keep cookies.
export const TRIAL_CALLS_PER_TOOL = 3;

// HTTP routes share a trial allowance with the MCP tool that does the same job.
const HTTP_ROUTE_TOOLS: Record<string, string> = {
  "/api/solana/balance": "get_solana_balance",
  "/api/solana/blockhash": "get_solana_blockhash",
  "/api/solana/token-accounts": "get_token_accounts",
  "/api/solana/transactions": "get_recent_transactions",
  "/api/solana/simulate": "simulate_solana_transaction",
  "/api/solana/validate-and-simulate": "validate_transaction",
  "/api/solana/find-ata": "find_ata",
  "/api/solana/token-profile": "token_profile",
  "/api/solana/optimal-fee": "optimal_fee",
  "/api/solana/decode-tx": "decode_tx",
};
export const toolForRoute = (path: string) => HTTP_ROUTE_TOOLS[path] || path;

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
const callerHashKey = () => process.env.CALLER_HASH_SECRET || process.env.HELIUS_WEBHOOK_SECRET || process.env.DATABASE_URL || "local-development-caller-key";
export const hashIp = (ip: string) => createHmac("sha256", callerHashKey()).update("ip:" + normalizeIp(ip)).digest("hex");

async function reserveTrialCall(ip: string, tool: string): Promise<number | null> {
  const result = await pool.query(
    `INSERT INTO trial_tool_usage (ip_hash, tool, calls_used)
     VALUES ($1, $2, 1)
     ON CONFLICT (ip_hash, tool) DO UPDATE SET
       calls_used = trial_tool_usage.calls_used + 1,
       last_call_at = NOW()
     WHERE trial_tool_usage.calls_used < $3
     RETURNING calls_used`,
    [hashIp(ip), tool, TRIAL_CALLS_PER_TOOL]
  );
  return result.rowCount ? Number(result.rows[0].calls_used) : null;
}

async function refundTrialCall(ip: string, tool: string): Promise<void> {
  try {
    await pool.query(
      `UPDATE trial_tool_usage SET calls_used = GREATEST(calls_used - 1, 0) WHERE ip_hash = $1 AND tool = $2`,
      [hashIp(ip), tool]
    );
  } catch (error) { console.error("trial refund failed:", error); }
}

// Trial calls used per tool for this caller; tools never called are omitted.
export async function getTrialStatus(ip: string): Promise<Record<string, number>> {
  const result = await pool.query(`SELECT tool, calls_used FROM trial_tool_usage WHERE ip_hash = $1`, [hashIp(ip)]);
  return Object.fromEntries(result.rows.map((r: any) => [r.tool, Number(r.calls_used)]));
}

export type TrialMeterOutcome =
  | { ok: true; via: "trial"; trialCallsRemaining: number; ip: string; tool: string }
  | { ok: true; via: "credits"; creditsRemaining: number; wallet: string }
  | { ok: false; status: 402 | 503; error: string; priceLamports: number };

export async function meterTrialOrCredit(o: { apiKey?: string; ip: string; tool: string; priceLamports: number }): Promise<TrialMeterOutcome> {
  if (o.ip && o.ip !== "unknown") {
    try {
      const used = await reserveTrialCall(o.ip, o.tool);
      if (used !== null) return { ok: true, via: "trial", trialCallsRemaining: Math.max(TRIAL_CALLS_PER_TOOL - used, 0), ip: o.ip, tool: o.tool };
    } catch (error) {
      console.error("trial metering error:", error);
      return { ok: false, status: 503, error: "Trial usage temporarily unavailable", priceLamports: o.priceLamports };
    }
  }

  const paid = await meterCall(o);
  if (paid.ok) return { ok: true, via: "credits", creditsRemaining: paid.creditsRemaining, wallet: paid.wallet };
  const failure = paid as Extract<MeterOutcome, { ok: false }>;
  return { ok: false, status: failure.status, error: failure.error, priceLamports: failure.priceLamports };
}

export async function refundTrialOrCredit(metering: Extract<TrialMeterOutcome, { ok: true }>): Promise<void> {
  if (metering.via === "trial") return refundTrialCall(metering.ip, metering.tool);
  return refundCredit(metering.wallet);
}

async function takeCredit(apiKey: string): Promise<{ address: string; paid_credits: number } | null> {
  const keyHash = createHash("sha256").update(apiKey).digest("hex");
  const r = await pool.query(
    `UPDATE wallets
     SET paid_credits = paid_credits - 1, total_calls_made = total_calls_made + 1, last_active_at = NOW()
     WHERE key_hash = $1 AND is_active = TRUE AND paid_credits > 0
     RETURNING address, paid_credits`,
    [keyHash]
  );
  return r.rowCount ? r.rows[0] : null;
}

export async function refundCredit(wallet?: string): Promise<void> {
  if (!wallet) return;
  try {
    await pool.query(
      `UPDATE wallets SET paid_credits = paid_credits + 1, total_calls_made = GREATEST(total_calls_made - 1, 0) WHERE address = $1`,
      [wallet]
    );
  } catch (e) { console.error("refund failed:", e); }
}

export type MeterOutcome =
  | { ok: true; via: "credits"; creditsRemaining: number; wallet: string }
  | { ok: false; status: 402 | 503; error: string; priceLamports: number };

export async function meterCall(o: { apiKey?: string; ip: string; priceLamports: number }): Promise<MeterOutcome> {
  try {
    if (o.apiKey && typeof o.apiKey === "string") {
      const row = await takeCredit(o.apiKey);
      if (row) return { ok: true, via: "credits", creditsRemaining: row.paid_credits, wallet: row.address };
    }
  } catch (e) {
    console.error("billing error:", e);
    return { ok: false, status: 503, error: "Billing temporarily unavailable", priceLamports: o.priceLamports };
  }
  return { ok: false, status: 402, error: "Payment required", priceLamports: o.priceLamports };
}

export function trialMeterMiddleware(price: number, payTo: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const tool = toolForRoute(req.path);
    const meter = await meterTrialOrCredit({ apiKey: keyFromReq(req), ip: req.ip || "unknown", tool, priceLamports: price });
    if (!meter.ok) {
      const failure = meter as Exclude<TrialMeterOutcome, { ok: true }>;
      return res.status(failure.status).json({
        error: failure.error,
        priceLamports: failure.priceLamports,
        trialCallsPerTool: TRIAL_CALLS_PER_TOOL,
        instructions: failure.status === 402
          ? `Your ${TRIAL_CALLS_PER_TOOL} trial calls for this tool are used. Sign in with a wallet, add credits, and send x-api-key to continue. Top up at ${payTo}.`
          : "Retry shortly.",
        payTo: failure.status === 402 ? payTo : undefined,
      });
    }

    if (meter.via === "trial") {
      res.setHeader("Access-Control-Expose-Headers", "x-trial-calls-remaining");
      res.setHeader("x-trial-calls-remaining", String(meter.trialCallsRemaining));
    } else {
      res.setHeader("Access-Control-Expose-Headers", "x-credits-remaining, x-trial-calls-remaining");
      res.setHeader("x-credits-remaining", String(meter.creditsRemaining));
      res.setHeader("x-trial-calls-remaining", "0");
      (req as any).user = { wallet: meter.wallet };
    }

    const endpoint = req.path;
    res.once("finish", () => {
      const failed = res.statusCode >= 400;
      if (failed) void refundTrialOrCredit(meter);
      void logCall({ wallet: meter.via === "credits" ? meter.wallet : null, endpoint, method: req.method, priceCredits: meter.via === "credits" && !failed ? 1 : 0, via: meter.via, status: res.statusCode });
    });
    return next();
  };
}
