import { Connection, PublicKey } from "@solana/web3.js";
import type { UserCtx } from "./userDefaults";

const DEFAULT_WALLET = "Brpc8HoPo1d3Uiyo7kbERnjMqwLJJmbWxtwxHxzar6DU";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const WSOL = "So11111111111111111111111111111111111111112";
const JUPITER_PROGRAM = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";
const BUILTIN: Record<string, string> = { USDC, SOL: WSOL, WSOL };

const NEEDS: Record<string, string[]> = {
  balance: ["wallet"],
  "token-accounts": ["wallet"],
  transactions: ["wallet"],
  "find-ata": ["wallet", "mint"],
  "token-profile": ["mint"],
  "decode-tx": ["signature"],
  credits: ["wallet"],
  status: ["wallet"],
  blockhash: [],
  "optimal-fee": [],
};

const ACCEPTED = {
  wallet: "wallet | address | owner (omit to use your connected wallet, or a live example)",
  mint: "mint | token | symbol | ticker | name (omit to use your saved token, or USDC)",
  signature: "signature | sig | tx | txid, or a wallet plus optional at=<ISO time or unix> (omit for a live example)",
};

const isAddress = (v: string) => {
  if (v.length < 32 || v.length > 44) return false;
  try { new PublicKey(v); return true; } catch { return false; }
};
const isSignature = (v: string) => /^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(v);

function parseTime(v: string): number | undefined {
  if (/^\d{10}$/.test(v)) return Number(v);
  if (/^\d{13}$/.test(v)) return Math.floor(Number(v) / 1000);
  const ms = Date.parse(v);
  return Number.isNaN(ms) ? undefined : Math.floor(ms / 1000);
}

const hits = new Map<string, number[]>();
function allow(ip: string) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 60000);
  if (arr.length >= 30) { hits.set(ip, arr); return false; }
  arr.push(now);
  hits.set(ip, arr);
  return true;
}

const cache = new Map<string, { t: number; v: any }>();
async function lookupTicker(sym: string) {
  const key = sym.toUpperCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < 600000) return hit.v;
  let out: any;
  if (BUILTIN[key]) {
    out = { mint: BUILTIN[key], source: "built-in", alternatives: [] };
  } else {
    const r = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(sym)}`, { signal: AbortSignal.timeout(6000) });
    const j: any = await r.json();
    const by = new Map<string, { mint: string; symbol: string; name: string; liquidityUsd: number }>();
    for (const p of j.pairs || []) {
      const b = p.baseToken;
      if (p.chainId !== "solana" || !b || String(b.symbol).toUpperCase() !== key) continue;
      const cur = by.get(b.address) || { mint: b.address, symbol: b.symbol, name: b.name, liquidityUsd: 0 };
      cur.liquidityUsd += Number(p.liquidity?.usd || 0);
      by.set(b.address, cur);
    }
    const ranked = [...by.values()].sort((a, b) => b.liquidityUsd - a.liquidityUsd);
    if (!ranked.length) out = null;
    else {
      const warn = ranked.length > 1 && ranked[1].liquidityUsd > ranked[0].liquidityUsd * 0.2;
      out = {
        mint: ranked[0].mint,
        source: "ticker lookup (DexScreener, ranked by liquidity)",
        alternatives: ranked.slice(1, 4),
        warning: warn ? "Several tokens share this ticker with similar liquidity. Pass the exact mint to be sure." : undefined,
      };
    }
  }
  cache.set(key, { t: Date.now(), v: out });
  return out;
}

async function findSignature(conn: Connection, address: string, atSec?: number) {
  let before: string | undefined;
  for (let page = 0; page < 3; page++) {
    const sigs = await conn.getSignaturesForAddress(new PublicKey(address), { limit: atSec === undefined ? 25 : 1000, before });
    if (!sigs.length) break;
    for (const s of sigs) {
      if (s.err) continue;
      if (atSec === undefined || (s.blockTime != null && s.blockTime <= atSec)) return { signature: s.signature, blockTime: s.blockTime };
    }
    if (atSec === undefined) break;
    before = sigs[sigs.length - 1].signature;
  }
  return null;
}

export function makeAutofill(
  getConnection: (network: string) => Connection,
  getUser?: (apiKey: string) => Promise<UserCtx | null>
) {
  return async (req: any, res: any, next: any) => {
    try {
      const name = String(req.path || "").split("/").filter(Boolean).pop() || "";
      const needs = NEEDS[name];
      if (!needs) return next();

      const q: Record<string, any> = { ...req.query };
      const pick = (...ks: string[]) => {
        for (const k of ks) { const v = q[k]; if (typeof v === "string" && v.trim()) return v.trim(); }
        return null;
      };
      const fail = (code: number, error: string, extra: any = {}) => res.status(code).json({ error, accepted: ACCEPTED, ...extra });

      const apiKey = (req.headers["x-api-key"] as string | undefined) || req.headers["authorization"]?.toString().replace(/^Bearer\s+/i, "");
      let user: UserCtx | null = null;
      if (apiKey && getUser) {
        try { user = await getUser(apiKey); } catch (e: any) { console.error("defaults lookup failed:", e?.message); }
      }
      const ud: Record<string, string> = user?.defaults || {};

      const resolved: Record<string, any> = {};
      const filled: Record<string, string> = {};
      const ip = String(req.ip || "unknown");

      if (!q.network && ud.network) {
        filled.network = ud.network;
        resolved.network = { value: ud.network, source: "your saved default" };
      }
      const network = String(q.network || ud.network || "mainnet-beta");
      const conn = getConnection(network);

      const walletHint = pick("wallet", "address", "owner");
      if (walletHint && !isAddress(walletHint)) {
        return fail(400, `"${walletHint}" is not a valid Solana address. Name lookups (.sol) are not supported yet.`);
      }
      if (needs.includes("wallet")) {
        const dw = ud.wallet || user?.address || DEFAULT_WALLET;
        const dwSrc = ud.wallet ? "your saved default" : user ? "your connected wallet" : "default example wallet";
        filled.wallet = walletHint || dw;
        filled.address = filled.wallet;
        if (!walletHint) resolved.wallet = { value: dw, source: dwSrc };
      }

      if (needs.includes("mint")) {
        const explicit = pick("mint", "token", "symbol", "ticker", "name");
        const mh = explicit || ud.token || null;
        const saved = !explicit && !!ud.token;
        if (mh && isAddress(mh)) {
          filled.mint = mh;
          if (saved) resolved.mint = { value: mh, source: "your saved default" };
        } else if (mh) {
          if (!allow(ip)) return fail(429, "Too many lookups. Slow down or pass the exact mint.");
          const t = await lookupTicker(mh);
          if (!t) return fail(404, `No Solana token found for "${mh}". Pass the exact mint address.`);
          filled.mint = t.mint;
          resolved.mint = { input: mh, value: t.mint, source: (saved ? "your saved default, " : "") + t.source, alternatives: t.alternatives, warning: t.warning };
        } else {
          filled.mint = USDC;
          resolved.mint = { value: USDC, source: "default example token (USDC)" };
        }
      }

      if (needs.includes("signature")) {
        const sh = pick("signature", "sig", "tx", "txid");
        const atRaw = pick("at", "time", "when");
        const atSec = atRaw ? parseTime(atRaw) : undefined;
        if (atRaw && atSec === undefined) return fail(400, `Could not read the time "${atRaw}". Use an ISO time like 2026-10-05T14:00:00Z or a unix timestamp.`);
        if (sh) {
          if (!isSignature(sh)) return fail(400, `"${sh}" is not a valid transaction signature.`);
          filled.signature = sh;
        } else if (!walletHint && !atRaw && ud.signature) {
          filled.signature = ud.signature;
          resolved.signature = { value: ud.signature, source: "your saved default" };
        } else {
          if (!allow(ip)) return fail(429, "Too many lookups. Slow down or pass a signature.");
          const sources: { addr: string; label: string }[] = [];
          if (walletHint) sources.push({ addr: walletHint, label: "this wallet" });
          else {
            if (ud.wallet) sources.push({ addr: ud.wallet, label: "your saved default wallet" });
            if (user) sources.push({ addr: user.address, label: "your connected wallet" });
            sources.push({ addr: JUPITER_PROGRAM, label: "Jupiter (live example)" });
          }
          let found: { signature: string; blockTime?: number | null } | null = null;
          let from = sources[0];
          for (const s of sources) {
            const f = await findSignature(conn, s.addr, atSec);
            if (f) { found = f; from = s; break; }
          }
          if (!found) return fail(404, atSec ? "No successful transaction found at or before that time within the most recent 3000 transactions of this wallet." : "No recent successful transaction found for that wallet.");
          filled.signature = found.signature;
          resolved.signature = {
            value: found.signature,
            source: atSec
              ? `closest successful transaction at or before ${new Date(atSec * 1000).toISOString()} for ${from.label}`
              : `latest successful transaction for ${from.label}`,
            wallet: from.addr,
            blockTime: found.blockTime,
          };
        }
      }

      Object.defineProperty(req, "query", { value: { ...q, ...filled }, writable: true, configurable: true, enumerable: true });
      if (Object.keys(resolved).length) {
        const orig = res.json.bind(res);
        res.json = (b: any) => orig(b && typeof b === "object" && !Array.isArray(b) ? { ...b, resolved } : b);
      }
      return next();
    } catch (err: any) {
      console.error("autofill error:", err);
      return res.status(502).json({ error: "Could not auto-fill this request. Pass the values explicitly.", accepted: ACCEPTED });
    }
  };
}
