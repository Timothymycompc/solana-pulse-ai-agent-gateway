// Owner dashboard, Calls tab: every tool call in a period, read straight from service_usage (GET /api/owner/calls,
// owner key only). Filtering and paging happen here so the page stays fast with thousands of calls; a call's full input
// and output load one at a time when the owner opens it (GET /api/owner/calls/:id).
import { pool, TOOL_RUN_SQL } from "./db";
import { classifyClient, type CallerKind } from "./callers";
import { TOOLS_BY_NAME } from "./tools";

type Kind = CallerKind | "you";
export const CALL_HOURS = [1, 24, 168, 720];
const PAGE_MAX = 200;
const WINDOW_MAX = 20_000;

export type InputKind = "own" | "example" | "empty";
export type CallStatus = "ok" | "error" | "payment";
export type CallsQuery = {
  hours: number; tool?: string; kind?: string; input?: string; status?: string; q?: string; caller?: string; network?: string;
  group?: string; sort?: string; before?: number; after?: number; limit?: number;
  // Hide directory and uptime bots plus networks posing as several browsers; hide the owner's own calls.
  hideBots?: boolean; hideMine?: boolean;
};
// The explorer can show the matching calls one by one, or folded into groups sorted by any of these.
export const GROUPS = ["caller", "network", "tool", "kind", "input"] as const;
export const SORTS = ["calls", "recent", "own", "errors", "paid"] as const;
const GROUP_MAX = 300;

const shortId = (hash: string | null) => (hash ? hash.slice(0, 6) : null);
// "/api/tools/token_safety" or "/mcp/tools/token%5Fsafety" → the tool's current name (old names count as the new one).
function toolOf(endpoint: string): string {
  const raw = endpoint.replace(/^\/(api|mcp)\/tools\//, "");
  let name = raw;
  try { name = decodeURIComponent(raw); } catch { /* keep raw */ }
  return TOOLS_BY_NAME.get(name)?.name ?? name;
}

// A desktop browser's operating system, from its user agent. One network answering as several of these within the
// period is a crawler rotating fake browser identities, not a person (seen 2026-10-18: Chrome on Linux, Chrome on
// Windows and Safari on macOS from one network at the same minute).
function desktopOs(ua: string | null): string | null {
  if (!ua || !ua.startsWith("Mozilla/") || /Mobile|Android|iPhone|iPad/.test(ua)) return null;
  if (ua.includes("Windows NT")) return "windows";
  if (ua.includes("Macintosh")) return "mac";
  if (ua.includes("X11") || ua.includes("Linux")) return "linux";
  return null;
}

const outcomeOf = (r: any) => (r.payment_tx ? "paid" : r.status === 402 || r.via === "x402" ? "payment_asked"
  : r.status >= 400 ? "error" : r.via === "free_call" ? "free_call" : r.via === "owner" ? "owner_key" : "ok");
const statusOf = (r: any): CallStatus => (r.payment_tx || r.status === 402 || r.via === "x402" ? "payment" : r.status >= 400 ? "error" : "ok");
const shownKind = (k: Kind) => (k === "unknown" ? "other" : k);

// The one line a row shows of the answer: the verdict and summary when the tool gives them, otherwise the error.
function headline(r: any): string | null {
  if (r.truncated) return "Output too large to keep";
  return [r.verdict, r.summary].filter(Boolean).join(": ").slice(0, 160) || null;
}

export async function ownerCalls(o: CallsQuery) {
  const hours = CALL_HOURS.includes(o.hours) ? o.hours : 24;
  const limit = Math.min(Math.max(o.limit ?? 100, 1), PAGE_MAX);
  const search = o.q?.trim() ? `%${o.q.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
  const [owners, mcpRows, rowsRes] = await Promise.all([
    pool.query(`SELECT caller_hash FROM owner_networks`),
    pool.query(`SELECT caller_hash, client, MAX(mcp_client) AS mcp_client FROM service_usage
      WHERE mcp_client IS NOT NULL AND created_at >= NOW() - make_interval(hours => $1::int) GROUP BY caller_hash, client`, [hours]),
    pool.query(`
      SELECT s.id, s.endpoint, s.caller_hash, s.client, s.via, s.status, s.payment_tx, s.note_sent, s.created_at,
        p.amount_base_units AS paid,
        CASE WHEN s.input IS NULL OR s.input = '{}'::jsonb THEN 'empty'
          WHEN EXISTS (SELECT 1 FROM served_examples e WHERE e.input_hash = md5(s.input::text)) THEN 'example'
          ELSE 'own' END AS input_kind,
        s.output->>'verdict' AS verdict, LEFT(COALESCE(s.output->>'summary', s.output->>'error'), 200) AS summary,
        (s.output->>'truncated') = 'true' AS truncated
      FROM service_usage s LEFT JOIN x402_payments p ON p.tx_signature = s.payment_tx
      WHERE ${TOOL_RUN_SQL} AND s.created_at >= NOW() - make_interval(hours => $1::int)
        AND ($2::text IS NULL OR s.input::text ILIKE $2 OR s.output::text ILIKE $2 OR s.client ILIKE $2 OR s.endpoint ILIKE $2 OR s.caller_hash ILIKE $2)
      ORDER BY s.id DESC LIMIT ${WINDOW_MAX}`, [hours, search]),
  ]);

  const ownerNets = new Set<string>(owners.rows.map((r: any) => r.caller_hash));
  const mcpOf = new Map<string, string>(mcpRows.rows.map((r: any) => [`${r.caller_hash}|${r.client}`, r.mcp_client]));
  const osByNet = new Map<string, Set<string>>();
  for (const r of rowsRes.rows) {
    const os = desktopOs(r.client);
    if (os && r.caller_hash) (osByNet.get(r.caller_hash) ?? osByNet.set(r.caller_hash, new Set()).get(r.caller_hash)!).add(os);
  }

  const all = rowsRes.rows.map((r: any) => {
    const mcpClient = mcpOf.get(`${r.caller_hash}|${r.client}`) ?? null;
    const info = classifyClient(r.client, mcpClient);
    const mine = info.kind !== "bot" && ((r.caller_hash && ownerNets.has(r.caller_hash)) || r.via === "owner");
    const kind: Kind = mine ? "you" : info.kind;
    const transport = String(r.endpoint).startsWith("/mcp") ? "mcp" : "http";
    return {
      id: Number(r.id), at: new Date(r.created_at).toISOString(), tool: toolOf(r.endpoint), transport, status: Number(r.status),
      outcome: outcomeOf(r), statusGroup: statusOf(r), inputKind: r.input_kind as InputKind,
      paidUsdc: r.paid ? Number(r.paid) / 1e6 : 0, noteSent: r.note_sent === true, verdict: r.verdict ?? null, headline: headline(r),
      caller: {
        id: info.kind === "bot" ? `bot:${info.name}` : `net:${r.caller_hash}|${info.name}`, kind, name: info.name,
        network: info.kind === "bot" ? null : shortId(r.caller_hash), userAgent: r.client, mcpClient, homepage: info.homepage,
        rotatesBrowsers: (osByNet.get(r.caller_hash)?.size ?? 0) >= 2,
      },
    };
  });

  // Hidden callers drop out before anything is counted, so the numbers describe what is left on screen.
  const visible = all.filter((c) => !(o.hideBots && (c.caller.kind === "bot" || c.caller.rotatesBrowsers)) && !(o.hideMine && c.caller.kind === "you"));
  // The counts behind the filter chips cover the whole period (and search), so every option shows what it would match.
  const count = <T extends string>(pick: (c: (typeof all)[number]) => T) =>
    visible.reduce((m, c) => ((m[pick(c)] = (m[pick(c)] ?? 0) + 1), m), {} as Record<string, number>);
  const summary = {
    calls: visible.length, hidden: all.length - visible.length, capped: rowsRes.rows.length >= WINDOW_MAX,
    networks: new Set(visible.filter((c) => c.caller.network).map((c) => c.caller.network)).size,
    rotatingNetworks: new Set(all.filter((c) => c.caller.rotatesBrowsers).map((c) => c.caller.network)).size,
    byTool: count((c) => c.tool), byKind: count((c) => shownKind(c.caller.kind)), byInput: count((c) => c.inputKind), byStatus: count((c) => c.statusGroup),
  };

  const matching = visible.filter((c) =>
    (!o.tool || c.tool === o.tool) && (!o.kind || shownKind(c.caller.kind) === o.kind) &&
    (!o.input || c.inputKind === o.input) && (!o.status || c.statusGroup === o.status) &&
    (!o.caller || c.caller.id === o.caller) && (!o.network || c.caller.network === o.network));
  const page = (o.after ? matching.filter((c) => c.id > o.after!) : matching.filter((c) => !o.before || c.id < o.before)).slice(0, limit);
  const nextBefore = !o.after && page.length === limit && matching.some((c) => c.id < page[page.length - 1].id) ? page[page.length - 1].id : null;
  const group = (GROUPS as readonly string[]).includes(o.group ?? "") ? o.group! : null;
  return { generatedAt: new Date().toISOString(), hours, summary, matching: matching.length, rows: page, nextBefore,
    group, groups: group ? groupCalls(matching, group, (SORTS as readonly string[]).includes(o.sort ?? "") ? o.sort! : "calls") : null };
}

type Call = {
  at: string; tool: string; inputKind: InputKind; statusGroup: CallStatus; paidUsdc: number;
  caller: { id: string; kind: Kind; name: string; network: string | null; userAgent: string | null; rotatesBrowsers: boolean };
};

// Folds calls into one row per caller, network, tool, caller kind or input kind. Each group carries the filter that
// opens its calls (the dashboard passes it back as caller=, network=, tool=, kind= or input=).
function groupCalls(calls: Call[], by: string, sort: string) {
  const groups = new Map<string, any>();
  for (const c of calls) {
    const key = by === "caller" ? c.caller.id : by === "network" ? c.caller.network ?? "(no network: bots)" : by === "tool" ? c.tool
      : by === "kind" ? shownKind(c.caller.kind) : c.inputKind;
    let g = groups.get(key);
    if (!g) {
      g = {
        // Bots are counted across networks, so their network group opens as "all bot calls".
        key, label: by === "caller" ? c.caller.name : key,
        filter: by === "network" && !c.caller.network ? { kind: "bot" } : { [by === "caller" ? "caller" : by]: key },
        kind: by === "caller" ? c.caller.kind : null, network: by === "caller" || by === "network" ? c.caller.network : null,
        userAgent: by === "caller" ? c.caller.userAgent : null, rotatesBrowsers: false,
        calls: 0, own: 0, examples: 0, empty: 0, errors: 0, payments: 0, paidUsdc: 0, firstAt: c.at, lastAt: c.at,
        tools: {} as Record<string, number>, names: new Set<string>(), networks: new Set<string>(),
      };
      groups.set(key, g);
    }
    g.calls++;
    if (c.inputKind === "own") g.own++; else if (c.inputKind === "example") g.examples++; else g.empty++;
    if (c.statusGroup === "error") g.errors++;
    if (c.statusGroup === "payment") g.payments++;
    g.paidUsdc += c.paidUsdc;
    if (c.at < g.firstAt) g.firstAt = c.at;
    if (c.at > g.lastAt) g.lastAt = c.at;
    g.tools[c.tool] = (g.tools[c.tool] ?? 0) + 1;
    g.names.add(c.caller.name);
    if (c.caller.network) g.networks.add(c.caller.network);
    if (c.caller.rotatesBrowsers) g.rotatesBrowsers = true;
  }
  const order: Record<string, (a: any, b: any) => number> = {
    calls: (a, b) => b.calls - a.calls, recent: (a, b) => b.lastAt.localeCompare(a.lastAt), own: (a, b) => b.own - a.own || b.calls - a.calls,
    errors: (a, b) => b.errors - a.errors || b.calls - a.calls, paid: (a, b) => b.paidUsdc - a.paidUsdc || b.payments - a.payments,
  };
  return [...groups.values()].sort(order[sort]).slice(0, GROUP_MAX).map((g) => ({
    ...g, tools: Object.entries(g.tools as Record<string, number>).sort((a, b) => b[1] - a[1]).map(([tool, n]) => ({ tool, n })),
    names: [...g.names], networks: g.networks.size,
  }));
}

// One call's full input and output, for the row the owner opened. Null once they are past the 30-day retention.
export async function ownerCall(id: number) {
  const r = await pool.query(`SELECT id, input, output FROM service_usage WHERE id = $1 AND ${TOOL_RUN_SQL}`, [id]);
  const row = r.rows[0];
  return row ? { id: Number(row.id), input: row.input ?? null, output: row.output ?? null } : null;
}
