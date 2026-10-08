import { keyFromReq } from "./authKey";
import { createHash } from "crypto";
import type { Request, Response, NextFunction } from "express";
import { pool, logCall } from "./db";

// Free tier removed. Kept as stubs so existing imports still compile.
export const FREE_CALLS_PER_YEAR = 0;
export async function peekFree(_ip: string): Promise<number> { return 0; }

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

export function meterMiddleware(price: number, payTo: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const apiKey = keyFromReq(req);
    const endpoint = req.path;
    const m = await meterCall({ apiKey, ip: req.ip || "unknown", priceLamports: price });
    if (m.ok) {
      res.setHeader("Access-Control-Expose-Headers", "x-credits-remaining");
      res.setHeader("x-credits-remaining", String(m.creditsRemaining));
      (req as any).user = { wallet: m.wallet };
      res.once("finish", () => {
        const failed = res.statusCode >= 400;
        if (failed) refundCredit(m.wallet);
        logCall({ wallet: m.wallet, endpoint, method: req.method, priceCredits: failed ? 0 : 1, via: "credits", status: res.statusCode });
      });
      return next();
    }
    const f = m as any;
    return res.status(f.status).json({
      error: f.error,
      priceLamports: f.priceLamports,
      freeCallsPerYear: 0,
      instructions: `Credits required. Pass header x-api-key with a key that has credits. Log in with your wallet at /api/auth/login to get a key, then top up by sending SOL to ${payTo}.`,
      payTo,
    });
  };
}
