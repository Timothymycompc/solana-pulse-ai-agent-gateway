import { createHash } from "crypto";
import type { Request, Response, NextFunction } from "express";
import { pool, isPaymentAlreadyUsed, consumePayment } from "./db";

export const FREE_CALLS_PER_YEAR = Number(process.env.FREE_CALLS_PER_YEAR) || 110;

let schemaReady: Promise<void> | null = null;
function ensureFreeTable(): Promise<void> {
  if (!schemaReady) {
    schemaReady = pool
      .query(`CREATE TABLE IF NOT EXISTS free_tier_usage (
        subject TEXT PRIMARY KEY,
        window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        calls INTEGER NOT NULL DEFAULT 0)`)
      .then(() => undefined)
      .catch((e: any) => { schemaReady = null; throw e; });
  }
  return schemaReady;
}

function ipGroup(ip: string): string {
  const a = (ip || "unknown").replace(/^::ffff:/i, "");
  if (!a.includes(":")) return a;
  const [head, tail = ""] = a.split("::");
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  const groups = a.includes("::") ? [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t] : h;
  return groups.slice(0, 4).join(":");
}
const subjectFor = (ip: string) => "ip:" + createHash("sha256").update(ipGroup(ip)).digest("hex").slice(0, 32);

async function takeFree(subject: string): Promise<number | null> {
  await ensureFreeTable();
  const r = await pool.query(
    `INSERT INTO free_tier_usage AS f (subject, window_start, calls)
     VALUES ($1, NOW(), 1)
     ON CONFLICT (subject) DO UPDATE SET
       calls = CASE WHEN f.window_start < NOW() - INTERVAL '365 days' THEN 1 ELSE f.calls + 1 END,
       window_start = CASE WHEN f.window_start < NOW() - INTERVAL '365 days' THEN NOW() ELSE f.window_start END
     WHERE f.window_start < NOW() - INTERVAL '365 days' OR f.calls < $2
     RETURNING calls`,
    [subject, FREE_CALLS_PER_YEAR]
  );
  return r.rowCount ? FREE_CALLS_PER_YEAR - r.rows[0].calls : null;
}

const PRICE_SQL = `floor($1::numeric * (CASE COALESCE(discount_tier, 0) WHEN 1 THEN 0.85 WHEN 2 THEN 0.70 WHEN 3 THEN 0.45 ELSE 1 END))::bigint`;
async function takeCredits(apiKey: string, price: number) {
  const keyHash = createHash("sha256").update(apiKey).digest("hex");
  const r = await pool.query(
    `UPDATE api_keys
     SET credit_balance_lamports = credit_balance_lamports - ${PRICE_SQL}, updated_at = NOW()
     WHERE key_hash = $2 AND is_active = TRUE AND credit_balance_lamports >= ${PRICE_SQL}
     RETURNING wallet_address, credit_balance_lamports`,
    [price, keyHash]
  );
  return r.rowCount ? r.rows[0] : null;
}

export type MeterOutcome =
  | { ok: true; via: "free" | "credits" | "signature"; freeRemaining?: number; balance?: string; wallet?: string }
  | { ok: false; status: 402 | 503; error: string; priceLamports: number };

export async function meterCall(o: { apiKey?: string; txSignature?: string; ip: string; priceLamports: number }): Promise<MeterOutcome> {
  const price = o.priceLamports;
  try {
    const left = await takeFree(subjectFor(o.ip));
    if (left !== null) return { ok: true, via: "free", freeRemaining: left };
  } catch (e) { console.error("free-tier error:", e); }
  try {
    if (o.apiKey && typeof o.apiKey === "string") {
      const row = await takeCredits(o.apiKey, price);
      if (row) return { ok: true, via: "credits", balance: String(row.credit_balance_lamports), wallet: row.wallet_address };
    }
    if (o.txSignature && typeof o.txSignature === "string") {
      if (!(await isPaymentAlreadyUsed(o.txSignature)) && (await consumePayment(o.txSignature, price))) return { ok: true, via: "signature" };
    }
  } catch (e) {
    console.error("billing error:", e);
    return { ok: false, status: 503, error: "Billing temporarily unavailable", priceLamports: price };
  }
  return { ok: false, status: 402, error: "Payment required", priceLamports: price };
}

export function meterMiddleware(price: number, payTo: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const apiKey = (req.headers["x-api-key"] || req.headers["authorization"]?.toString().replace("Bearer ", "")) as string | undefined;
    const m = await meterCall({ apiKey, txSignature: req.headers["x-payment-signature"] as string | undefined, ip: req.ip || "unknown", priceLamports: price });
    if (m.ok) {
      res.setHeader("Access-Control-Expose-Headers", "x-free-calls-remaining, x-credits-remaining");
      if (m.freeRemaining !== undefined) res.setHeader("x-free-calls-remaining", String(m.freeRemaining));
      if (m.balance) res.setHeader("x-credits-remaining", m.balance);
      (req as any).user = { wallet: m.wallet, remainingBalance: m.balance };
      return next();
    }
    const f = m as any;
    return res.status(f.status).json({
      error: f.error,
      priceLamports: f.priceLamports,
      freeCallsPerYear: FREE_CALLS_PER_YEAR,
      instructions: `Free tier used up. Pass header 'x-api-key: <key>' with sufficient balance. To top up, send SOL to ${payTo} and claim your key.`,
      payTo,
    });
  };
}
