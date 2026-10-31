// One public report per token Pulse checked and followed for a week: what token_safety said, and what really happened
// to the price and liquidity. Read-only from the database through ~/bin/db-look; symbols from Jupiter's token search.
// Usage: npx tsx scripts/reports-from-tokens.ts   (writes server/reports/tokens.generated.ts; re-run as batches finish)
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resultOf, type Result } from "../server/research";
import type { Fact, Finding, Report } from "../server/reports/types";

const look = (sql: string) => {
  const out = execFileSync(path.join(os.homedir(), "bin/db-look"), ["pulse", `SELECT COALESCE(json_agg(t), '[]')::text FROM (${sql}) t`], { encoding: "utf8", maxBuffer: 64 << 20 });
  return JSON.parse(out.slice(out.indexOf("[")));
};
const today = new Date().toISOString().slice(0, 10);
const day = (iso: string) => iso.slice(0, 10);
const usd = (n: number | null) => (n === null ? "unknown" : n >= 1 ? `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : `$${n.toPrecision(3)}`);
const hours = (from: string | null, to: string) => (from ? (Date.parse(to) - Date.parse(from)) / 3.6e6 : null);
const age = (h: number | null) => (h === null ? "unknown" : h < 1 ? `${Math.round(h * 60)} minutes` : h < 48 ? `${Math.round(h)} hours` : `${Math.round(h / 24)} days`);

type Row = { mint: string; symbol: string | null; source: string; checkedAt: string; verdict: string; checks: Record<string, string>; firstPool: string | null;
  priceThen: number | null; priceAfter: number | null; liqThen: number | null; liqAfter: number | null; rugged: boolean | null; afterAt: string | null };

const rows: Row[] = look(`SELECT mint, checked_at, verdict, checks, first_pool_at, price_then, price_now, liquidity_then, liquidity_now, rugcheck_rugged, followed_at
  FROM accuracy_tokens WHERE cohort LIKE 'young-tokens-%' AND followed_at IS NOT NULL AND verdict IS NOT NULL ORDER BY checked_at`).map((r: any) => ({
  mint: r.mint, symbol: null, source: "the first-week test", checkedAt: r.checked_at, verdict: r.verdict, checks: r.checks, firstPool: r.first_pool_at,
  priceThen: r.price_then, priceAfter: r.price_now, liqThen: r.liquidity_then, liqAfter: r.liquidity_now, rugged: r.rugcheck_rugged, afterAt: r.followed_at,
}));
const seen = new Set(rows.map((r) => r.mint));
// Token-watch tokens that finished their week: the reading at check, and the last reading at least 6 days in.
for (const w of look(`SELECT w.mint, w.symbol, w.added_at, w.verdict_then, w.checks_then, w.first_pool_at, w.reading_then,
    (SELECT json_build_object('at', r.at, 'reading', r.reading) FROM token_watch_readings r WHERE r.mint = w.mint AND r.at >= w.added_at + INTERVAL '6 days' ORDER BY r.at DESC LIMIT 1) AS later
    FROM token_watch w WHERE w.watch_until < NOW() AND w.verdict_then IS NOT NULL ORDER BY w.added_at`)) {
  if (seen.has(w.mint)) continue;
  const liq = (r: any) => (r?.listed === false ? 0 : r?.liquidity_usd ?? null);
  rows.push({ mint: w.mint, symbol: w.symbol, source: "the token watch", checkedAt: w.added_at, verdict: w.verdict_then, checks: w.checks_then ?? {}, firstPool: w.first_pool_at,
    priceThen: w.reading_then?.usd_price ?? null, priceAfter: w.later?.reading?.usd_price ?? null, liqThen: liq(w.reading_then), liqAfter: w.later ? liq(w.later.reading) : null, rugged: null, afterAt: w.later?.at ?? null });
}

// Symbols from Jupiter's token search, 50 addresses at a time. A token Jupiter no longer lists keeps no symbol.
for (let i = 0; i < rows.length; i += 50) {
  const batch = rows.slice(i, i + 50);
  try {
    const found = JSON.parse(execFileSync("curl", ["-s", `https://lite-api.jup.ag/tokens/v2/search?query=${batch.map((r) => r.mint).join(",")}`], { encoding: "utf8" }));
    for (const t of found) { const r = batch.find((x) => x.mint === t.id); if (r && !r.symbol && t.symbol) r.symbol = t.symbol; }
  } catch { /* symbols are optional */ }
}

const OUTCOME: Record<Result, string> = { "lost most": "Lost most of its value within a week", "did well": "Did well", "in between": "Neither lost most nor doubled" };
const reports: Report[] = rows.map((t) => {
  const result = resultOf({ rugcheck_rugged: t.rugged, liquidity_then: t.liqThen, liquidity_now: t.liqAfter, price_then: t.priceThen, price_now: t.priceAfter });
  const times = t.priceThen && t.priceAfter !== null ? t.priceAfter / t.priceThen : null;
  const status = result === "did well" ? `Did well: ${times!.toFixed(1)}x the price a week later` : result ? OUTCOME[result] : "Unknown: no source answered a week later";
  const name = t.symbol ?? `${t.mint.slice(0, 4)}…${t.mint.slice(-4)}`;
  const flagged = Object.entries(t.checks).filter(([, v]) => v === "fail" || v === "warn");
  const findings: Finding[] = [
    {
      title: `Pulse said ${t.verdict} on ${day(t.checkedAt)}`,
      severity: t.verdict === "AVOID" ? "warning sign" : "info",
      what: `token_safety checked it when it was ${age(hours(t.firstPool, t.checkedAt))} old (found through ${t.source}).${flagged.length ? " It flagged:" : " Nothing was flagged."}\n\n${flagged.map(([k, v]) => `- ${k}: ${v}`).join("\n")}`.trim(),
      where: [`token_safety, ${day(t.checkedAt)}`],
    },
    {
      title: `A week later: ${status.toLowerCase()}`,
      severity: result === "lost most" ? "breaks money" : "info",
      what: `Price ${usd(t.priceThen)} at the check, ${usd(t.priceAfter)} a week later${times !== null ? ` (${times >= 1 ? `${times.toFixed(2)}x` : `down ${Math.round((1 - times) * 100)}%`})` : ""}. Liquidity ${usd(t.liqThen)}, then ${usd(t.liqAfter)}.${t.rugged ? " RugCheck marks it rugged." : ""} This is what already happened, not a prediction or a buy signal.`,
      where: ["Jupiter price and liquidity", ...(t.rugged !== null ? ["RugCheck"] : [])],
    },
  ];
  const facts: Fact[] = [
    { label: "Verdict at the check", value: t.verdict, source: "Pulse token_safety", checkedAt: t.checkedAt },
    { label: "Price a week later", value: `${usd(t.priceAfter)} (was ${usd(t.priceThen)})`, source: "Jupiter", checkedAt: t.afterAt ?? t.checkedAt },
    { label: "Liquidity a week later", value: `${usd(t.liqAfter)} (was ${usd(t.liqThen)})`, source: "Jupiter (no longer listed counts as none left)", checkedAt: t.afterAt ?? t.checkedAt },
    ...(t.rugged !== null ? [{ label: "RugCheck rugged", value: t.rugged ? "yes" : "no", source: "RugCheck", checkedAt: t.afterAt ?? t.checkedAt }] : []),
  ];
  return {
    name: `token-${t.mint}`, kind: "token", published: { at: today, told: "Public market data from Pulse's own test; tokens aren't told" },
    project: name, summary: `Pulse said ${t.verdict} on ${day(t.checkedAt)}. ${status}.`, status, findings, facts, proof: [],
    watched: [{ label: name, address: t.mint, kind: "token", source: `Jupiter's activity lists, via ${t.source}` }],
  };
});

fs.writeFileSync("server/reports/tokens.generated.ts", `// Generated by scripts/reports-from-tokens.ts from Pulse's database and Jupiter on ${new Date().toISOString()}.
// Don't edit by hand: re-run the script.
import type { Report } from "./types";

export const TOKEN_REPORTS: Report[] = ${JSON.stringify(reports, null, 1)};
`);
console.log(`${reports.length} token reports (${reports.filter((r) => r.status?.startsWith("Lost")).length} lost most, ${reports.filter((r) => r.status?.startsWith("Did well")).length} did well, ${reports.filter((r) => r.status?.startsWith("Unknown")).length} unknown)`);
