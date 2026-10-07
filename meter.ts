import { keyFromReq } from "./authKey";
import { createHash } from "crypto";
import type { Request, Response, NextFunction } from "express";
import { pool, logCall } from "./db";

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

export type MeterOutcome =
  | { ok: true; via: "free" | "credits"; freeRemaining?: number; creditsRemaining?: number; wallet?: string }
  | { ok: false; status: 402 | 503; error: string; priceLamports: number };

export async function meterCall(o: { apiKey?: string; ip: string; priceLamports: number }): Promise<MeterOutcome> {
  try {
    const left = await takeFree(subjectFor(o.ip));
    if (left !== null) return { ok: true, via: "free", freeRemaining: left };
  } catch (e) { console.error("free-tier error:", e); }

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
    const m = await meterCall({ apiKey, ip: req.ip || "unknown", priceLamports: price });
    if (m.ok) {
      res.setHeader("Access-Control-Expose-Headers", "x-free-calls-remaining, x-credits-remaining");
      if (m.freeRemaining !== undefined) res.setHeader("x-free-calls-remaining", String(m.freeRemaining));
      if (m.creditsRemaining !== undefined) res.setHeader("x-credits-remaining", String(m.creditsRemaining));
      (req as any).user = { wallet: m.wallet };
      logCall({ wallet: m.wallet || null, endpoint: req.path, method: req.method, priceCredits: m.via === "credits" ? 1 : 0, via: m.via });
      return next();
    }
    const f = m as any;
    return res.status(f.status).json({
      error: f.error,
      priceLamports: f.priceLamports,
      freeCallsPerYear: FREE_CALLS_PER_YEAR,
      instructions: `Free tier used up. Pass header 'x-api-key: <key>' with credits remaining. Log in with your wallet at /api/auth/login to get a key and top up by sending SOL to ${payTo}.`,
      payTo,
    });
  };
}


export async function peekFree(ip: string): Promise<number> {
  await ensureFreeTable();
  const r = await pool.query("SELECT calls, window_start FROM free_tier_usage WHERE subject = $1", [subjectFor(ip)]);
  if (!r.rowCount) return FREE_CALLS_PER_YEAR;
  const expired = Date.now() - new Date(r.rows[0].window_start).getTime() > 365 * 86400000;
  return expired ? FREE_CALLS_PER_YEAR : Math.max(0, FREE_CALLS_PER_YEAR - Number(r.rows[0].calls));
}
