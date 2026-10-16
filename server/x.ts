// Posts to the Solana Pulse X account, at most one post per run. Cloud Scheduler calls POST /api/owner/x/run
// three times a week (scripts/x-setup.sh). Each run posts the first of these that applies:
//   1. a milestone: a new tool, a list pull request merged, the first payment from someone other than the owner
//   2. the weekly stats, once per calendar week, built from the usage log (owner's calls and directory bots left out)
//   3. the next approved post from the queue in x-queue.ts: the 15 tool videos first, each uploaded with its post
// Every post is recorded in x_posts by key, so nothing is posted twice. Keys come from Secret Manager.
import crypto from "node:crypto";
import { pool } from "./db";
import { ownerOverview } from "./owner";
import { TOOLS } from "./tools";
import { LIST_PRS, QUEUE } from "./x-queue";

const POST_URL = "https://api.x.com/2/tweets";
export const MAX_POST_CHARS = 280;

export type XKeys = { consumerKey: string; consumerSecret: string; token: string; tokenSecret: string };
export type XPost = { key: string; kind: "milestone" | "stats" | "queue" | "manual"; text: string; media?: string[] };

// The tool videos and the owner's uploaded pictures and videos (uploads/), read with the Cloud Run service account
// (granted by scripts/x-videos.sh).
export const VIDEO_BUCKET = "x300-506418-pulse-videos";
const MEDIA_URL = "https://api.x.com/2/media/upload";
const CHUNK_BYTES = 4 * 1024 * 1024; // X allows up to 5 MB per chunk

export function xKeys(): XKeys | null {
  const { X_CONSUMER_KEY, X_CONSUMER_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET } = process.env;
  if (!X_CONSUMER_KEY || !X_CONSUMER_SECRET || !X_ACCESS_TOKEN || !X_ACCESS_SECRET) return null;
  return { consumerKey: X_CONSUMER_KEY, consumerSecret: X_CONSUMER_SECRET, token: X_ACCESS_TOKEN, tokenSecret: X_ACCESS_SECRET };
}

// RFC 3986 percent-encoding, which OAuth 1.0a requires (encodeURIComponent leaves !'()* alone).
const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());

// The OAuth 1.0a Authorization header X needs to post as the account. extra holds query or form parameters,
// which are signed too; a JSON body is not. nonce and timestamp are parameters only so the tests can fix them.
export function oauthHeader(method: string, url: string, keys: XKeys, extra: Record<string, string> = {},
  nonce = crypto.randomBytes(16).toString("hex"), timestamp = String(Math.floor(Date.now() / 1000))): string {
  const oauth: Record<string, string> = {
    oauth_consumer_key: keys.consumerKey, oauth_nonce: nonce, oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: timestamp, oauth_token: keys.token, oauth_version: "1.0",
  };
  const params = { ...extra, ...oauth };
  const paramString = Object.keys(params).map((k) => [enc(k), enc(params[k])]).sort().map(([k, v]) => `${k}=${v}`).join("&");
  const base = `${method.toUpperCase()}&${enc(url)}&${enc(paramString)}`;
  const signature = crypto.createHmac("sha1", `${enc(keys.consumerSecret)}&${enc(keys.tokenSecret)}`).update(base).digest("base64");
  return "OAuth " + Object.entries({ ...oauth, oauth_signature: signature }).map(([k, v]) => `${enc(k)}="${enc(v)}"`).join(", ");
}

// One signed X API call. Query parameters are signed; JSON and multipart bodies are not (OAuth 1.0a).
async function xCall(fetcher: typeof fetch, keys: XKeys, method: string, url: string,
  o: { query?: Record<string, string>; json?: unknown; form?: FormData } = {}): Promise<any> {
  const full = o.query ? `${url}?${new URLSearchParams(o.query)}` : url;
  const headers: Record<string, string> = { authorization: oauthHeader(method, url, keys, o.query) };
  if (o.json !== undefined) headers["content-type"] = "application/json";
  const res = await fetcher(full, { method, headers, body: o.form ?? (o.json !== undefined ? JSON.stringify(o.json) : undefined) });
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`X answered ${res.status} to ${method} ${url}: ${JSON.stringify(body).slice(0, 300)}`);
  return body;
}

// The files X takes, by extension, with X's size limit for each kind.
export const MEDIA_TYPES: Record<string, { type: string; kind: "image" | "gif" | "video"; maxBytes: number }> = {
  jpg: { type: "image/jpeg", kind: "image", maxBytes: 5 * 1024 * 1024 },
  jpeg: { type: "image/jpeg", kind: "image", maxBytes: 5 * 1024 * 1024 },
  png: { type: "image/png", kind: "image", maxBytes: 5 * 1024 * 1024 },
  webp: { type: "image/webp", kind: "image", maxBytes: 5 * 1024 * 1024 },
  gif: { type: "image/gif", kind: "gif", maxBytes: 15 * 1024 * 1024 },
  mp4: { type: "video/mp4", kind: "video", maxBytes: 512 * 1024 * 1024 },
  mov: { type: "video/quicktime", kind: "video", maxBytes: 512 * 1024 * 1024 },
};
export const mediaInfo = (name: string) => MEDIA_TYPES[name.split(".").pop()?.toLowerCase() ?? ""];

// What X allows on one post: up to 4 pictures, or a single video or GIF. Null when the list is fine.
export function mediaProblem(names: string[]): string | null {
  const infos = names.map(mediaInfo);
  const bad = names.find((_, i) => !infos[i]);
  if (bad) return `${bad} is not a file X takes (${Object.keys(MEDIA_TYPES).join(", ")}).`;
  if (names.length > 4) return "X allows at most 4 pictures on one post.";
  if (names.length > 1 && infos.some((m) => m.kind !== "image")) return "A video or GIF has to be the only file on its post.";
  return null;
}

// Uploads a picture, GIF or video in chunks (initialize, append, finalize), waits for X to process it, and returns
// the media id.
export async function uploadMedia(bytes: Uint8Array, mediaType: string, keys: XKeys, fetcher: typeof fetch = fetch,
  wait = (ms: number) => new Promise((r) => setTimeout(r, ms))): Promise<string> {
  const category = mediaType === "image/gif" ? "tweet_gif" : mediaType.startsWith("video/") ? "tweet_video" : "tweet_image";
  const init = await xCall(fetcher, keys, "POST", `${MEDIA_URL}/initialize`,
    { json: { media_type: mediaType, total_bytes: bytes.length, media_category: category } });
  const id = String(init?.data?.id ?? "");
  if (!id) throw new Error(`X gave no media id: ${JSON.stringify(init).slice(0, 200)}`);
  for (let start = 0, segment = 0; start < bytes.length; start += CHUNK_BYTES, segment++) {
    const form = new FormData();
    form.append("segment_index", String(segment));
    form.append("media", new Blob([bytes.subarray(start, start + CHUNK_BYTES)], { type: mediaType }), "media");
    await xCall(fetcher, keys, "POST", `${MEDIA_URL}/${id}/append`, { form });
  }
  let info = (await xCall(fetcher, keys, "POST", `${MEDIA_URL}/${id}/finalize`))?.data?.processing_info;
  for (let tries = 0; info && info.state !== "succeeded"; tries++) {
    if (info.state === "failed" || tries >= 30) throw new Error(`X could not process the file: ${JSON.stringify(info).slice(0, 200)}`);
    await wait(Math.min(Number(info.check_after_secs) || 2, 10) * 1000);
    info = (await xCall(fetcher, keys, "GET", MEDIA_URL, { query: { command: "STATUS", media_id: id } }))?.data?.processing_info;
  }
  return id;
}

// A file from the bucket, read with the service account's token from the Cloud Run metadata server.
async function readMedia(name: string): Promise<Uint8Array> {
  const tokenRes = await fetch("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
    { headers: { "Metadata-Flavor": "Google" } });
  if (!tokenRes.ok) throw new Error(`No Google token for reading ${name} (${tokenRes.status}).`);
  const token = ((await tokenRes.json()) as any).access_token;
  const res = await fetch(`https://storage.googleapis.com/storage/v1/b/${VIDEO_BUCKET}/o/${encodeURIComponent(name)}?alt=media`,
    { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`${name} could not be read from ${VIDEO_BUCKET} (${res.status}).`);
  return new Uint8Array(await res.arrayBuffer());
}

export async function postToX(text: string, keys: XKeys, files: string[] = []): Promise<string> {
  const ids: string[] = [];
  for (const name of files) ids.push(await uploadMedia(await readMedia(name), mediaInfo(name)?.type ?? "video/mp4", keys));
  const media = ids.length ? { media_ids: ids } : undefined;
  const body = await xCall(fetch, keys, "POST", POST_URL, { json: media ? { text, media } : { text } });
  return String(body?.data?.id ?? "");
}

// True only when GitHub says the pull request was merged; any error counts as not merged yet.
async function prMerged(repo: string, number: number): Promise<boolean> {
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/pulls/${number}`, { headers: { "user-agent": "solana-pulse" } });
    return res.ok && Boolean(((await res.json()) as any).merged_at);
  } catch {
    return false;
  }
}

// "2026-W42": the ISO week, so the stats go out at most once per calendar week.
export function isoWeek(date = new Date()): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const week = Math.ceil(((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

// The weekly stats from the owner dashboard's 7-day view. The owner's own calls and directory bots are left out.
// Callers are counted by network, as everywhere else in Pulse. Null when nobody else called a tool.
export function statsText(overview: { callers: { id: string; kind: string; runs: number; tools: { tool: string; runs: number }[] }[] }): string | null {
  let runs = 0;
  const networks = new Set<string>();
  const byTool = new Map<string, number>();
  for (const c of overview.callers) {
    if (c.kind === "you" || c.kind === "bot" || !c.runs) continue;
    runs += c.runs;
    networks.add(c.id);
    for (const t of c.tools) byTool.set(t.tool, (byTool.get(t.tool) ?? 0) + t.runs);
  }
  if (!runs) return null;
  const [topTool, topRuns] = [...byTool].sort((a, b) => b[1] - a[1])[0];
  const n = (x: number) => x.toLocaleString("en-US");
  return `Solana Pulse, last 7 days: ${n(runs)} tool calls from ${n(networks.size)} caller networks, not counting my own tests or directory bots. ` +
    `Most used: ${topTool}, ${n(topRuns)} calls. Numbers come straight from the service's usage log.`;
}

export type XDeps = {
  overview: () => Promise<any>;
  prMerged: (repo: string, number: number) => Promise<boolean>;
  post: (text: string, keys: XKeys, media?: string[]) => Promise<string>;
  now: () => Date;
};
const defaultDeps: XDeps = { overview: () => ownerOverview({ days: 7 }), prMerged, post: postToX, now: () => new Date() };

async function nextPost(done: Set<string>, d: XDeps): Promise<XPost | null> {
  for (const t of TOOLS) {
    if (!done.has(`tool:${t.name}`)) {
      return { key: `tool:${t.name}`, kind: "milestone", text: `New in Solana Pulse: ${t.name}. ${t.title}.` };
    }
  }
  for (const pr of LIST_PRS) {
    const key = `list:${pr.repo}#${pr.number}`;
    if (!done.has(key) && (await d.prMerged(pr.repo, pr.number))) {
      return { key, kind: "milestone", text: `Solana Pulse is now listed in ${pr.list}. Thanks to the maintainers for reviewing it.` };
    }
  }
  let overview: any = null;
  const getOverview = async () => (overview ??= await d.overview());
  if (!done.has("milestone:first-outside-payment") && (await getOverview()).revenue?.otherPayers > 0) {
    const first = [...(await getOverview()).recentPayments].reverse().find((p: any) => !p.mine);
    const tool = first ? ` for a ${first.tool} call` : "";
    return { key: "milestone:first-outside-payment", kind: "milestone", text: `Solana Pulse just got its first payment from someone other than me: USDC over x402${tool}. Small, but real.` };
  }
  const weekKey = `stats:${isoWeek(d.now())}`;
  if (!done.has(weekKey)) {
    const text = statsText(await getOverview());
    if (text) return { key: weekKey, kind: "stats", text };
  }
  const next = QUEUE.find((q) => q.approved && !done.has(`queue:${q.key}`));
  return next ? { key: `queue:${next.key}`, kind: "queue", text: next.text, media: next.video ? [next.video] : undefined } : null;
}

export type XRunResult = { posted: boolean; dryRun?: boolean; reason?: string; postId?: string } & Partial<XPost>;

// One run. With dryRun it only says what it would post. The first run ever records the tools that already
// exist, so only tools added later are announced.
export async function runXPost(opts: { dryRun?: boolean; deps?: Partial<XDeps> } = {}): Promise<XRunResult> {
  const d = { ...defaultDeps, ...opts.deps };
  const rows = (await pool.query(`SELECT key FROM x_posts`)).rows as { key: string }[];
  const done = new Set(rows.map((r) => r.key));
  if (![...done].some((k) => k.startsWith("tool:"))) {
    for (const t of TOOLS) {
      await pool.query(`INSERT INTO x_posts (key, kind) VALUES ($1, 'seen') ON CONFLICT (key) DO NOTHING`, [`tool:${t.name}`]);
      done.add(`tool:${t.name}`);
    }
  }
  const pick = await nextPost(done, d);
  if (!pick) return { posted: false, reason: "Nothing to post: no new milestone, this week's stats are out, and no approved queue posts are left." };
  if (pick.text.length > MAX_POST_CHARS) return { posted: false, reason: `The post is ${pick.text.length} characters; X allows ${MAX_POST_CHARS}.`, ...pick };
  if (opts.dryRun) return { posted: false, dryRun: true, ...pick };
  const keys = xKeys();
  if (!keys) return { posted: false, reason: "The X keys are not set. Run scripts/x-setup.sh, then deploy.", ...pick };
  const postId = await d.post(pick.text, keys, pick.media);
  await pool.query(`INSERT INTO x_posts (key, kind, text, post_id) VALUES ($1, $2, $3, $4) ON CONFLICT (key) DO NOTHING`,
    [pick.key, pick.kind, pick.text, postId]);
  return { posted: true, postId, ...pick };
}
