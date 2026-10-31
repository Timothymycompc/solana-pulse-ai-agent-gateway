// Records the real tokens the research tests replay: every sampled token with a week-later result, and every token-watch
// token that finished its week, with all its readings. Read-only, through ~/bin/db-look.
// Usage: npx tsx tests/record-research.ts   (writes tests/fixtures/research-real.json)
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const look = (sql: string) => {
  const out = execFileSync(path.join(os.homedir(), "bin/db-look"), ["pulse", `SELECT COALESCE(json_agg(t), '[]')::text FROM (${sql}) t`], { encoding: "utf8", maxBuffer: 64 << 20 });
  return JSON.parse(out.slice(out.indexOf("[")));
};

const accuracy = look(`SELECT cohort, mint, found_in, added_at, checked_at, verdict, checks, first_pool_at, liquidity_then, price_then, follow_up_due,
  followed_at, rugcheck_rugged, liquidity_now, price_now, attempts FROM accuracy_tokens WHERE cohort LIKE 'young-tokens-%' AND followed_at IS NOT NULL ORDER BY checked_at`);
const watch = look(`SELECT * FROM token_watch WHERE watch_until < NOW() ORDER BY added_at`);
const readings = look(`SELECT mint, at, reading FROM token_watch_readings WHERE mint IN (SELECT mint FROM token_watch WHERE watch_until < NOW()) ORDER BY mint, at`);

fs.writeFileSync("tests/fixtures/research-real.json", JSON.stringify({ recordedAt: new Date().toISOString(), source: "Pulse database (accuracy_tokens, token_watch, token_watch_readings)", accuracy, watch, readings }));
console.log(`recorded ${accuracy.length} sampled tokens, ${watch.length} finished watches, ${readings.length} readings`);
