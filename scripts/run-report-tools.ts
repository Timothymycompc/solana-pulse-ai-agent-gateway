// Runs Pulse's own tools on every public report's own addresses, on the live site, under the owner key (so the runs show
// as ours on each report page), and saves every answer plus a summary.
// Usage: npx tsx scripts/run-report-tools.ts <output folder>
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { publishedReports } from "../server/reports/list";
import { suggested } from "../src/components/report/ReportRuns";

const out = process.argv[2];
if (!out) throw new Error("Usage: npx tsx scripts/run-report-tools.ts <output folder>");
const SITE = "https://solana-pulse-gateway-1021990235790.us-central1.run.app";
const key = execFileSync("gcloud", ["secrets", "versions", "access", "latest", "--secret=OWNER_API_KEY", "--project=x300-506418"], { encoding: "utf8" }).trim();
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

const lines: string[] = [`# Pulse tool runs on every report (${new Date().toISOString()})`, "", "Each row: report, tool, input, HTTP status, and the answer's first line. Full answers are in the report's folder.", ""];
let ok = 0, failed = 0, none = 0;
for (const r of publishedReports()) {
  const steps = suggested(r);
  if (!steps.length) { lines.push(`- ${r.name} (${r.kind}): no Solana address or transaction in this report, nothing for a tool to check`); none++; continue; }
  fs.mkdirSync(path.join(out, r.name), { recursive: true });
  for (const s of steps) {
    const value = Object.values(s.args)[0];
    let status = 0, body: any = null;
    try {
      const res = await fetch(`${SITE}/api/tools/${s.tool}`, { method: "POST", headers: { "content-type": "application/json", "x-api-key": key, "x-pulse-test": "report-runs" }, body: JSON.stringify(s.args) });
      status = res.status;
      body = await res.json().catch(() => null);
    } catch (e) { body = { error: String(e) }; }
    fs.writeFileSync(path.join(out, r.name, `${s.tool}-${value.slice(0, 8)}.json`), JSON.stringify(body, null, 2));
    const first = body?.summary ?? body?.verdict ?? body?.version ?? body?.error ?? "";
    lines.push(`- ${r.name} (${r.kind}): ${s.tool} ${Object.keys(s.args)[0]} ${value.slice(0, 8)}… -> ${status} ${String(first).slice(0, 140)}`);
    status === 200 ? ok++ : failed++;
    await pause(1500);
  }
}
lines.splice(3, 0, `Worked: ${ok}. Failed: ${failed}. Reports with nothing to check: ${none}.`, "");
fs.writeFileSync(path.join(out, "SUMMARY.md"), lines.join("\n") + "\n");
console.log(`worked ${ok}, failed ${failed}, nothing to check ${none}`);
