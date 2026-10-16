// Posts to @solanapulsebots by hand. Always shows a preview and asks before anything goes out.
//   npm run x-next                                 post the bot's next item now (milestone, stats or queue)
//   npm run x-post -- "text"                       your own post
//   npm run x-post -- "text" pic1.jpg pic2.png     with up to 4 pictures (jpg, png, webp)
//   npm run x-post -- "text" clip.mp4              or one video (mp4, mov) or one GIF
//   npm run x-post -- - pic.jpg                    type the text instead, for line breaks (finish with a line holding just .)
// Files are copied to the private bucket's uploads/ folder; the live server reads them there and posts.
// Needs the current code deployed (npm run deploy).
import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { basename } from "node:path";
import { createInterface } from "node:readline/promises";
import { MAX_POST_CHARS, mediaInfo, mediaProblem, VIDEO_BUCKET } from "../server/x";

const SVC_URL = "https://solana-pulse-gateway-1021990235790.us-central1.run.app";
const ACCOUNT = "solanapulsebots";
const gcloud = (...args: string[]) => execFileSync("gcloud", args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();

const rl = createInterface({ input: process.stdin, output: process.stdout });
const stop = (msg: string): never => { console.log(msg); rl.close(); process.exit(1); };
const ask = async (question: string) => /^y(es)?$/i.test((await rl.question(question)).trim());

async function typeText(): Promise<string> {
  console.log("Type the post. Finish with a line holding just a dot (.)");
  const lines: string[] = [];
  for (let line = await rl.question(""); line.trim() !== "."; line = await rl.question("")) lines.push(line);
  return lines.join("\n");
}

function show(r: any) {
  if (r.text) console.log(`\n----- ${r.kind ?? "post"} (${r.text.length}/${MAX_POST_CHARS} characters) -----\n${r.text}\n-----`);
  if (r.media?.length) console.log(`Files: ${r.media.join(", ")}`);
}

async function call(path: string, ownerKey: string, body?: unknown): Promise<any> {
  const res = await fetch(`${SVC_URL}${path}`, { method: "POST", headers: { "x-api-key": ownerKey, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body) });
  if (res.status === 404) stop("The live server has no such command yet. Deploy first: npm run deploy");
  return res.json().catch(() => ({ error: `HTTP ${res.status}` }));
}

const args = process.argv.slice(2);
const next = args[0] === "--next";
let text = "";
let files: string[] = [];
if (!next) {
  if (!args.length) stop('Usage: npm run x-post -- "text" [pictures or one video]   (or - to type the text)');
  [text, ...files] = args;
  if (text === "-") text = await typeText();
  text = text.trim();
  if (text.length > MAX_POST_CHARS) stop(`The text is ${text.length} characters; X allows ${MAX_POST_CHARS}.`);
  for (const f of files) {
    if (!existsSync(f)) stop(`No such file: ${f}`);
    const info = mediaInfo(f);
    if (info && statSync(f).size > info.maxBytes) stop(`${f} is ${(statSync(f).size / 1048576).toFixed(1)} MB; X allows ${info.maxBytes / 1048576} MB for a ${info.kind}.`);
  }
  const problem = mediaProblem(files);
  if (problem) stop(problem);
  if (/https?:\/\/|www\./i.test(text)) console.log("Note: X charges about $0.20 for a post with a link, against $0.015 without.");
}

console.log("Getting the owner key from Secret Manager...");
const ownerKey = gcloud("secrets", "versions", "access", "latest", "--secret=OWNER_API_KEY");
let r: any;
if (next) {
  r = await call("/api/owner/x/run?dry=1", ownerKey);
} else {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  const media = files.map((f) => `uploads/${stamp}-${basename(f).replace(/[^A-Za-z0-9._-]/g, "_")}`);
  r = await call("/api/owner/x/post?dry=1", ownerKey, { text, media }); // checks the post before uploading anything
  if (r.dryRun) {
    for (const [i, f] of files.entries()) {
      console.log(`Uploading ${f}...`);
      gcloud("storage", "cp", "--quiet", f, `gs://${VIDEO_BUCKET}/${media[i]}`);
    }
  }
  r.media = r.media && files.map((f) => basename(f));
  r.upload = media;
}
show(r);
if (!r.dryRun) stop(r.reason ?? r.error ?? "Nothing to post.");
if (!(await ask("Post this to @" + ACCOUNT + " now? (y/N) "))) stop("Not posted.");
console.log(r.media?.length ? "Posting (X can take a minute or two to process a video)..." : "Posting...");
const done = next ? await call("/api/owner/x/run", ownerKey) : await call("/api/owner/x/post", ownerKey, { text, media: r.upload });
if (!done.posted) stop(`NOT POSTED: ${done.reason ?? done.error ?? JSON.stringify(done).slice(0, 300)}`);
if (next && done.key !== r.key) console.log(`Note: the bot posted ${done.key} instead of the preview (something new came up).`);
console.log(`POSTED: https://x.com/${ACCOUNT}/status/${done.postId}`);
rl.close();
