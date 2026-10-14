// Shared helpers for the tool registry: exact unit math, address checks, Jupiter token data, labels.
import { PublicKey } from "@solana/web3.js";
import { ToolError, type ToolContext } from "./types";

export const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
export const SYSTEM_PROGRAM = "11111111111111111111111111111111";
export const ATA_PROGRAM = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
export const COMPUTE_BUDGET_PROGRAM = "ComputeBudget111111111111111111111111111111";
export const NATIVE_MINT = "So11111111111111111111111111111111111111112";
export const LAMPORTS_PER_SOL = 1_000_000_000n;
export const BASE_FEE_LAMPORTS_PER_SIGNATURE = 5000;

// Example addresses used to build live examples. The Binance hot wallet is a public exchange wallet, not a person.
export const EXAMPLE_WALLET = "5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9";
export const EXAMPLE_RECIPIENT = "Brpc8HoPo1d3Uiyo7kbERnjMqwLJJmbWxtwxHxzar6DU";
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const BONK_MINT = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";

// Regulated stablecoins whose issuers keep mint/freeze/permanent-delegate powers by design (compliance).
export const KNOWN_STABLECOINS: Record<string, string> = {
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: "USDC (Circle)",
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: "USDT (Tether)",
  "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo": "PYUSD (Paxos)",
};

export const PROGRAM_LABELS: Record<string, string> = {
  [SYSTEM_PROGRAM]: "System Program",
  [TOKEN_PROGRAM]: "SPL Token",
  [TOKEN_2022_PROGRAM]: "Token-2022",
  [ATA_PROGRAM]: "Associated Token Account",
  [COMPUTE_BUDGET_PROGRAM]: "Compute Budget",
  MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr: "Memo",
  Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo: "Memo (v1)",
  JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUJoi5QNyVTaV4: "Jupiter Aggregator v6",
  whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc: "Orca Whirlpools",
  "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8": "Raydium AMM v4",
  CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK: "Raydium CLMM",
  LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo: "Meteora DLMM",
  "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P": "Pump.fun",
  Stake11111111111111111111111111111111111111: "Stake Program",
  Vote111111111111111111111111111111111111111: "Vote Program",
  AddressLookupTab1e1111111111111111111111111: "Address Lookup Table",
  L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95: "Lighthouse (wallet assertions)",
};

export const labelFor = (programId: string) => PROGRAM_LABELS[programId] ?? null;

export function assertAddress(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new ToolError(400, `${field} is required.`, `Pass a base58 Solana address in "${field}".`);
  try { return new PublicKey(value.trim()).toBase58(); }
  catch { throw new ToolError(400, `"${value}" is not a valid Solana address.`, "Addresses are 32-44 base58 characters. Tickers and .sol names are not accepted here; use find_token for tickers."); }
}

// Exact conversion between base units (integer strings) and human amounts; no floating point.
export function formatUnits(raw: bigint | string, decimals: number): string {
  const value = BigInt(raw);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const fraction = (abs % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

export function parseUnits(amount: string, decimals: number): bigint {
  const text = String(amount).trim();
  if (!/^\d+(\.\d+)?$/.test(text)) throw new ToolError(400, `"${amount}" is not a plain decimal number.`, 'Use digits with an optional decimal point, e.g. "1.5". No commas, signs or exponents.');
  const [whole, fraction = ""] = text.split(".");
  if (fraction.length > decimals) throw new ToolError(400, `"${amount}" has ${fraction.length} decimal places but this token only supports ${decimals}.`, `Round to at most ${decimals} decimal places.`);
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0") || "0");
}

export const lamportsToSol = (lamports: bigint | number | string) => formatUnits(BigInt(lamports), 9);

// Jupiter token data (verification, liquidity, price, audit). Cached briefly; failures return an empty result.
export type JupToken = {
  id: string; name: string; symbol: string; decimals: number; isVerified?: boolean; tags?: string[];
  organicScore?: number; liquidity?: number; holderCount?: number; tokenProgram?: string; usdPrice?: number; mcap?: number;
  audit?: { mintAuthorityDisabled?: boolean; freezeAuthorityDisabled?: boolean; topHoldersPercentage?: number; devBalancePercentage?: number; devMints?: number };
  firstPool?: { id?: string; createdAt?: string };
  dev?: string;
};
const jupCache = new Map<string, { at: number; value: JupToken[] }>();
// ok is false when Jupiter could not be reached, so callers can tell "no data" from "no answer".
export async function jupLookup(ctx: ToolContext, query: string): Promise<{ tokens: JupToken[]; ok: boolean }> {
  const key = query.trim();
  const hit = jupCache.get(key);
  if (hit && Date.now() - hit.at < 60_000) return { tokens: hit.value, ok: true };
  try {
    const result = await ctx.fetchJson(`https://lite-api.jup.ag/tokens/v2/search?query=${encodeURIComponent(key)}`, 8000);
    const value: JupToken[] = Array.isArray(result) ? result : [];
    jupCache.set(key, { at: Date.now(), value });
    if (jupCache.size > 500) jupCache.clear();
    return { tokens: value, ok: true };
  } catch { return { tokens: [], ok: false }; }
}

// RugCheck's public token report: who provides the liquidity and whether it is locked, insider wallet networks, the
// creator's history and whether the name and logo can still change. ok is false when RugCheck could not be reached.
export type RugMarket = { marketType?: string; lp?: { lpLockedPct?: number; quoteUSD?: number; baseUSD?: number } };
export type RugReport = {
  markets?: RugMarket[]; totalLPProviders?: number; risks?: { name: string; level: string; description?: string }[];
  insiderNetworks?: { size?: number; currentHolding?: number }[] | null; graphInsidersDetected?: number;
  tokenMeta?: { mutable?: boolean; updateAuthority?: string | null }; creator?: string; rugged?: boolean;
};
const rugCache = new Map<string, { at: number; value: RugReport }>();
export async function rugReport(ctx: ToolContext, mint: string): Promise<{ report: RugReport | null; ok: boolean }> {
  const hit = rugCache.get(mint);
  if (hit && Date.now() - hit.at < 60_000) return { report: hit.value, ok: true };
  try {
    const value = await ctx.fetchJson(`https://api.rugcheck.xyz/v1/tokens/${mint}/report`, 8_000);
    if (!value || typeof value !== "object") return { report: null, ok: false };
    rugCache.set(mint, { at: Date.now(), value });
    if (rugCache.size > 500) rugCache.clear();
    return { report: value, ok: true };
  } catch { return { report: null, ok: false }; }
}

// Tests reset the caches so each recorded scenario makes its own Jupiter and RugCheck calls.
export const clearJupCache = () => { jupCache.clear(); rugCache.clear(); };

// For display-only data (symbols, prices), where a Jupiter outage just leaves fields empty.
export const jupSearch = async (ctx: ToolContext, query: string): Promise<JupToken[]> => (await jupLookup(ctx, query)).tokens;

// Look up many mints at once (Jupiter accepts up to 100 comma-separated mints per request).
export async function jupByMints(ctx: ToolContext, mints: string[]): Promise<Map<string, JupToken>> {
  const out = new Map<string, JupToken>();
  const unique = [...new Set(mints)];
  for (let i = 0; i < unique.length; i += 100) {
    const batch = await jupSearch(ctx, unique.slice(i, i + 100).join(","));
    for (const token of batch) if (unique.includes(token.id)) out.set(token.id, token);
  }
  return out;
}

export const isoTime = (unixSeconds: number | null | undefined) => (unixSeconds ? new Date(unixSeconds * 1000).toISOString() : null);

export const NETWORK_DOC = {
  name: "network", type: '"mainnet-beta" | "devnet"', required: false,
  lookingFor: 'Which Solana network to read. Default "mainnet-beta" (real money).',
  whereToGet: 'Leave it out for mainnet. Use "devnet" only for test wallets.',
};

// camelCase keys to snake_case, all the way down, so every output field reads the same way ("amountRaw" -> "amount_raw").
export const snakeKeys = (value: unknown): any => {
  if (Array.isArray(value)) return value.map(snakeKeys);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`), snakeKeys(v)]));
};
