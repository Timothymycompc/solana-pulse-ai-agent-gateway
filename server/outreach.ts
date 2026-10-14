// Personal notes from the developer to callers who look like a real developer or AI app using the tools, not the
// directory bots that sweep every tool once. Once a caller qualifies, every /api and /mcp answer it gets for 14 days
// carries a short, personal note (a note_from_the_developer field on JSON answers and an x-note-from-the-developer
// header), and the owner is told by email through a Cloud Monitoring alert on the OUTREACH_NEW log line.
import type { NextFunction, Request, Response } from "express";
import { pool, TOOL_RUN_SQL } from "./db";
import { classifyClient } from "./callers";
import { hashIp } from "./meter";
import { CALLER_NOTES } from "./notes";
import { ownerWallets } from "./owner";

export const CONTACT = "timothymycompc@gmail.com or https://github.com/Timothymycompc/solana-pulse-ai-agent-gateway/issues";
const NOTE_DAYS = 14;

// What one caller did over the last week, as the usage log saw it.
export type CallerActivity = {
  client: string; callerHash: string | null; mcpClient: string | null;
  runs: number; hours: number; tools: Record<string, number>; owner: boolean;
};
export type Candidate = { key: string; matchUa: string; matchHash: string | null; name: string; tools: [string, number][]; runs: number };

// The rules, kept in one place so they can be tested on their own:
// - never the owner, and never anything that identifies itself as a bot, probe, indexer or monitor
// - an AI app (Claude, ChatGPT, Cursor, AgentKit…) qualifies after 3 tool runs
// - anything else needs 10+ runs spread over at least 2 different hours, so one test burst doesn't count
// - a directory sweep (8+ different tools, about one or two calls each) is skipped: real use leans on a few tools
export function pickCandidates(rows: CallerActivity[]): Candidate[] {
  const merged = new Map<string, Candidate & { hours: number; kind: string }>();
  for (const r of rows) {
    if (r.owner) continue;
    const info = classifyClient(r.client, r.mcpClient);
    if (info.kind === "bot" || info.kind === "unknown") continue;
    // A distinctive user agent ("algebra-executor/1") is one program wherever it runs, so it's matched by name alone.
    // A generic one ("node", "python-requests", a browser) is shared by many people, so it's matched by network too.
    // The user agent alone decides that: an AI app connecting through plain "node" is still matched by network.
    const uaKind = classifyClient(r.client).kind;
    const distinctive = uaKind === "other" || uaKind === "ai_app";
    const key = distinctive ? `ua:${r.client}` : `net:${r.callerHash}|${r.client}`;
    const m = merged.get(key) ?? { key, matchUa: r.client, matchHash: distinctive ? null : r.callerHash, name: info.name, tools: [], runs: 0, hours: 0, kind: info.kind };
    m.runs += r.runs;
    m.hours = Math.max(m.hours, r.hours);
    const counts = new Map(m.tools);
    for (const [t, n] of Object.entries(r.tools)) counts.set(t, (counts.get(t) ?? 0) + n);
    m.tools = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    merged.set(key, m);
  }
  return [...merged.values()].filter((m) => {
    const distinctTools = m.tools.length;
    const sweep = distinctTools >= 8 && m.runs / distinctTools <= 2.5;
    if (sweep) return false;
    if (m.kind === "ai_app") return m.runs >= 3;
    return m.runs >= 10 && m.hours >= 2;
  }).map(({ hours: _h, kind: _k, ...c }) => c);
}

export function noteText(c: Pick<Candidate, "tools" | "runs">): string {
  const top = c.tools.slice(0, 3).map(([t]) => t);
  const tools = top.length > 1 ? `${top.slice(0, -1).join(", ")} and ${top[top.length - 1]}` : top[0];
  return `Hi from the developer of Solana Pulse 👋 I noticed you've been using ${tools} (${c.runs} calls this week). Glad it's useful! I'd love to hear what you're making, and if anything's missing or you'd like more free calls while you test, just ask. Contact: ${CONTACT}`;
}

// Last week's tool runs per network and client, with the MCP client name each network sent on initialize.
async function activity(): Promise<CallerActivity[]> {
  const recent = `${TOOL_RUN_SQL} AND via IS DISTINCT FROM 'owner' AND created_at >= NOW() - INTERVAL '7 days'`;
  const [runs, spread, inits, owners] = await Promise.all([
    pool.query(`SELECT caller_hash, client, endpoint, COUNT(*)::int AS n FROM service_usage WHERE ${recent} GROUP BY caller_hash, client, endpoint`),
    pool.query(`SELECT caller_hash, client, COUNT(DISTINCT date_trunc('hour', created_at))::int AS hours FROM service_usage WHERE ${recent} GROUP BY caller_hash, client`),
    pool.query(`SELECT caller_hash, client, MAX(mcp_client) AS mcp_client FROM service_usage
      WHERE mcp_client IS NOT NULL AND created_at >= NOW() - INTERVAL '7 days' GROUP BY caller_hash, client`),
    // The owner's networks: where the dashboard was opened, and wherever the owner's own wallets paid for a call.
    pool.query(`SELECT caller_hash FROM owner_networks
      UNION SELECT s.caller_hash FROM service_usage s JOIN x402_payments p ON p.tx_signature = s.payment_tx
      WHERE p.payer = ANY(string_to_array($1, ',')) AND s.caller_hash IS NOT NULL`, [ownerWallets()]),
  ]);
  const ownerNets = new Set(owners.rows.map((r: any) => r.caller_hash));
  const hoursOf = new Map(spread.rows.map((r: any) => [`${r.caller_hash}|${r.client}`, r.hours as number]));
  const mcp = new Map(inits.rows.map((r: any) => [`${r.caller_hash}|${r.client}`, r.mcp_client]));
  const by = new Map<string, CallerActivity>();
  for (const r of runs.rows as any[]) {
    const k = `${r.caller_hash}|${r.client}`;
    const a = by.get(k) ?? { client: r.client ?? "", callerHash: r.caller_hash, mcpClient: mcp.get(k) ?? null, runs: 0, hours: hoursOf.get(k) ?? 0, tools: {}, owner: ownerNets.has(r.caller_hash) };
    const tool = String(r.endpoint).split("/").pop()!;
    a.runs += r.n;
    a.tools[tool] = (a.tools[tool] ?? 0) + r.n;
    by.set(k, a);
  }
  return [...by.values()];
}

type Active = { key: string; match_ua: string; match_hash: string | null; note: string };
let active: Active[] = [];

async function loadActive() {
  const r = await pool.query(`SELECT key, match_ua, match_hash, note FROM outreach WHERE expires_at > NOW()`);
  active = r.rows as Active[];
}

// Finds new callers to greet, records them, and logs a line the owner's email alert listens for.
export async function refreshOutreach() {
  try {
    // Callers with a hand-written note (notes.ts) already have one; don't add a second or email about them again.
    const candidates = pickCandidates(await activity()).filter((c) => !CALLER_NOTES.some((n) => n.userAgent.test(c.matchUa)));
    for (const c of candidates) {
      const added = await pool.query(
        `INSERT INTO outreach (key, match_ua, match_hash, name, note, tools, runs, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW() + make_interval(days => $8::int)) ON CONFLICT (key) DO NOTHING RETURNING key`,
        [c.key, c.matchUa, c.matchHash, c.name, noteText(c), c.tools.map(([t, n]) => `${t} ${n}`).join(", "), c.runs, NOTE_DAYS]);
      if (added.rows.length) console.log(`OUTREACH_NEW ${JSON.stringify({ name: c.name, userAgent: c.matchUa, runs: c.runs, tools: c.tools.slice(0, 5) })}`);
    }
    await loadActive();
  } catch (error) {
    console.error("outreach refresh failed:", error);
  }
}

// Headers must be plain ASCII, so the emoji is dropped there.
const asHeader = (text: string) => text.replace(/[^\x20-\x7E]/g, "").replace(/\s+/g, " ").trim();

export function outreachNotes(req: Request, res: Response, next: NextFunction) {
  if (!active.length || res.getHeader("x-note-from-the-developer")) return next();
  const ua = String(req.headers["user-agent"] || "").slice(0, 120);
  const hash = req.ip ? hashIp(req.ip) : null;
  const match = active.find((a) => a.match_ua === ua && (!a.match_hash || a.match_hash === hash));
  if (!match) return next();
  res.setHeader("x-note-from-the-developer", asHeader(match.note));
  const json = res.json.bind(res);
  res.json = (body: any) => json(body && typeof body === "object" && !Array.isArray(body) ? { ...body, note_from_the_developer: match.note } : body);
  next();
}

export async function listOutreach() {
  const r = await pool.query(`SELECT key, name, match_ua, tools, runs, created_at, expires_at FROM outreach ORDER BY created_at DESC LIMIT 50`);
  return r.rows.map((x: any) => ({
    key: x.key, name: x.name, userAgent: x.match_ua, tools: x.tools, runs: x.runs,
    since: new Date(x.created_at).toISOString(), until: new Date(x.expires_at).toISOString(), active: new Date(x.expires_at).getTime() > Date.now(),
  }));
}

// The owner ends a note (they replied, or it went to the wrong caller). The row stays, so the caller isn't greeted again.
export async function stopOutreach(key: string) {
  const r = await pool.query(`UPDATE outreach SET expires_at = NOW() WHERE key = $1 RETURNING key`, [key]);
  await loadActive();
  return r.rows.length > 0;
}
