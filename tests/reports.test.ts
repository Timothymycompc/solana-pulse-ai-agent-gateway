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
import { parseBody } from "../server/reports/parse-issue";
import { ReportView } from "../src/components/report/ReportView";
import { ON_SITE } from "../server/site";

// The public pages are tested while reports are on the site (server/site.ts); while off, the last test checks they are hidden.
const onSite = { skip: !ON_SITE.reports && "reports are off the site (server/site.ts)" };

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
  const untold = Object.fromEntries(Object.entries(REPORTS).map(([k, r]) => [k, { ...r, published: false as const }]));
  assert.deepEqual(publishedReports(untold).map((r) => r.name), []);
  assert.ok(crawlhive.published && crawlhive.issue, "CrawlHive was told in a GitHub issue before going public");
});

test("the list and a published report render for search engines; an unknown report is a 404 and not indexed", onSite, async () => {
  const list = await get("/reports");
  assert.equal(list.status, 200);
  assert.match(list.html, /<title>Reports · Solana Pulse<\/title>/);
  assert.ok(!/noindex/.test(list.html), "the list is indexable");
  assert.match(list.html, /CrawlHive/);
  const page = await get("/reports/crawlhive");
  assert.equal(page.status, 200);
  assert.ok(!/noindex/.test(page.html));
  assert.match(page.html, /scan-snipers\.ts:114/);
  const missing = await get("/reports/nobody");
  assert.equal(missing.status, 404);
  assert.match(missing.html, /noindex/);
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

test("every public report names a source and a real date for each fact, and says how the project was told", () => {
  for (const r of publishedReports()) {
    assert.ok(r.published && r.published.told.length > 10, `${r.name}: says how it was told`);
    assert.ok(r.findings.length, `${r.name}: has findings`);
    for (const f of r.facts) {
      assert.ok(f.source.trim().length > 2, `${r.name}: "${f.label}" names a source`);
      assert.ok(!Number.isNaN(Date.parse(f.checkedAt)), `${r.name}: "${f.label}" has a date`);
    }
    if (r.kind === "code") {
      assert.match(r.issue ?? "", new RegExp(`^${r.repo}/issues/\\d+$`), `${r.name}: the issue is on its own repo`);
      for (const f of r.findings) assert.ok(f.fix, `${r.name}: "${f.title}" has a fix`);
    }
    if (r.kind === "scam") assert.ok(r.site && r.status, `${r.name}: names the site and what is still unknown`);
  }
});

test("a posted bug report is split into finding, reproduction and fix; the sign-off and P.S. are dropped", () => {
  const body = "`src/pay/verify.ts` (lines 12, 40) reads payments with `maxSupportedTransactionVersion: 0`. Uses `@solana/web3.js` 1.98.4.\n\nReproduced on Solana mainnet on 2026-10-28 with a real version 1 transaction:\n\n```\ngetTransaction(<v1 signature>, { maxSupportedTransactionVersion: 0 })  -> error -32015\n```\n\nExample: `2SmL3M6ucn5vxSwc2nFGE37YBP2HVxaKDksY7qpkNeYQKpipYApVBnbjVgwhvufqg4ZZRYDqjdFPuT8WyXfF7GkS` (slot 462245428).\n\nFix: `maxSupportedTransactionVersion: 1`. Happy to open a PR.\n\nTimothy\n\nP.S. I found this while building Solana Pulse.";
  const p = parseBody(body);
  assert.deepEqual(p.where, ["src/pay/verify.ts:12", "src/pay/verify.ts:40"]);
  assert.match(p.example ?? "", /error -32015/);
  assert.equal(p.fix, "`maxSupportedTransactionVersion: 1`.");
  assert.ok(!/P\.S\.|Timothy|Happy to open|Reproduced on/.test(p.what));
  assert.deepEqual(p.proof.map((x) => [x.signature.slice(0, 6), x.slot]), [["2SmL3M", 462245428]]);
});

test("no public report carries the owner's own payments, test-account addresses, private people or leaked keys", () => {
  const PRIVATE = [
    "0xD03E39D3e31276203238532319F7ec6CbfF1D799", "0x0B04cDeD95bb868d4aFaceb6131758FDc2f276d7", "0xC020c28392067858196f9E298959123422209a3E",
    "Brian", "Savegetem", "Cresta", "Cash Card", "2929", "CS2BEXT8F", "MAGICAL ELF", "AZXSSN", "7692758764", "8693757423", "TPkvU2", "TXe31JpK",
    "meratix", "cidercasino", "Timothy", "kunal", "adilak",
  ];
  const text = JSON.stringify(publishedReports()).toLowerCase();
  for (const s of PRIVATE) assert.ok(!text.includes(s.toLowerCase()), `public reports must not contain ${s}`);
});

test("casino and earn-app pages render for search engines, and never link to the site they warn about", onSite, async () => {
  for (const name of ["luckquexa", "4kgame", "boomwins", "progcoin", "luckyvaults", "agent402"]) {
    const page = await get(`/reports/${name}`);
    assert.equal(page.status, 200, name);
    assert.ok(!/noindex/.test(page.html), name);
  }
  const lq = await get("/reports/luckquexa");
  assert.match(lq.html, /spinmelo\.com/, "every sister domain is searchable");
  for (const r of publishedReports().filter((r) => r.kind === "scam")) {
    const html = renderToString(React.createElement(ReportView, { report: r, live: null, liveState: "loading" }));
    assert.ok(!html.includes(`href="https://${r.site}`) && !html.includes(`href="http://${r.site}`), `${r.name}: the site is not a link`);
    assert.ok(html.includes("What to do:") || !r.findings.some((f) => f.fix), r.name);
  }
  const list = await get("/reports");
  for (const heading of ["Projects: code we checked", "Casinos and earn apps we checked", "Wallet drains", "Tokens: what Pulse said, and what happened"]) assert.ok(list.html.includes(heading), heading);
});

test("only scanned projects are public: no other project's measurements", () => {
  const text = JSON.stringify(publishedReports());
  assert.ok(!/V1 Ready|how-we-check/i.test(text));
  assert.ok(publishedReports().every((r) => ["code", "scam", "token", "drain"].includes(r.kind)));
});

test("Reports is a tab in the top bar on every page, lit on a single report too", onSite, async () => {
  for (const p of ["/", "/toolbox", "/reports/luckquexa"]) {
    const { html } = await get(p);
    assert.match(html, /<a[^>]*href="\/reports"[^>]*>Reports/, p);
  }
  assert.match((await get("/reports/luckquexa")).html, /<a[^>]*href="\/reports"[^>]*aria-current="page"/);
});

test("four kinds of report, each with what makes it that kind", () => {
  const all = publishedReports();
  const of = (k: string) => all.filter((r) => r.kind === k);
  for (const r of of("token")) assert.ok(r.watched[0]?.kind === "token" && r.status, `${r.name}: the token itself, and what happened`);
  for (const r of of("drain")) assert.ok(r.watched.length && r.findings.some((f) => f.fix), `${r.name}: the address, and what to do`);
  const lost = of("token").filter((r) => r.status!.startsWith("Lost")).length, well = of("token").filter((r) => r.status!.startsWith("Did well")).length;
  assert.deepEqual([of("token").length, lost, well], [110, 72, 4], "the same 110 real tokens the research run counts");
  assert.ok(of("token").every((r) => r.findings[1].what.includes("not a prediction or a buy signal")));
});

test("drain reports never name or link the people who were drained", async () => {
  for (const r of publishedReports().filter((r) => r.kind === "drain")) {
    const text = JSON.stringify(r).toLowerCase();
    for (const who of ["kunal", "adilak", "@", "x.com", "twitter"]) assert.ok(!text.includes(who), `${r.name} mentions ${who}`);
    assert.ok(!text.includes("hkxcf2jz6jmi5ovmyxjfucqqwgzagfkv3q3jbltvsenp") && !text.includes("avlelvhjdes9jg54ev3pq8qgptyycweedugqb1gdpmaj"), `${r.name}: the drained wallets' full addresses stay out`);
    if (ON_SITE.reports) assert.equal((await get(`/reports/${r.name}`)).status, 200);
  }
  if (ON_SITE.reports) assert.equal((await get(`/reports/token-${publishedReports().find((r) => r.kind === "token")!.watched[0].address}`)).status, 200, "token pages keep the address's capital letters");
});

test("while reports are off the site: no Reports tab, the list and every report page are 404 and not indexed", { skip: ON_SITE.reports && "reports are on the site" }, async () => {
  for (const p of ["/", "/toolbox", "/track-record"]) assert.ok(!/href="\/reports"/.test((await get(p)).html), `${p} links to /reports`);
  for (const p of ["/reports", "/reports/crawlhive", "/reports/luckquexa", `/reports/${publishedReports().find((r) => r.kind === "drain")!.name}`]) {
    const page = await get(p);
    assert.equal(page.status, 404, p);
    assert.match(page.html, /noindex/, p);
  }
  assert.ok(publishedReports().length > 100, "the reports themselves are kept, only hidden");
});
