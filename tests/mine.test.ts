// /mine: a trial key opens only the report filed under its own name, and the live counts come from real chain reads
// (CrawlHive's treasury, recorded 2026-10-30; see `npm run test:record -- mine-live-treasury`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "crypto";
import { liveCount, reportFor, REPORTS } from "../server/reports";
import { crawlhive } from "../server/reports/crawlhive";
import { loadFixture, replayContext } from "./helpers/replay";

const sha = (k: string) => createHash("sha256").update(k).digest("hex");
const NOW = Date.parse("2026-11-01T00:00:00Z");
const KEYS = [
  { name: "crawlhive", keySha256: sha("key-crawlhive"), until: "2026-12-12T23:59:59Z", why: "test" },
  { name: "tensorblock", keySha256: sha("key-tensorblock"), until: "2027-01-13T23:59:59Z", why: "test" },
  { name: "old", keySha256: sha("key-old"), until: "2026-10-01T23:59:59Z", why: "test" },
];

test("a key opens the report filed under its own name", () => {
  const r = reportFor("key-crawlhive", NOW, KEYS, REPORTS);
  assert.equal(r.status, 200);
  assert.equal(r.status === 200 && r.report.project, "CrawlHive");
});

test("another key holder's key never opens it, and the answer doesn't say which names have reports", () => {
  const r = reportFor("key-tensorblock", NOW, KEYS, REPORTS);
  assert.equal(r.status, 404);
  assert.ok(r.status === 404 && !/crawlhive/i.test(r.error));
});

test("no key, a wrong key and an expired key are all refused", () => {
  for (const k of [undefined, "", "key-crawlhive ", "nope", "key-old"]) assert.equal(reportFor(k, NOW, KEYS, REPORTS).status, 401, String(k));
});

test("every finding points at code lines and every fact says how and when it was measured", () => {
  for (const f of crawlhive.findings) assert.ok(f.where.length && f.where.every((w) => /:\d+$/.test(w)), f.title);
  for (const f of crawlhive.facts) assert.ok(f.source && !Number.isNaN(Date.parse(f.checkedAt)), f.label);
  for (const w of crawlhive.watched) assert.ok(w.source, w.label);
});

test("live count reads the treasury's newest transactions by version, retrying rate-limited reads", async () => {
  const fixture = loadFixture("mine-live-treasury");
  const ctx = replayContext(fixture);
  const c = await liveCount(ctx.connection("mainnet-beta"), crawlhive.watched[1], Date.parse(fixture.recordedAt), 0);
  assert.equal(c.address, "DgCogtUuki6MZzypK1dKHYWfHLMUnKkNUBQwo6rWTGUJ");
  assert.equal(c.newest, 40);
  assert.equal(c.legacy + c.v0 + c.v1 + c.unknown, c.newest);
  assert.equal(c.unknown, 0, "every read came back (rate-limited reads are retried)");
  assert.ok(c.latest && Date.parse(c.latest) <= Date.parse(fixture.recordedAt));
});

test("the owner preview opens a report by name; the server only allows it with the owner key", () => {
  const r = reportFor(undefined, NOW, KEYS, REPORTS, "crawlhive");
  assert.equal(r.status, 200);
  assert.equal(reportFor(undefined, NOW, KEYS, REPORTS, "nobody").status, 404);
});
