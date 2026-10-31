// Turns every bug report we posted on GitHub into a public report page, with its current status from GitHub.
// Usage: tsx scripts/reports-from-issues.ts ~/contrib/issues
// Reads <n>-meta (repo, title, issue URL) and <n>-body.md, exactly as posted; writes server/reports/issues.generated.ts.
// Re-run it to refresh the status lines (open / fixed). Needs the `gh` CLI, logged in.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parseBody } from "../server/reports/parse-issue";
import type { Finding, Fact, Proof, Report } from "../server/reports/types";

const dir = process.argv[2];
if (!dir) throw new Error("Usage: tsx scripts/reports-from-issues.ts <issues folder>");
const OUT = "server/reports/issues.generated.ts";
const gh = (p: string) => JSON.parse(execFileSync("gh", ["api", p], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
const day = (iso: string) => iso.slice(0, 10);
const now = new Date().toISOString();

// Fixes GitHub doesn't link to the issue, checked by hand in the project's code. Each says where it was checked.
const CHECKED_FIXES: Record<string, { value: string; source: string; checkedAt: string }> = {
  "https://github.com/MikeyPetrillo/Agent402/issues/1775": {
    value: "Fixed: merged in pull request #1773 (commit 7557ce1); every getTransaction call now asks for version 1",
    source: "Their main branch, src/payment-verify.js:194",
    checkedAt: "2026-10-28T18:00:00Z",
  },
};

const severityOf = (text: string): Finding["severity"] =>
  /private key|mnemonic/i.test(text) ? "security" : /pay|deposit|settle|invoice|burn|budget|verif|payout/i.test(text) ? "breaks money" : "breaks accuracy";

const slugOf = (repo: string, taken: Set<string>) => {
  const short = repo.split("/")[1].toLowerCase();
  return taken.has(short) ? repo.toLowerCase().replace("/", "-") : short;
};

function statusOf(url: string): Fact {
  const [, repo, n] = url.match(/github\.com\/([^/]+\/[^/]+)\/issues\/(\d+)/)!;
  if (CHECKED_FIXES[url]) return { label: "Status", ...CHECKED_FIXES[url] };
  const issue = gh(`repos/${repo}/issues/${n}`);
  if (issue.state === "open") return { label: "Status", value: "Open: no fix merged yet", source: `GitHub issue ${repo}#${n}`, checkedAt: now };
  const merged = (gh(`repos/${repo}/issues/${n}/timeline?per_page=100`) as any[])
    .map((e) => e.source?.issue)
    .find((s) => s?.pull_request?.merged_at && s.html_url.startsWith(`https://github.com/${repo}/pull/`));
  if (merged) return { label: "Status", value: `Fixed: merged in pull request #${merged.number} on ${day(merged.pull_request.merged_at)}`, source: `GitHub: ${merged.html_url}`, checkedAt: now };
  return { label: "Status", value: `Closed (${issue.state_reason ?? "no reason given"}); fix not confirmed in their code`, source: `GitHub issue ${repo}#${n}`, checkedAt: now };
}

const byRepo = new Map<string, { url: string; title: string; body: string; posted: string }[]>();
for (const meta of fs.readdirSync(dir).filter((f) => /^\d+-meta$/.test(f)).sort((a, b) => parseInt(a) - parseInt(b))) {
  const n = parseInt(meta);
  const [repo, title] = fs.readFileSync(path.join(dir, meta), "utf8").split("\n");
  const posted = path.join(dir, `${n}-posted`);
  if (!fs.existsSync(posted) && !fs.existsSync(path.join(dir, `${n}-body.md`))) continue;
  // The local -posted file lags the cloud poster, so the issue is looked up on GitHub by its exact title.
  const url = fs.existsSync(posted) ? fs.readFileSync(posted, "utf8").trim() : "";
  let found: any;
  try {
    found = url ? gh(url.replace("https://github.com/", "repos/")) : gh(`search/issues?q=${encodeURIComponent(`repo:${repo} is:issue author:@me in:title "${title}"`)}`).items?.[0];
  } catch {
    console.error(`skip ${n} ${repo}: the issue or repo can't be read on GitHub (deleted or private)`);
    continue;
  }
  if (!found?.html_url) { console.error(`skip ${n} ${repo}: not posted yet`); continue; }
  const list = byRepo.get(repo) ?? [];
  list.push({ url: found.html_url, title: found.title, body: fs.readFileSync(path.join(dir, `${n}-body.md`), "utf8"), posted: found.created_at });
  byRepo.set(repo, list);
}

const taken = new Set<string>(["crawlhive"]);
const reports: Report[] = [];
for (const [repo, issues] of byRepo) {
  const name = slugOf(repo, taken);
  taken.add(name);
  const facts: Fact[] = [];
  const findings: Finding[] = [];
  const proof: Proof[] = [];
  let status = "";
  for (const i of issues) {
    const p = parseBody(i.body);
    findings.push({ title: i.title, severity: severityOf(i.title + " " + p.what), what: p.what, where: p.where, example: p.example, fix: p.fix });
    proof.push(...p.proof.map((x) => ({ ...x, checkedAt: i.posted })));
    const s = statusOf(i.url);
    facts.push({ label: "Reported to them", value: `${i.url.replace("https://github.com/", "")}, posted ${day(i.posted)}`, source: i.url, checkedAt: i.posted }, s);
    status = status ? `${status}; ${s.value}` : s.value;
  }
  const first = issues[0];
  reports.push({
    name,
    kind: "code",
    published: { at: day(first.posted), told: `GitHub issue ${first.url.replace("https://github.com/", "")} was posted` },
    project: repo.split("/")[1],
    repo: `https://github.com/${repo}`,
    commit: `their default branch on ${day(first.posted)}`,
    summary: issues.map((i) => i.title).join(". ") + ".",
    issue: first.url,
    status,
    findings,
    facts,
    proof,
    watched: [],
  });
  console.error(`${name}: ${status}`);
}

fs.writeFileSync(OUT, `// Generated by scripts/reports-from-issues.ts from the bug reports as posted on GitHub, on ${now}.
// Don't edit by hand: fix the source text or the script and re-run it.
import type { Report } from "./types";

export const ISSUE_REPORTS: Report[] = ${JSON.stringify(reports, null, 2)};
`);
console.error(`${reports.length} reports written to ${OUT}`);
