// The website's pages arrive with their text in the HTML, so readers that don't run JavaScript see them.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import { pageHandler } from "../server/pages";
import { TOOLS, toolDoc } from "../server/tools";

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
const text = (html: string) => html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

test("the Connect page carries its instructions, MCP address, title and description in the HTML", async () => {
  const { status, html } = await get("/docs/connect");
  assert.equal(status, 200);
  const words = text(html);
  assert.match(words, /Connect an agent/);
  assert.match(words, /claude mcp add --transport http solana-pulse https:\/\/solana-pulse-gateway-1021990235790\.us-central1\.run\.app\/mcp/);
  assert.match(html, /<title>Connect an agent · Solana Pulse<\/title>/);
  assert.match(html, /<meta name="description" content="Connect Claude, ChatGPT, Cursor/);
  assert.match(html, /<link rel="canonical" href="https:\/\/solana-pulse-gateway-1021990235790\.us-central1\.run\.app\/docs\/connect" \/>/);
});

test("every tool page, the overview, quickstart, pricing and toolbox render real text", async () => {
  for (const t of TOOLS) {
    const { status, html } = await get(`/docs/tools/${t.name}`);
    assert.equal(status, 200, t.name);
    assert.ok(text(html).includes(t.title), `${t.name} page shows its title`);
    assert.ok(html.includes(`<title>${t.name}: ${t.title.replace(/&/g, "&amp;")} · Solana Pulse</title>`), `${t.name} title`);
    assert.ok(!/\?\./.test(html.match(/<meta name="description" content="([^"]*)/)![1]), `${t.name} description punctuation`);
  }
  assert.match(text((await get("/")).html), /check_tx/);
  assert.match(text((await get("/docs/quickstart")).html), /Make your first call/);
  assert.match(text((await get("/docs/pricing")).html), /x402/);
  assert.equal((await get("/toolbox")).status, 200);
});

test("the tool list rides along so the browser starts with it, and cannot break out of its script tag", async () => {
  const { html } = await get("/");
  const json = html.match(/window\.__PULSE_TOOLS__=(.*?)<\/script>/)![1];
  assert.equal(JSON.parse(json).tools.length, TOOLS.length);
  assert.ok(!json.includes("<"));
});

test("missing files and unknown pages are 404s, and the owner page is not indexed", async () => {
  assert.equal((await get("/sitemap.txt")).status, 404);
  assert.equal((await get("/openapi.json")).status, 404);
  const unknown = await get("/docs/nope");
  assert.equal(unknown.status, 404);
  assert.match(unknown.html, /noindex/);
  assert.equal((await get("/docs/tools/not_a_tool")).status, 404);
  const owner = await get("/owner");
  assert.equal(owner.status, 200);
  assert.match(owner.html, /noindex/);
});

test("the track record page explains each measurement in the HTML; the numbers load in the browser", async () => {
  const { status, html } = await get("/track-record");
  assert.equal(status, 200);
  const words = text(html);
  assert.match(html, /<title>Track record · Solana Pulse<\/title>/);
  for (const heading of ["New tokens, a week later", "Well-known tokens (false alarms)", "Token watch"]) assert.ok(words.includes(heading), heading);
  assert.match(words, /Pulse never gives buy signals/);
});
