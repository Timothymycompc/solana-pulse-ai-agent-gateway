// Every Pulse tool run on a public report's own addresses: the first one (usually ours, when we checked the project) and
// every later one, by us or by a visitor, over the website, MCP or Telegram. Read from the usage log, which clears tool
// inputs after 30 days, so matches are copied into report_tool_runs during the accuracy tick (every 10 minutes).
// Kept per run: the tool, when, how it came in, whether it worked, ours or a visitor's, and which of the report's own
// public addresses it was run on. Never the caller or the rest of their input.
import { pool } from "../db";
import { publishedReports } from "./list";
import type { Report } from "./types";

const BASE58 = /[1-9A-HJ-NP-Za-km-z]{32,88}/g;

// The report's own public addresses and signatures: what it watches, its proofs, and any it names in a finding.
export function keysOf(r: Report): string[] {
  const keys = [...r.watched.map((w) => w.address), ...r.proof.map((p) => p.signature), ...r.findings.flatMap((f) => f.where.flatMap((w) => w.match(BASE58) ?? []))];
  return [...new Set(keys.filter((k) => k.length >= 32))];
}

// The tool input field holding the key, e.g. { tx_id: "5MRa..." } -> "tx_id".
const fieldOf = (input: any, key: string): string | null => {
  if (!input || typeof input !== "object") return null;
  for (const [k, v] of Object.entries(input)) if (typeof v === "string" && v.includes(key)) return k;
  return null;
};

export async function syncReportRuns(reports = publishedReports()) {
  const byKey = new Map<string, string>();
  for (const r of reports) for (const k of keysOf(r)) byKey.set(k, r.name);
  if (!byKey.size) return { added: 0 };
  const last = Number((await pool.query(`SELECT COALESCE(MAX(last_id), 0) AS id FROM report_runs_sync`)).rows[0].id);
  const pattern = [...byKey.keys()].join("|");
  // Read the newest id first and stop there, so a run logged while this works is picked up next time, not skipped.
  const newest = Number((await pool.query(`SELECT COALESCE(MAX(id), 0) AS id FROM service_usage`)).rows[0].id);
  const rows = (await pool.query(`SELECT s.id, s.endpoint, s.status, s.created_at, s.input,
      (s.via = 'owner' OR s.test_name IS NOT NULL OR COALESCE(s.caller_hash IN (SELECT caller_hash FROM owner_networks), FALSE)) AS mine
    FROM service_usage s WHERE s.id > $1 AND s.id <= $3 AND s.input IS NOT NULL AND s.input::text ~ $2 AND s.endpoint ~ '^/(api|mcp|telegram)/tools/' ORDER BY s.id`, [last, pattern, newest])).rows;
  let added = 0;
  for (const row of rows) {
    const [, channel, tool] = String(row.endpoint).match(/^\/(api|mcp|telegram)\/tools\/(\w+)$/) ?? [];
    if (!tool) continue;
    for (const [key, report] of byKey) {
      const field = fieldOf(row.input, key);
      if (!field) continue;
      const done = await pool.query(`INSERT INTO report_tool_runs (usage_id, report, tool, channel, at, field, value, status, mine) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT DO NOTHING`,
        [row.id, report, tool, channel === "api" ? "website or HTTP" : channel === "mcp" ? "MCP" : "Telegram", row.created_at, field, key, row.status, row.mine]);
      added += done.rowCount ?? 0;
    }
  }
  await pool.query(`INSERT INTO report_runs_sync (one, last_id) VALUES (TRUE, $1) ON CONFLICT (one) DO UPDATE SET last_id = GREATEST(report_runs_sync.last_id, $1)`, [newest]);
  return { added };
}

export type ReportRun = { tool: string; channel: string; at: string; field: string; value: string; ok: boolean; by: "us" | "a visitor" };

export async function reportRuns(name: string): Promise<ReportRun[]> {
  const rows = (await pool.query(`SELECT tool, channel, at, field, value, status, mine FROM report_tool_runs WHERE report = $1 ORDER BY at`, [name])).rows;
  return rows.map((r: any) => ({ tool: r.tool, channel: r.channel, at: new Date(r.at).toISOString(), field: r.field, value: r.value, ok: r.status >= 200 && r.status < 300, by: r.mine ? "us" : "a visitor" }));
}
