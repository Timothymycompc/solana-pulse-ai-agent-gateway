// Reads one bug report as posted on GitHub: what we found, the reproduction, the fix, the file:line references and any
// real transaction it names. Used by scripts/reports-from-issues.ts.
import type { Proof } from "./types";

const upper = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Splits a posted body into what we found, the reproduction, the fix and the file:line references.
// Stops at the signature: the sign-off and P.S. are about Pulse, not about their code.
export function parseBody(body: string) {
  const main = body.split(/\n\s*Timothy\s*\n/)[0].replace(/\s*Happy to open a PR[^.]*\./g, "");
  const blocks = main.split(/(```[\s\S]*?```)/).flatMap((part) => (part.startsWith("```") ? [part] : part.split(/\n{2,}/))).map((b) => b.trim()).filter(Boolean);
  const what: string[] = [];
  let example: string | undefined;
  let fix: string | undefined;
  for (const b of blocks) {
    const code = b.match(/^```\w*\n([\s\S]*?)\n?```$/);
    if (code) example ??= code[1].trim();
    else if (/^\**(Fix|Suggestion)\b:?\**:?|^Changing /.test(b)) fix = upper(b.replace(/^\**(Fix|Suggestion)\b:?\**:?\s*/, "").trim());
    else if (!/^Reproduced on .*:$/.test(b)) what.push(b);
  }
  const where: string[] = [];
  for (const m of main.matchAll(/`?((?:[\w.-]+\/)+[\w.-]+\.(?:ts|tsx|js|mjs|cjs|py|rs|go))`?(?:\s*\(lines?\s+([^)]*)\)|:(\d+))?/g)) {
    const lines = m[3] ? [m[3]] : (m[2]?.match(/\d+/g) ?? []);
    if (m.index && main[m.index - 1] === "@") continue; // a package name such as @solana/web3.js, not a file
    if (!lines.length) where.push(m[1]);
    for (const n of lines) where.push(`${m[1]}:${n}`);
  }
  const located = new Set(where.filter((w) => /:\d+$/.test(w)).map((w) => w.replace(/:\d+$/, "")));
  const proof: Proof[] = [];
  for (const m of main.matchAll(/`([1-9A-HJ-NP-Za-km-z]{86,88})` \(slot (\d+)\)/g)) {
    proof.push({ signature: m[1], slot: Number(m[2]), withMaxVersion0: "error -32015: Transaction version (1) is not supported by the requesting client", withMaxVersion1: "the transaction, version 1", checkedAt: "" });
  }
  return { what: what.join("\n\n"), example, fix, where: [...new Set(where.filter((w) => /:\d+$/.test(w) || !located.has(w)))], proof };
}
