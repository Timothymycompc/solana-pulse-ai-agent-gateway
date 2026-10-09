import { createHash } from "crypto";
import { keyFromReq } from "./authKey";
import type { Request, Response, NextFunction } from "express";
import { pool, logCall } from "./db";

export const TRIAL_CALLS_PER_VISITOR = 27;
const hashVisitor = (visitorId: string) => createHash("sha256").update(visitorId).digest("hex");

// Per-IP trial cap: stops clients that drop the visitor cookie from getting a fresh trial on every request.
export const TRIAL_CALLS_PER_IP = Math.max(Number(process.env.TRIAL_CALLS_PER_IP) || 54, TRIAL_CALLS_PER_VISITOR);
function normalizeIp(raw: string): string {
  const ip = (raw || "unknown").replace(/^::ffff:/i, "");
  if (!ip.includes(":")) return ip;
  const [head, tail = ""] = ip.split("::");
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  const full = [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t];
  return full.slice(0, 4).map((x) => x.toLowerCase().replace(/^0+(?=.)/, "")).join(":");
}
const hashIp = (ip: string) => createHash("sha256").update("ip:" + normalizeIp(ip)).digest("hex");

async function reserveTrialCall(visitorId: string, ip: string): Promise<{ remaining: number; ipKey?: string } | null> {
  const visitorHash = hashVisitor(visitorId);
  const ipKey = ip && ip !== "unknown" ? hashIp(ip) : undefined;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const v = await client.query(
      `INSERT INTO anonymous_trial_usage (visitor_hash, calls_used)
       VALUES ($1, 1)
       ON CONFLICT (visitor_hash) DO UPDATE SET
         calls_used = anonymous_trial_usage.calls_used + 1,
         last_call_at = NOW()
       WHERE anonymous_trial_usage.calls_used < $2
       RETURNING calls_used`,
      [visitorHash, TRIAL_CALLS_PER_VISITOR]
    );
    let remaining = v.rowCount ? Math.max(TRIAL_CALLS_PER_VISITOR - Number(v.rows[0].calls_used), 0) : -1;
    if (v.rowCount && ipKey) {
      const i = await client.query(
        `INSERT INTO anonymous_trial_ip_usage (ip_hash, calls_used)
         VALUES ($1, 1)
         ON CONFLICT (ip_hash) DO UPDATE SET
           calls_used = anonymous_trial_ip_usage.calls_used + 1,
           last_call_at = NOW()
         WHERE anonymous_trial_ip_usage.calls_used < $2
         RETURNING calls_used`,
        [ipKey, TRIAL_CALLS_PER_IP]
      );
      remaining = i.rowCount ? Math.min(remaining, Math.max(TRIAL_CALLS_PER_IP - Number(i.rows[0].calls_used), 0)) : -1;
    }
    if (remaining < 0) { await client.query("ROLLBACK"); return null; }
    await client.query("COMMIT");
    return { remaining, ipKey };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function refundTrialCall(visitorId: string, ipKey?: string): Promise<void> {
  try {
    await pool.query(
      `UPDATE anonymous_trial_usage SET calls_used = GREATEST(calls_used - 1, 0) WHERE visitor_hash = $1`,
      [hashVisitor(visitorId)]
    );
    if (ipKey) {
      await pool.query(
        `UPDATE anonymous_trial_ip_usage SET calls_used = GREATEST(calls_used - 1, 0) WHERE ip_hash = $1`,
        [ipKey]
      );
    }
  } catch (error) { console.error("trial refund failed:", error); }
}

export async function getTrialStatus(visitorId: string, ip?: string): Promise<{ used: number; remaining: number }> {
  const v = await pool.query(`SELECT calls_used FROM anonymous_trial_usage WHERE visitor_hash = $1`, [hashVisitor(visitorId)]);
  const used = Number(v.rows[0]?.calls_used || 0);
  let remaining = Math.max(TRIAL_CALLS_PER_VISITOR - used, 0);
  if (ip && ip !== "unknown") {
    const i = await pool.query(`SELECT calls_used FROM anonymous_trial_ip_usage WHERE ip_hash = $1`, [hashIp(ip)]);
    remaining = Math.min(remaining, Math.max(TRIAL_CALLS_PER_IP - Number(i.rows[0]?.calls_used || 0), 0));
  }
  return { used, remaining };
}

export type TrialMeterOutcome =
  | { ok: true; via: "trial"; trialCallsRemaining: number; ipKey?: string }
  | { ok: true; via: "credits"; creditsRemaining: number; wallet: string }
  | { ok: false; status: 402 | 503; error: string; priceLamports: number; trialCallsUsed?: number };

export async function meterTrialOrCredit(o: { apiKey?: string; ip: string; visitorId: string; priceLamports: number }): Promise<TrialMeterOutcome> {
  try {
    const reserved = await reserveTrialCall(o.visitorId, o.ip);
    if (reserved) return { ok: true, via: "trial", trialCallsRemaining: reserved.remaining, ipKey: reserved.ipKey };
  } catch (error) {
    console.error("trial metering error:", error);
    return { ok: false, status: 503, error: "Trial usage temporarily unavailable", priceLamports: o.priceLamports };
  }

  const paid = await meterCall(o);
  if (paid.ok) return { ok: true, via: "credits", creditsRemaining: paid.creditsRemaining, wallet: paid.wallet };
  const failure = paid as Extract<MeterOutcome, { ok: false }>;
  return { ok: false, status: failure.status, error: failure.error, priceLamports: failure.priceLamports, trialCallsUsed: TRIAL_CALLS_PER_VISITOR };
}

export async function refundTrialOrCredit(metering: Extract<TrialMeterOutcome, { ok: true }>, visitorId: string): Promise<void> {
  if (metering.via === "trial") return refundTrialCall(visitorId, metering.ipKey);
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
    const visitorId = (req as any).trialVisitorId as string | undefined;
    if (!visitorId) return res.status(503).json({ error: "Visitor trial could not be initialized. Reload and retry." });
    const meter = await meterTrialOrCredit({ apiKey: keyFromReq(req), ip: req.ip || "unknown", visitorId, priceLamports: price });
    if (!meter.ok) {
      const failure = meter as Exclude<TrialMeterOutcome, { ok: true }>;
      return res.status(failure.status).json({
        error: failure.error,
        priceLamports: failure.priceLamports,
        trialCallsPerVisitor: TRIAL_CALLS_PER_VISITOR,
        trialCallsUsed: failure.trialCallsUsed ?? undefined,
        instructions: failure.status === 402
          ? `Your 27 anonymous trial calls are used. Sign in with a wallet, add credits, and send x-api-key to continue. Top up at ${payTo}.`
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
      if (failed) void refundTrialOrCredit(meter, visitorId);
      void logCall({ wallet: meter.via === "credits" ? meter.wallet : null, endpoint, method: req.method, priceCredits: meter.via === "credits" && !failed ? 1 : 0, via: meter.via, status: res.statusCode });
    });
    return next();
  };
}
