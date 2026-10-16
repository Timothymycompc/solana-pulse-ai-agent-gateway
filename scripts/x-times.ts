// Shows or changes when the X poster runs (Cloud Scheduler job pulse-x-post). Each run posts at most one item.
//   npm run x-times                          show the schedule and the next run
//   npm run x-times -- tue,thu,sat 11am      change it (times are Central, America/Chicago)
//   npm run x-times -- weekdays 9am,5pm      several times a day (same minutes for all)
//   npm run x-times -- off | on              pause or resume posting
import { execFileSync } from "node:child_process";
import { describe, toCron } from "./x-schedule";

const JOB = "pulse-x-post";
const REGION = "us-central1";
const TZ = "America/Chicago"; // the owner's time zone; Cloud Scheduler moves with daylight saving time
const gcloud = (...args: string[]) => execFileSync("gcloud", args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();

function show() {
  const job = JSON.parse(gcloud("scheduler", "jobs", "describe", JOB, `--location=${REGION}`, "--format=json"));
  const paused = job.state === "PAUSED";
  console.log(`Posts: ${describe(job.schedule)} (${job.timeZone ?? "UTC"})${paused ? "  — PAUSED (npm run x-times -- on)" : ""}`);
  if (!paused && job.scheduleTime) {
    console.log(`Next run: ${new Date(job.scheduleTime).toLocaleString("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" })}`);
  }
}

const [a, b] = process.argv.slice(2);
try {
  if (a === "off" || a === "on") {
    gcloud("scheduler", "jobs", a === "off" ? "pause" : "resume", JOB, `--location=${REGION}`);
    console.log(a === "off" ? "Paused." : "Resumed.");
  } else if (a) {
    if (!b) throw new Error('Give days and times, like: npm run x-times -- tue,thu,sat 11am');
    const cron = toCron(a, b);
    gcloud("scheduler", "jobs", "update", "http", JOB, `--location=${REGION}`, `--schedule=${cron}`, `--time-zone=${TZ}`);
    console.log("Changed.");
  }
  show();
} catch (e: any) {
  console.log(e.message?.startsWith("Command failed") ? "gcloud failed (message above)." : e.message);
  process.exit(1);
}
