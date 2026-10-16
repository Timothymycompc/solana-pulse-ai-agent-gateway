// Tests the four X keys in Secret Manager without printing them: the shape of each, then one read-only
// GET /2/users/me, which answers with the account name and whether the token may post (x-access-level).
// Run with npm run x-check.
import { execFileSync } from "node:child_process";
import { oauthHeader } from "../server/x";

const keys = [
  ["X_CONSUMER_KEY", "API Key", /^[A-Za-z0-9]{25}$/],
  ["X_CONSUMER_SECRET", "API Key Secret", /^[A-Za-z0-9]{50}$/],
  ["X_ACCESS_TOKEN", "Access Token", /^[0-9]{5,25}-[A-Za-z0-9]{20,60}$/],
  ["X_ACCESS_SECRET", "Access Token Secret", /^[A-Za-z0-9]{45}$/],
] as const;

const v: Record<string, string> = {};
let shapesOk = true;
for (const [name, label, re] of keys) {
  v[name] = execFileSync("gcloud", ["secrets", "versions", "access", "latest", `--secret=${name}`], { encoding: "utf8" });
  const ok = re.test(v[name]);
  shapesOk &&= ok;
  console.log(`${ok ? "ok " : "BAD"} ${label} (${v[name].length} characters)`);
}
if (!shapesOk) { console.log("Fix the BAD key with npm run x-key-<1-4>."); process.exit(1); }

const url = "https://api.x.com/2/users/me";
const res = await fetch(url, { headers: { authorization: oauthHeader("GET", url, {
  consumerKey: v.X_CONSUMER_KEY, consumerSecret: v.X_CONSUMER_SECRET, token: v.X_ACCESS_TOKEN, tokenSecret: v.X_ACCESS_SECRET }) } });
const body: any = await res.json().catch(() => ({}));
const level = res.headers.get("x-access-level") ?? "not reported";
if (!res.ok) {
  console.log(`FAILED: X answered ${res.status}. If 401, the Access Token and Secret are not from the same Regenerate click,`);
  console.log("or the API Key and Secret were regenerated: redo the ones that changed with npm run x-key-<1-4>.");
  process.exit(1);
}
console.log(`X: logged in as @${body.data?.username}, access level ${level}`);
if (!level.startsWith("read-write")) {
  console.log("CANNOT POST: set the app to Read and write, then Regenerate the Access Token and Secret (x-key-3 and x-key-4).");
  process.exit(1);
}
console.log("READY: these keys can post.");
