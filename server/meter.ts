import { createHash, createHmac, timingSafeEqual } from "crypto";
import { keyFromReq } from "./auth";
import type { Request, Response, NextFunction, RequestHandler } from "express";
import { pool } from "./db";
import { FREE_CALLS_PER_TOOL, priceOf, toolForRoute } from "./pricing";
import { z } from "zod";
import { TOOLS_BY_NAME } from "./tools";

// Free calls: each paid tool can be called FREE_CALLS_PER_TOOL times per caller IP (IPv6 grouped by /64) per UTC day,
// shared across HTTP and MCP. Keyed by IP rather than a cookie, because most agents and MCP clients do not keep cookies.

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

// True when a row's last call was on an earlier UTC day, so its count starts again from zero.
const NEW_DAY = `(trial_tool_usage.last_call_at AT TIME ZONE 'UTC')::date < (NOW() AT TIME ZONE 'UTC')::date`;

// Telegram users are counted by their Telegram user ID instead of an IP (the bot's calls all come from Telegram's servers).
export const hashTelegramUser = (userId: number | string) => createHmac("sha256", callerHashKey()).update("tg:" + userId).digest("hex");

const reserveFreeCall = (ip: string, tool: string) => reserveFreeCallFor(hashIp(ip), tool);

export async function reserveFreeCallFor(callerHash: string, tool: string): Promise<number | null> {
  const result = await pool.query(
    `INSERT INTO trial_tool_usage (ip_hash, tool, calls_used)
     VALUES ($1, $2, 1)
     ON CONFLICT (ip_hash, tool) DO UPDATE SET
       calls_used = CASE WHEN ${NEW_DAY} THEN 1 ELSE trial_tool_usage.calls_used + 1 END,
       last_call_at = NOW()
     WHERE ${NEW_DAY} OR trial_tool_usage.calls_used < $3
     RETURNING calls_used`,
    [callerHash, tool, FREE_CALLS_PER_TOOL]
  );
  return result.rowCount ? Number(result.rows[0].calls_used) : null;
}

export const refundFreeCall = (ip: string, tool: string) => refundFreeCallFor(hashIp(ip), tool);

export async function refundFreeCallFor(callerHash: string, tool: string): Promise<void> {
  try {
    await pool.query(
      `UPDATE trial_tool_usage SET calls_used = GREATEST(calls_used - 1, 0) WHERE ip_hash = $1 AND tool = $2`,
      [callerHash, tool]
    );
  } catch (error) { console.error("free call refund failed:", error); }
}

// Free calls used today per paid tool for this caller; tools never called are omitted.
export async function getFreeCallStatus(ip: string): Promise<Record<string, number>> {
  const result = await pool.query(`SELECT tool, CASE WHEN ${NEW_DAY} THEN 0 ELSE calls_used END AS calls_used FROM trial_tool_usage WHERE ip_hash = $1`, [hashIp(ip)]);
  return Object.fromEntries(result.rows.map((r: any) => [r.tool, Number(r.calls_used)]));
}

// One-off free passes the owner grants: a caller named here runs every tool free, without using its daily free calls,
// until the time given. After that it's back to the normal 25 a day. Kept in code so every pass is on record.
export const FREE_PASSES: { userAgent: RegExp; until: string; why: string }[] = [
  { userAgent: /^algebra-executor\//i, until: "2026-10-15T03:00:00Z", why: "Granted 2026-10-14 for 24 hours: the most active real caller, while it tests." },
];
export const freePassFor = (userAgent: string | undefined, now = Date.now()) =>
  FREE_PASSES.find((p) => p.userAgent.test(userAgent ?? "") && now < Date.parse(p.until)) ?? null;

// Trial keys for builders who take up the free-trial offer: the key (sent as x-api-key, over HTTP or MCP) runs every
// tool free until the date given. Only the key's SHA-256 is kept, so the code can be public; each trial is on record
// here with who it is for. Make one with `npm run trial-key -- <name>`.
export const TRIAL_KEYS: { name: string; keySha256: string; until: string; why: string }[] = [
  { name: "tensorblock", keySha256: "7e8d1641743ac79e6407b3248a00434dacce83fff99046eb28f9edd4431769e9", until: "2027-01-13T23:59:59Z", why: "Free trial, 12 weeks, granted 2026-10-21." },
  { name: "dexra-oleg", keySha256: "1c9f0d7d7e5ff58c140491af56eb934d4409b86cfca8152e0f30095d37803ada", until: "2026-12-03T23:59:59Z", why: "Free trial, 6 weeks, granted 2026-10-22." },
  { name: "friend-chatgpt-trader", keySha256: "0ba0d02395643574ac434b4d30b1b4a1f7f5ae557458082177b75c099c84f9f7", until: "2027-01-18T23:59:59Z", why: "Free trial, 12 weeks, granted 2026-10-26." },
  { name: "video-demo", keySha256: "16731387080eec5580cc0ac4edd9ea6398f92a23dbf1ceaa8bc0e0cb1fd2cc9c", until: "2026-11-10T23:59:59Z", why: "Shown on screen in the per-app setup videos (public on purpose), 2 weeks, granted 2026-10-27." },
];
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
export const trialKeyFor = (apiKey: string | undefined, now = Date.now(), keys = TRIAL_KEYS) => {
  if (!apiKey) return null;
  const hash = sha256(apiKey);
  return keys.find((k) => k.keySha256 === hash && now < Date.parse(k.until)) ?? null;
};

// The caller's key: the x-api-key or Bearer header, or a trial key in the address (/mcp?key=...) for apps whose
// connector screen has no header field (the ChatGPT app and desktop offer only OAuth or no authentication). Only a
// live trial key counts from the address, never the owner key: addresses land in Cloud Run's request logs. The usage
// log already drops everything after "?".
export function apiKeyOf(req: { headers: Record<string, any>; query?: Record<string, any> }, now = Date.now(), keys = TRIAL_KEYS): string | undefined {
  const header = keyFromReq(req);
  if (header) return header;
  const fromUrl = typeof req.query?.key === "string" ? req.query.key.trim() : "";
  return fromUrl && trialKeyFor(fromUrl, now, keys) ? fromUrl : undefined;
}

// How a call is admitted before any payment is asked for.
export type Admission =
  | { via: "free_tool" }
  | { via: "owner" }
  | { via: "free_pass" }
  | { via: "free_call"; remaining: number }
  | { via: "x402" };

export async function admitCall(o: { tool: string; ip: string; apiKey?: string; hasPayment: boolean; userAgent?: string }): Promise<Admission> {
  if (!priceOf(o.tool)) return { via: "free_tool" };
  if (isOwnerKey(o.apiKey)) return { via: "owner" };
  if (!o.hasPayment && (freePassFor(o.userAgent) || trialKeyFor(o.apiKey))) return { via: "free_pass" };
  // A caller that already attached an x402 payment pays; free calls are not spent on it.
  if (!o.hasPayment && o.ip && o.ip !== "unknown") {
    const used = await reserveFreeCall(o.ip, o.tool);
    if (used !== null) return { via: "free_call", remaining: Math.max(FREE_CALLS_PER_TOOL - used, 0) };
  }
  return { via: "x402" };
}

// Directory checkers must see "402 Payment Required" to list a paid tool, so they get no free calls over HTTP: Coinbase's
// Bazaar validator (Go's default user agent and nothing else) and its indexer (CoinbaseBazaarDiscovery), which calls
// each tool with its listed example after a payment. A Go app that names itself still gets free calls. The Solana
// Foundation's pay tool (pay/cli/<version>, pay/mcp/<version>) too: its registry (Pay.sh) only lists a tool that answers
// 402, its checker calls with the same user agent as its users, and pay pays automatically, so its users pay from the first call.
// Tools that cannot run without inputs; for these an empty body is a discovery probe (paidRouteMiddleware).
// Tools whose inputs are all optional, like fee and blockhash, run on an empty body, so it is a real call.
const needsInput = new Map<string, boolean>();
export function toolNeedsInput(tool: string): boolean {
  const def = TOOLS_BY_NAME.get(tool);
  if (!def) return false;
  if (!needsInput.has(def.name)) needsInput.set(def.name, !z.object(def.inputs).safeParse({}).success);
  return needsInput.get(def.name)!;
}

export const NO_FREE_CALLS_UA = /^Go-http-client\/[\d.]+$|^CoinbaseBazaarDiscovery\/|^pay\/[a-z]+\/\d/;

// HTTP gate for data routes: free tools, the owner key and free calls pass straight through; everything else goes to x402.
export function paidRouteMiddleware(x402Middleware: RequestHandler): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Express decodes the :name param, so "/api/tools/token%5Fsafety" shares token_safety's free calls instead of
    // getting its own allowance (req.path keeps the percent-encoding). Old names count as the tool's current name.
    const name = typeof req.params.name === "string" ? req.params.name : toolForRoute(req.path);
    const tool = TOOLS_BY_NAME.get(name)?.name ?? name;
    const ip = req.ip || "unknown";
    // An empty body to a tool that needs inputs is a discovery probe (Coinbase's Bazaar), not a real call: skip free
    // calls so it answers 402 with the payment terms. fee and blockhash run on an empty body, so those keep free calls.
    const emptyBody = req.method === "POST" && (!req.body || (typeof req.body === "object" && !Array.isArray(req.body) && Object.keys(req.body).length === 0));
    const probe = emptyBody && toolNeedsInput(tool);
    const hasPayment = Boolean(req.headers["payment-signature"] || req.headers["x-payment"]) || NO_FREE_CALLS_UA.test(req.get("user-agent") ?? "") || probe;
    let admission: Admission;
    try {
      admission = await admitCall({ tool, ip, apiKey: apiKeyOf(req), hasPayment, userAgent: req.get("user-agent") });
    } catch (error) {
      console.error("free call metering error:", error);
      return res.status(503).json({ error: "Usage metering is temporarily unavailable. Retry shortly." });
    }

    res.locals.via = admission.via;
    res.setHeader("Access-Control-Expose-Headers", "x-free-calls-remaining, payment-required, payment-response");
    if (admission.via === "free_call") res.setHeader("x-free-calls-remaining", String(admission.remaining));

    res.once("finish", () => {
      if (res.statusCode >= 400 && admission.via === "free_call") void refundFreeCall(ip, tool);
    });

    if (admission.via === "x402") return x402Middleware(req, res, next);
    return next();
  };
}
