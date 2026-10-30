// Public reports: only published reports are listed, rendered and indexable; an unpublished one doesn't exist publicly.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import { renderToString } from "react-dom/server";
import React from "react";
import { pageHandler } from "../server/pages";
import { TOOLS, toolDoc } from "../server/tools";
import { publishedReports, REPORTS } from "../server/reports/list";
import { crawlhive } from "../server/reports/crawlhive";
import { ReportView } from "../src/components/report/ReportView";

let base = "";
let server: any;
before(() => {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-dist-"));
  fs.copyFileSync("index.html", path.join(dist, "index.html"));
  const app = express();
  app.use(pageHandler(dist, () => ({ freeCallsPerTool: 25, payments: { network: "solana", asset: "USDC", payTo: "x" }, tools: TOOLS.map(toolDoc) })));
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());
const get = async (p: string) => { const r = await fetch(base + p); return { status: r.status, html: await r.text() }; };

test("a report stays private until the project has been told", () => {
  assert.equal(crawlhive.published, false);
  assert.ok(!publishedReports().some((r) => r.name === "crawlhive"));
  const told = { ...REPORTS, crawlhive: { ...crawlhive, published: { at: "2026-10-31", told: "GitHub issue posted" } } };
  assert.deepEqual(publishedReports(told).map((r) => r.name), ["crawlhive"]);
});

test("the reports list renders for search engines; an unpublished report's page is a 404 and not indexed", async () => {
  const list = await get("/reports");
  assert.equal(list.status, 200);
  assert.match(list.html, /<title>Reports · Solana Pulse<\/title>/);
  assert.ok(!/noindex/.test(list.html), "the list is indexable");
  const hidden = await get("/reports/crawlhive");
  assert.equal(hidden.status, 404);
  assert.match(hidden.html, /noindex/);
});

test("a published report renders its findings, addresses and proof in the HTML", () => {
  const html = renderToString(React.createElement(ReportView, { report: crawlhive, live: null, liveState: "loading" }));
  for (const f of crawlhive.findings) assert.ok(html.includes(f.title.replace(/'/g, "&#x27;")), f.title);
  assert.ok(html.includes("scan-snipers.ts:114"));
  assert.ok(html.includes(crawlhive.proof[0].signature));
  assert.ok(html.includes("Run this check now"));
});

test("the key holder's page is never indexed", async () => {
  const { html } = await get("/mine");
  assert.match(html, /noindex/);
  assert.match(html, /<title>Your report · Solana Pulse<\/title>/);
});
