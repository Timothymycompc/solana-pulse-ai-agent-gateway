// Tool runs on a report's own addresses (reports/runs.ts), replayed from the real usage log
// (tests/fixtures/report-runs-real.json: the one real run so far, tx_version on CrawlHive's proof, Oct 30).
import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pool, ensureSchema } from "../server/db";
import { publishedReports, REPORTS } from "../server/reports/list";
import { keysOf, reportRuns, syncReportRuns } from "../server/reports/runs";
import { suggested } from "../src/components/report/ReportRuns";

const db = new PGlite();
const fixture = JSON.parse(fs.readFileSync("tests/fixtures/report-runs-real.json", "utf8"));
before(async () => {
  (pool as any).query = async (sql: string, params?: unknown[]) => { const r = await db.query(sql, params as any[]); return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length }; };
  await ensureSchema();
  // The caller hash isn't kept in the public fixture; one stand-in hash marks the owner's network, as `mine` was recorded.
  await pool.query(`INSERT INTO owner_networks (caller_hash) VALUES ('owner-network')`);
  for (const r of fixture.rows) {
    await pool.query(`INSERT INTO service_usage (id, endpoint, method, status, created_at, via, test_name, input, caller_hash) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [r.id, r.endpoint, r.method, r.status, r.created_at, r.via, r.test_name, JSON.stringify(r.input), r.mine ? "owner-network" : "a-visitor"]);
  }
});

test("a report's keys are its own addresses and signatures", () => {
  assert.ok(keysOf(REPORTS.crawlhive).includes("5MRa9rSrdwN2Ys5eLqPG5rhXj73sw1tQ1iz5uG5nsEMKBmnY9aakLMHybH5c8WC35AGZTEa4pUxEppGN3atZCoyB"));
  assert.ok(keysOf(REPORTS.progcoin).includes("Euxd1pSXmJHEsdVXwk2H8gaEKbbNyBmgB1Gt2NdqHsA9"), "a Solana address named in a finding counts");
});

test("the real first run on CrawlHive is found, kept, and labelled ours; a second sync adds nothing", async () => {
  assert.equal((await syncReportRuns(publishedReports())).added, 1);
  assert.equal((await syncReportRuns(publishedReports())).added, 0);
  const runs = await reportRuns("crawlhive");
  assert.deepEqual(runs.map((r) => [r.tool, r.field, r.by, r.ok, r.channel]), [["tx_version", "tx_id", "us", true, "website or HTTP"]]);
  assert.equal(runs[0].at, new Date(fixture.rows[0].created_at).toISOString());
  assert.deepEqual(await reportRuns("luckquexa"), [], "no tool has been run on luckquexa's addresses");
  const kept = JSON.stringify((await pool.query(`SELECT * FROM report_tool_runs`)).rows);
  assert.ok(!kept.includes("owner-network"), "the caller is never kept");
});

test("with no runs yet, the suggested group uses the report's own addresses", () => {
  assert.deepEqual(suggested(REPORTS.progcoin), [{ tool: "whats_this", args: { address: "Euxd1pSXmJHEsdVXwk2H8gaEKbbNyBmgB1Gt2NdqHsA9" } }]);
  assert.deepEqual(suggested(REPORTS.crawlhive).map((s) => s.tool), ["tx_version", "token_safety", "whats_this"]);
  assert.deepEqual(suggested(REPORTS.luckquexa), [], "no Solana address: nothing to suggest");
});
