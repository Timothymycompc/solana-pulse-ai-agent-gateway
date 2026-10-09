// check-discovery.ts: verifies registry, live tools/list, mcp.json, llms.txt and runtime agree.
// Run: npx tsx check-discovery.ts            (checks the live service)
//      BASE_URL=http://localhost:8080 npx tsx check-discovery.ts
import { TOOLS, PRICE_LAMPORTS, buildDescription } from "./toolRegistry";
import { buildLlmsTxt, buildMcpManifest } from "./discovery";
import { GUIDES } from "./toolGuide";

const BASE = (process.env.BASE_URL || "https://solana-pulse-gateway-1021990235790.us-central1.run.app").replace(/\/$/, "");
let failed = 0;
const check = (cond: boolean, msg: string) => { console.log(cond ? "  PASS" : "  FAIL", msg); if (!cond) failed++; };
const sorted = (a: string[]) => [...a].sort().join(",");

async function mcp(method: string, params?: unknown): Promise<any> {
  const r = await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const text = await r.text();
  const body = text.trimStart().startsWith("{") ? text : (text.split("\n").find((l) => l.startsWith("data:")) || "").slice(5);
  return JSON.parse(body);
}

async function main() {
  console.log(`Checking ${BASE}\n\nRegistry (static)`);
  check(new Set(TOOLS.map((t) => t.name)).size === TOOLS.length, "tool names are unique");
  for (const t of TOOLS) {
    const names = t.params.map((p) => p.name);
    const req = t.params.filter((p) => p.required).map((p) => p.name);
    check(Object.keys(t.exampleRequest).every((k) => names.includes(k)) && req.every((k) => k in t.exampleRequest), `${t.name}: example uses valid parameters`);
    check(t.priceLamports === 0 ? t.auth === "none" : t.auth === "x-api-key" && t.priceLamports === PRICE_LAMPORTS, `${t.name}: price and auth are consistent`);
    check(!(t.readOnly && t.broadcasts), `${t.name}: read-only tool does not claim to broadcast`);
  }

  console.log("\nLive tools/list");
  const list: any[] = (await mcp("tools/list")).result?.tools ?? [];
  check(list.length === TOOLS.length, `live tool count ${list.length} equals registry ${TOOLS.length}`);
  check(sorted(list.map((x) => x.name)) === sorted(TOOLS.map((t) => t.name)), "live tool names equal registry names");
  for (const t of TOOLS) {
    const live = list.find((x) => x.name === t.name);
    if (!live) { check(false, `${t.name}: exists live`); continue; }
    const sch = live.inputSchema ?? {};
    const a = live.annotations ?? {};
    check(live.description === buildDescription(t), `${t.name}: description matches registry`);
    check(sorted(sch.required ?? []) === sorted(t.params.filter((p) => p.required).map((p) => p.name)), `${t.name}: required parameters match schema`);
    check(sorted(Object.keys(sch.properties ?? {})) === sorted(t.params.map((p) => p.name)), `${t.name}: parameter names match schema`);
    check(a.readOnlyHint === t.readOnly && a.destructiveHint === t.destructive && a.idempotentHint === t.idempotent, `${t.name}: safety annotations match registry`);
  }

  console.log("\nRuntime pricing and auth (no API key is sent, nothing is charged)");
  for (const t of TOOLS) {
    const r = (await mcp("tools/call", { name: t.name, arguments: t.exampleRequest })).result;
    const text: string = r?.content?.[0]?.text ?? "";
    if (t.priceLamports === 0) {
      check(!text.includes("priceLamports"), `${t.name}: free tool does not ask for payment`);
    } else {
      let p = -1;
      try { p = JSON.parse(text).priceLamports; } catch { /* not JSON */ }
      check(r?.isError === true && p === t.priceLamports, `${t.name}: asks for ${t.priceLamports} lamports when no key is sent`);
    }
  }

  console.log("\nDiscovery documents");
  const mr = await fetch(`${BASE}/.well-known/mcp.json`);
  let manifest: any = null;
  try { manifest = await mr.json(); } catch { /* invalid */ }
  check(mr.ok && !!manifest, "/.well-known/mcp.json is valid JSON");
  check(JSON.stringify(manifest) === JSON.stringify(buildMcpManifest()), "mcp.json matches the registry-generated manifest");
  check(Array.isArray(manifest?.tools) && manifest.tools.length === TOOLS.length, "mcp.json lists every registry tool");
  const lr = await fetch(`${BASE}/llms.txt`);
  const llms = await lr.text();
  check(lr.ok && llms === buildLlmsTxt(), "llms.txt matches the registry-generated text");
  check(TOOLS.every((t) => llms.includes(t.name)), "llms.txt documents every tool");
  const stale = ["110 calls", "per year", "pay in USDC", "USDC payment", "referral", "Honeypot/Freeze"].filter((s) => llms.includes(s));
  check(stale.length === 0, `llms.txt has no stale claims${stale.length ? " (found: " + stale.join(", ") + ")" : ""}`);

  console.log("\nGuides (for LLMs and developers)");
  for (const t of TOOLS) {
    const g = GUIDES[t.name];
    check(!!g && !!g.plain && !!g.success && !!g.next && g.errors.length >= 3, `${t.name}: guide has plain text, success, next step and errors`);
    check(!!g && t.params.every((p) => !!g.inputHints[p.name]), `${t.name}: every input has a hint`);
  }
  check(llms.includes("Input hints:") && llms.includes("Errors and fixes:") && llms.includes("## Quick start") && llms.includes("## Common workflows"), "llms.txt has hints, errors, quick start and workflows");

  console.log("\nNetwork validation");
  const nr = await fetch(`${BASE}/api/solana/blockhash?network=devnett`);
  check(nr.status === 400, `REST rejects network=devnett (status ${nr.status})`);

  console.log(`\n${failed === 0 ? "ALL CHECKS PASSED" : failed + " CHECK(S) FAILED"}`);
  process.exit(failed === 0 ? 0 : 1);
}
main().catch((e) => { console.error("Checker crashed:", e.message); process.exit(2); });
