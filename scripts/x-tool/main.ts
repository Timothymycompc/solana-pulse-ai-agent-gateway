// Pulse X: one menu for the @solanapulsebots poster. Opens with the command sheet, then lets you see what is
// scheduled, read and edit upcoming posts in nano, change the schedule, and post by hand. Run with npm run x.
import { execFile, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { MAX_POST_CHARS, QUEUE } from "../../server/x-queue";
import { mediaInfo } from "../../server/x";
import { describe, toCron } from "../x-schedule";
import { ask, c, choose, clear, cut, pause, refresh, yes } from "./menu";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const SVC_URL = "https://solana-pulse-gateway-1021990235790.us-central1.run.app";
const TZ = "America/Chicago";
const PHONE_FOLDERS = ["/sdcard/DCIM/Camera", "/sdcard/Pictures/Screenshots", "/sdcard/Download", "/sdcard/Movies"];
const run = promisify(execFile);
const gcloud = async (...args: string[]) => (await run("gcloud", args, { encoding: "utf8" })).stdout.trim();

// Runs one of the x-* scripts in this terminal; they print their own previews and ask before posting.
function script(name: string, ...args: string[]) {
  spawnSync(join(ROOT, "node_modules/.bin/tsx"), [join(ROOT, "scripts", name), ...args], { stdio: "inherit", cwd: ROOT });
}

let ownerKey: Promise<string> | null = null;
class NotDeployed extends Error {}
async function api(path: string, body?: unknown): Promise<any> {
  ownerKey ??= gcloud("secrets", "versions", "access", "latest", "--secret=OWNER_API_KEY");
  const res = await fetch(SVC_URL + path, { method: body === undefined ? "GET" : "POST",
    headers: { "x-api-key": await ownerKey, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  // The live site answers unknown paths with its web page (or a 404), so anything but JSON means not deployed yet.
  if (res.status === 404 || !res.headers.get("content-type")?.includes("json")) throw new NotDeployed("The live server doesn't have this yet. Deploy first: npm run deploy");
  return res.json();
}

// ---------- status, loaded in the background while the menu is open ----------
const status = { schedule: c.dim("loading…"), next: c.dim("loading…") };
let job: any = null;

async function loadSchedule() {
  try {
    job = JSON.parse(await gcloud("scheduler", "jobs", "describe", "pulse-x-post", "--location=us-central1", "--format=json"));
    const when = job.scheduleTime && new Date(job.scheduleTime).toLocaleString("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
    status.schedule = job.state === "PAUSED" ? `${describe(job.schedule)} (${job.timeZone}) ${c.yellow("PAUSED")}`
      : `${describe(job.schedule)} (${job.timeZone}) · next run ${c.bold(when ?? "unknown")}`;
  } catch {
    status.schedule = c.red("could not read the schedule (gcloud failed)");
  }
  refresh();
}

let nextPost: any = null;
async function loadNext() {
  try {
    nextPost = await api("/api/owner/x/run?dry=1");
    status.next = nextPost.dryRun ? `${c.cyan(nextPost.kind)} ${cut(nextPost.text.split("\n")[0], 60)}` : c.dim(nextPost.reason ?? "nothing to post");
  } catch (e: any) {
    status.next = e instanceof NotDeployed ? c.yellow("not deployed yet (npm run deploy)") : c.red("could not reach the server");
  }
  refresh();
}

// ---------- the opening sheet ----------
const COMMANDS: [string, string][] = [
  ["npm run x", "this menu"],
  ["npm run x-times", "show when it posts"],
  ["npm run x-times -- tue,thu,sat 11am", "change days and times (Central)"],
  ["npm run x-times -- weekdays 9am,5pm", "several times a day"],
  ["npm run x-times -- off   (or on)", "pause or resume posting"],
  ["npm run x-next", "post the bot's next item now"],
  ['npm run x-post -- "gm Solana"', "post your own text"],
  ['npm run x-post -- "text" a.jpg b.png', "…with up to 4 pictures"],
  ['npm run x-post -- "text" clip.mp4', "…or one video or GIF"],
  ["npm run x-post -- - pic.jpg", "type the text, end with a . line"],
  ["npm run x-check", "test the X keys"],
  ["npm run x-key-1 … x-key-4", "replace one X key"],
];
function header(): string {
  const line = c.dim("─".repeat(Math.min(process.stdout.columns || 80, 72)));
  return [
    `${c.bold(c.cyan(" Pulse X"))} ${c.dim("· @solanapulsebots · every post previews and asks first")}`, line,
    c.dim(" Commands (from ~/pulse-site, also work outside this menu)"),
    ...COMMANDS.map(([cmd, what]) => `  ${c.green(cmd.padEnd(38))} ${c.dim(what)}`), line,
    ` ${c.bold("Schedule")}  ${status.schedule}`,
    ` ${c.bold("Next post")} ${status.next}`, line, "",
  ].join("\n");
}

// ---------- screens ----------
async function scheduledScreen() {
  clear();
  console.log(c.bold("What's scheduled\n"));
  console.log(`Posts: ${status.schedule}\n`);
  console.log(c.dim("Each run posts one item: a milestone first if there is one, then the weekly stats once a week, then the queue.\n"));
  try {
    const next = await api("/api/owner/x/run?dry=1");
    console.log(c.bold("Next run will post") + (next.dryRun ? ` ${c.cyan(`(${next.kind})`)}:` : ":"));
    console.log(next.dryRun ? `${next.text}\n${next.media?.length ? c.dim("with " + next.media.join(", ")) : ""}` : c.dim(next.reason));
    const { recent } = await api("/api/owner/x/queue");
    console.log(c.bold("\nLast posts"));
    if (!recent.length) console.log(c.dim("  none yet"));
    for (const p of recent) console.log(`  ${c.dim(new Date(p.created_at).toLocaleDateString("en-US", { timeZone: TZ, month: "short", day: "numeric" }))} ${cut(p.text?.split("\n")[0] ?? p.key, 60)}  ${c.dim("x.com/solanapulsebots/status/" + p.post_id)}`);
  } catch (e: any) {
    console.log(c.yellow(e.message));
  }
  await pause();
}

// Opens text in nano and returns what was saved, or null when the file was left as it was.
function nano(text: string, name: string): string | null {
  const dir = mkdtempSync(join(tmpdir(), "pulse-x-"));
  const file = join(dir, name);
  writeFileSync(file, text + "\n");
  spawnSync("nano", ["--softwrap", file], { stdio: "inherit" });
  const out = readFileSync(file, "utf8").trim();
  rmSync(dir, { recursive: true, force: true });
  return out === text.trim() ? null : out;
}

async function upcomingScreen() {
  let at = 0;
  for (;;) {
    let list: any[];
    let live = true;
    try {
      list = (await api("/api/owner/x/queue")).upcoming;
    } catch (e: any) {
      if (!(e instanceof NotDeployed)) { console.log(c.red(e.message)); await pause(); return; }
      live = false;
      list = QUEUE.map((q) => ({ key: q.key, approved: q.approved, text: q.text, original: q.text, edited: false, media: q.video ? [q.video] : [] }));
    }
    const items = list.map((p) => `${p.edited ? c.yellow("✎ ") : ""}${p.approved ? "" : c.dim("[draft] ")}${p.media.length ? "🎬 " : ""}${cut(p.text.split("\n")[0], 52)}`);
    const pick = await choose(items, () => c.bold("Upcoming queue posts") + c.dim(` (${list.filter((p) => p.approved).length} approved, in posting order; ✎ = edited, drafts never go out)\n`) +
      (live ? "" : c.yellow("Showing the posts in the code. Deploy to see what has gone out and to save edits.\n")), at);
    if (pick < 0) return;
    at = pick;
    await postScreen(list[pick], live);
  }
}

async function postScreen(p: any, live: boolean) {
  for (;;) {
    const view = () => `${c.bold(p.key)} ${p.approved ? c.green("approved") : c.dim("draft")}${p.edited ? c.yellow(" · edited") : ""}\n\n${p.text}\n` +
      c.dim(`\n${p.text.length}/${MAX_POST_CHARS} characters${p.media.length ? " · with " + p.media.join(", ") : ""}\n`);
    const actions = ["Edit in nano", ...(p.edited ? ["Reset to the original"] : []), "Back"];
    const a = actions[await choose(actions, view)] ?? "Back";
    if (a === "Back") return;
    if (!live) { console.log(c.yellow("\nDeploy first (npm run deploy) so edits can be saved.")); await pause(); continue; }
    let text: string | null = "";
    if (a === "Edit in nano") {
      for (let draft = p.text; ; draft = text) {
        text = nano(draft, `${p.key.replace(/[^\w-]/g, "_")}.txt`);
        if (text === null || text.length <= MAX_POST_CHARS) break;
        console.log(c.red(`\nThat is ${text.length} characters; X allows ${MAX_POST_CHARS}.`));
        if (!(await yes("Open it in nano again to shorten it? (y/N) "))) { text = null; break; }
      }
      if (text === null) { console.log("Nothing saved."); await pause(); continue; }
      if (!(await yes(`\nSave this (${text.length}/${MAX_POST_CHARS} characters)? (y/N) `))) continue;
    }
    const r = await api("/api/owner/x/queue/edit", { key: p.key, text });
    if (!r.saved) { console.log(c.red(r.reason)); await pause(); continue; }
    p = { ...p, text: text || p.original, edited: Boolean(text) && text !== p.original };
    console.log(c.green(text ? "Saved. The bot will post your version." : "Back to the original."));
    await pause();
  }
}

async function scheduleScreen() {
  clear();
  console.log(c.bold("Change the schedule\n"));
  console.log(`Now: ${status.schedule}\n`);
  console.log(c.dim("Days: mon,tue,wed,thu,fri,sat,sun, daily, weekdays or weekends.  Times: 11am, 5:30pm or 17:00 (Central).\nType off to pause or on to resume. Leave empty to go back.\n"));
  const days = await ask("Days: ");
  if (!days) return;
  if (days === "off" || days === "on") script("x-times.ts", days);
  else {
    const times = await ask("Times: ");
    try {
      toCron(days, times);
      script("x-times.ts", days, times);
    } catch (e: any) {
      console.log(c.red(e.message));
    }
  }
  await loadSchedule();
  await pause();
}

// The newest pictures and videos on the phone, to attach by number.
function recentMedia(): string[] {
  const files: { path: string; time: number }[] = [];
  for (const dir of PHONE_FOLDERS) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (!mediaInfo(name)) continue;
      try { files.push({ path: join(dir, name), time: statSync(join(dir, name)).mtimeMs }); } catch {}
    }
  }
  return files.sort((a, b) => b.time - a.time).slice(0, 12).map((f) => f.path);
}

async function manualScreen() {
  clear();
  console.log(c.bold("Make a manual post\n"));
  console.log(c.dim(`Write the post in nano, then save (Ctrl-O, Enter) and exit (Ctrl-X). Up to ${MAX_POST_CHARS} characters.`));
  await ask(c.dim("Press Enter to open nano. "));
  const text = nano("", "post.txt") ?? "";
  clear();
  console.log(text ? `${text}\n${c.dim(`\n${text.length}/${MAX_POST_CHARS} characters`)}\n` : c.dim("(no text)\n"));
  const media = recentMedia();
  if (media.length) {
    console.log(c.bold("Newest pictures and videos on the phone:"));
    media.forEach((m, i) => console.log(`  ${c.dim(String(i + 1).padStart(2))}  ${m}`));
  }
  const pick = await ask("\nAttach files: numbers like 1 3, a full path, or Enter for none: ");
  const files = pick.split(/\s+/).filter(Boolean).map((t) => (/^\d+$/.test(t) ? media[Number(t) - 1] ?? t : t));
  if (!text && !files.length) { console.log("Nothing to post."); await pause(); return; }
  script("x-post.ts", text, ...files);
  await pause();
}

// ---------- main menu ----------
const MENU: [string, () => Promise<void>][] = [
  ["What's scheduled", scheduledScreen],
  ["Upcoming posts (read, edit in nano)", upcomingScreen],
  ["Change the schedule", scheduleScreen],
  ["Make a manual post", manualScreen],
  ["Post the next item now", async () => { script("x-post.ts", "--next"); await pause(); }],
  ["Check the X keys", async () => { script("x-check.ts"); await pause(); }],
  ["Quit", async () => {}],
];

if (!process.stdin.isTTY) { console.log("Run this in a terminal: npm run x"); process.exit(1); }
void loadSchedule();
void loadNext();
let at = 0;
for (;;) {
  const pick = await choose(MENU.map(([label]) => label), header, at);
  if (pick < 0 || pick === MENU.length - 1) break;
  at = pick;
  await MENU[pick][1]();
  if (pick >= 3) void loadNext();
}
clear();
process.exit(0);
