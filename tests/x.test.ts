// The X poster: OAuth signing against X's published example, and what each run picks to post
// (against a real Postgres, PGlite in memory, with GitHub, the dashboard and X itself stubbed).
import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { pool, ensureSchema } from "../server/db";
import { isoWeek, MAX_POST_CHARS, mediaProblem, oauthHeader, runXPost, statsText, uploadMedia, type XDeps } from "../server/x";
import { postManual } from "../server/x-manual";
import { saveQueueEdit, upcomingQueue } from "../server/x-edits";
import { QUEUE } from "../server/x-queue";
import { TOOLS } from "../server/tools";

const db = new PGlite();
before(async () => {
  (pool as any).query = async (sql: string, params?: unknown[]) => {
    const r = await db.query(sql, params as any[]);
    return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
  };
  await ensureSchema();
  // Stand-in keys; posting itself is stubbed in every test.
  for (const k of ["X_CONSUMER_KEY", "X_CONSUMER_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_SECRET"]) process.env[k] = "test";
});
beforeEach(async () => { await db.query(`DELETE FROM x_posts`); });

test("OAuth signature matches X's documented example", () => {
  // From X's "Creating a signature" guide (the v1.1 statuses/update example).
  const header = oauthHeader("POST", "https://api.twitter.com/1.1/statuses/update.json", {
    consumerKey: "xvz1evFS4wEEPTGEFPHBog", consumerSecret: "kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw",
    token: "370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb", tokenSecret: "LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE",
  }, { include_entities: "true", status: "Hello Ladies + Gentlemen, a signed OAuth request!" },
  "kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg", "1318622958");
  assert.match(header, /oauth_signature="hCtSmYh%2BiHYCEqBWrE7C7hYmtUk%3D"/);
});

const caller = (id: string, kind: string, tools: Record<string, number>) =>
  ({ id, kind, runs: Object.values(tools).reduce((a, b) => a + b, 0), tools: Object.entries(tools).map(([tool, runs]) => ({ tool, runs })) });
const overview = {
  revenue: { otherPayers: 0 }, recentPayments: [],
  callers: [
    caller("net:a|algebra-executor", "other", { token_safety: 800, convert: 5 }),
    caller("net:b|node", "script", { check_tx: 40 }),
    caller("bot:Glama", "bot", { token_safety: 900 }),
    caller("net:me|curl", "you", { token_safety: 300 }),
  ],
};
const deps = (over: Partial<XDeps> = {}): Partial<XDeps> => ({
  overview: async () => overview, prMerged: async () => false, post: async () => "123", now: () => new Date("2026-10-15T12:00:00Z"), ...over,
});

test("weekly stats leave out the owner and directory bots", () => {
  const text = statsText(overview)!;
  assert.match(text, /845 tool calls from 2 caller networks/);
  assert.match(text, /Most used: token_safety, 800 calls/);
  assert.ok(text.length <= MAX_POST_CHARS);
  assert.equal(statsText({ callers: [overview.callers[2], overview.callers[3]] }), null);
});

test("every queue post fits in one X post and has a unique key", () => {
  for (const q of QUEUE) assert.ok(q.text.length <= MAX_POST_CHARS, `${q.key} is ${q.text.length} characters`);
  assert.equal(new Set(QUEUE.map((q) => q.key)).size, QUEUE.length);
});

test("the first run records existing tools without announcing them, then posts the weekly stats", async () => {
  const r = await runXPost({ deps: deps() });
  assert.equal(r.kind, "stats");
  assert.equal(r.key, `stats:${isoWeek(new Date("2026-10-15T12:00:00Z"))}`);
  const seen = await db.query(`SELECT COUNT(*)::int AS n FROM x_posts WHERE kind = 'seen'`);
  assert.equal((seen.rows[0] as any).n, TOOLS.length);
});

test("stats go out once a week; unapproved queue posts never go out", async () => {
  const posted: string[] = [];
  const d = deps({ post: async (t) => { posted.push(t); return String(posted.length); } });
  await runXPost({ deps: d });
  const second = await runXPost({ deps: d });
  const approved = QUEUE.filter((q) => q.approved);
  if (approved.length) assert.equal(second.key, `queue:${approved[0].key}`);
  else assert.equal(second.posted, false);
  assert.equal(posted.filter((t) => t.startsWith("Solana Pulse, last 7 days")).length, 1);
});

test("a merged list pull request is announced once, before the stats", async () => {
  const d = deps({ prMerged: async (repo) => repo === "solana-foundation/awesome-solana-ai" });
  const first = await runXPost({ deps: d });
  assert.equal(first.kind, "milestone");
  assert.match(first.text!, /Awesome Solana AI/);
  const second = await runXPost({ deps: d });
  assert.equal(second.kind, "stats");
});

test("the first payment from someone else is a milestone; the owner's own payments are not", async () => {
  const d = deps({ overview: async () => ({ ...overview, revenue: { otherPayers: 1 }, recentPayments: [{ tool: "check_tx", mine: false }, { tool: "fee", mine: true }] }) });
  const r = await runXPost({ deps: d });
  assert.equal(r.key, "milestone:first-outside-payment");
  assert.match(r.text!, /for a check_tx call/);
});

test("every tool has exactly one video post, and every video post names a real tool", () => {
  const videos = QUEUE.filter((q) => q.video);
  assert.deepEqual(videos.map((q) => q.video).sort(), TOOLS.map((t) => `${t.name}.mp4`).sort());
  for (const q of videos) assert.ok(q.text.startsWith(`${q.video!.replace(".mp4", "")}: `), q.key);
});

test("queue posts carry their video to the poster", async () => {
  let sent: string | undefined;
  const d = deps({ post: async (_t, _k, media) => { sent = media?.join(); return "1"; } });
  await runXPost({ deps: d }); // the weekly stats
  const r = await runXPost({ deps: d });
  assert.equal(r.key, "queue:video:check_tx");
  assert.equal(sent, "check_tx.mp4");
});

test("a video upload goes initialize, append in chunks, finalize, then waits on status", async () => {
  const calls: { method: string; url: string; auth: string; body: any }[] = [];
  const replies = [{ data: { id: "m1" } }, {}, {}, { data: { processing_info: { state: "pending", check_after_secs: 1 } } },
    { data: { processing_info: { state: "succeeded" } } }];
  const fakeFetch = (async (url: string, init: any) => {
    calls.push({ method: init.method, url, auth: init.headers.authorization, body: init.body });
    return new Response(JSON.stringify(replies[calls.length - 1]), { status: 200 });
  }) as unknown as typeof fetch;
  const keys = { consumerKey: "a", consumerSecret: "b", token: "c", tokenSecret: "d" };
  const id = await uploadMedia(new Uint8Array(5 * 1024 * 1024), "video/mp4", keys, fakeFetch, async () => {});
  assert.equal(id, "m1");
  assert.deepEqual(calls.map((c) => `${c.method} ${c.url.replace("https://api.x.com/2/media/upload", "")}`),
    ["POST /initialize", "POST /m1/append", "POST /m1/append", "POST /m1/finalize", "GET ?command=STATUS&media_id=m1"]);
  assert.deepEqual(JSON.parse(calls[0].body), { media_type: "video/mp4", total_bytes: 5 * 1024 * 1024, media_category: "tweet_video" });
  assert.equal((calls[2].body as FormData).get("segment_index"), "1");
  assert.ok(calls.every((c) => c.auth.startsWith("OAuth ") && c.auth.includes("oauth_signature=")));
});

test("a dry run posts nothing and records nothing", async () => {
  let called = false;
  const r = await runXPost({ dryRun: true, deps: deps({ post: async () => { called = true; return "1"; } }) });
  assert.equal(r.dryRun, true);
  assert.equal(called, false);
  const rows = await db.query(`SELECT COUNT(*)::int AS n FROM x_posts WHERE kind <> 'seen'`);
  assert.equal((rows.rows[0] as any).n, 0);
});

test("without X keys it says so instead of posting", async () => {
  for (const k of ["X_CONSUMER_KEY", "X_CONSUMER_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_SECRET"]) delete process.env[k];
  const r = await runXPost({ deps: { ...deps(), post: undefined as any } });
  assert.equal(r.posted, false);
  assert.match(r.reason!, /X keys are not set/);
});

test("media rules: up to 4 pictures, or one video or GIF alone, and only files X takes", () => {
  assert.equal(mediaProblem(["a.jpg", "b.PNG", "c.webp", "d.jpeg"]), null);
  assert.equal(mediaProblem(["clip.mp4"]), null);
  assert.match(mediaProblem(["1.jpg", "2.jpg", "3.jpg", "4.jpg", "5.jpg"])!, /at most 4/);
  assert.match(mediaProblem(["clip.mp4", "a.jpg"])!, /only file/);
  assert.match(mediaProblem(["a.gif", "b.gif"])!, /only file/);
  assert.match(mediaProblem(["notes.pdf"])!, /not a file X takes/);
});

test("a picture uploads as tweet_image and a GIF as tweet_gif", async () => {
  const bodies: any[] = [];
  const fakeFetch = (async (_url: string, init: any) => {
    bodies.push(init.body);
    return new Response(JSON.stringify(bodies.length === 1 ? { data: { id: "p1" } } : {}), { status: 200 });
  }) as unknown as typeof fetch;
  const keys = { consumerKey: "a", consumerSecret: "b", token: "c", tokenSecret: "d" };
  await uploadMedia(new Uint8Array(10), "image/png", keys, fakeFetch, async () => {});
  assert.equal(JSON.parse(bodies[0]).media_category, "tweet_image");
  bodies.length = 0;
  await uploadMedia(new Uint8Array(10), "image/gif", keys, fakeFetch, async () => {});
  assert.equal(JSON.parse(bodies[0]).media_category, "tweet_gif");
});

test("a manual post is checked, previewed without posting, then posted with its files and recorded", async () => {
  for (const k of ["X_CONSUMER_KEY", "X_CONSUMER_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_SECRET"]) process.env[k] = "test";
  const sent: { text: string; media?: string[] }[] = [];
  const post = async (text: string, _k: unknown, media?: string[]) => { sent.push({ text, media }); return "777"; };
  const now = () => new Date("2026-10-16T10:00:00Z");
  assert.match((await postManual({ text: "x".repeat(MAX_POST_CHARS + 1), post })).reason!, /X allows/);
  assert.match((await postManual({ text: "hi", media: ["uploads/a.mp4", "uploads/b.jpg"], post })).reason!, /only file/);
  assert.match((await postManual({ text: "  ", post })).reason!, /no text and no files/);
  const dry = await postManual({ text: "hello", media: ["uploads/a.jpg"], dryRun: true, post, now });
  assert.equal(dry.dryRun, true);
  assert.equal(sent.length, 0);
  const r = await postManual({ text: "hello", media: ["uploads/a.jpg", "uploads/b.png"], post, now });
  assert.equal(r.posted, true);
  assert.deepEqual(sent, [{ text: "hello", media: ["uploads/a.jpg", "uploads/b.png"] }]);
  const row = (await db.query(`SELECT kind, text, post_id FROM x_posts WHERE key = 'manual:2026-10-16T10:00:00.000Z'`)).rows[0] as any;
  assert.deepEqual(row, { kind: "manual", text: "hello", post_id: "777" });
});

test("an edit to an upcoming queue post is saved, used when it goes out, and can be reset", async () => {
  await db.query(`DELETE FROM x_posts WHERE key LIKE 'queue:%'`);
  const first = (await upcomingQueue())[0];
  assert.equal(first.edited, false);
  assert.match((await saveQueueEdit(first.key, "x".repeat(MAX_POST_CHARS + 1))).reason!, /X allows/);
  assert.match((await saveQueueEdit("no-such-post", "hi")).reason!, /No queue post/);
  assert.equal((await saveQueueEdit(first.key, "  my own words  ")).saved, true);
  const after = (await upcomingQueue())[0];
  assert.equal(after.text, "my own words");
  assert.equal(after.edited, true);
  assert.equal(after.original, first.original);
  const sent: string[] = [];
  const d = deps({ overview: async () => ({ callers: [] }), post: async (t) => { sent.push(t); return "9"; } });
  let r;
  do { r = await runXPost({ deps: d }); } while (r.posted && r.key !== `queue:${first.key}`);
  assert.equal(r.text, "my own words");
  assert.match((await saveQueueEdit(first.key, "too late")).reason!, /already gone out/);
  const second = (await upcomingQueue())[0];
  await saveQueueEdit(second.key, "temp");
  await saveQueueEdit(second.key, "");
  assert.equal((await upcomingQueue())[0].text, second.original);
});
