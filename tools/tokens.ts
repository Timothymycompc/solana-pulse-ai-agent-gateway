// Token intelligence: resolve tickers to the right mint, and give a reasoned safety verdict for a mint.
import { PublicKey } from "@solana/web3.js";
import { z } from "zod";
import { assertAddress, BONK_MINT, formatUnits, jupSearch, KNOWN_STABLECOINS, NETWORK_DOC, TOKEN_2022_PROGRAM, TOKEN_PROGRAM, type JupToken } from "./lib";
import { ToolError, type ToolDef } from "./types";

const NETWORK = z.enum(["mainnet-beta", "devnet"]).optional().default("mainnet-beta");

const candidate = (t: JupToken) => ({
  mint: t.id, symbol: t.symbol, name: t.name, decimals: t.decimals, verified: t.isVerified === true,
  liquidityUsd: typeof t.liquidity === "number" ? Math.round(t.liquidity) : null,
  holderCount: t.holderCount ?? null, organicScore: typeof t.organicScore === "number" ? Math.round(t.organicScore) : null,
  tokenProgram: t.tokenProgram === TOKEN_2022_PROGRAM ? "token-2022" : "spl-token",
  mintAuthorityDisabled: t.audit?.mintAuthorityDisabled ?? null, freezeAuthorityDisabled: t.audit?.freezeAuthorityDisabled ?? null,
});

export const resolveToken: ToolDef = {
  name: "resolve_token",
  title: "Ticker to mint",
  category: "tokens",
  useWhen: 'Use whenever a user names a token by ticker or name ("buy BONK"). Tickers are not unique and copycats reuse them; never pick a mint from memory.',
  description: "Finds the real mint for a ticker or name, ranks candidates by verification and liquidity, and warns when copycats share the ticker.",
  inputs: { query: z.string().min(1).max(80) },
  inputDocs: [{ name: "query", type: "string", required: true, description: 'Ticker, name or mint address, e.g. "BONK", "Jupiter", "USDC".', howToGet: "The token name exactly as the user wrote it." }],
  outputs: [
    { field: "query", type: "string", meaning: "What was searched.", howComputed: "Your input, trimmed." },
    { field: "bestMatch", type: "object | null", meaning: "The candidate the gateway recommends, or null when it is not safe to pick one automatically.", howComputed: "The verified candidate whose symbol exactly matches the query (case-insensitive) with the highest liquidity. Null if no verified exact match exists." },
    { field: "confidence", type: '"high" | "medium" | "low"', meaning: "How safe it is to use bestMatch without asking the user.", howComputed: "high: verified exact match and no other verified token shares the symbol. medium: verified match but another verified token shares the symbol. low: no verified exact match." },
    { field: "copycatCount", type: "number", meaning: "Unverified tokens using the same ticker. These are often scams imitating the real token.", howComputed: "Candidates whose symbol equals the query (case-insensitive) and are not verified." },
    { field: "candidates[].mint", type: "string", meaning: "The token's mint address, its real identity.", howComputed: "Jupiter token search." },
    { field: "candidates[].symbol / name", type: "string", meaning: "Ticker and display name.", howComputed: "Jupiter token search." },
    { field: "candidates[].decimals", type: "number", meaning: "Decimal places; needed to convert amounts.", howComputed: "Jupiter token data." },
    { field: "candidates[].verified", type: "boolean", meaning: "Whether Jupiter lists the token as verified.", howComputed: "Jupiter isVerified flag." },
    { field: "candidates[].liquidityUsd", type: "number | null", meaning: "Tradable liquidity across DEX pools in USD. Low liquidity means trades move the price a lot.", howComputed: "Jupiter liquidity figure, rounded to dollars." },
    { field: "candidates[].holderCount", type: "number | null", meaning: "Number of wallets holding the token.", howComputed: "Jupiter holderCount." },
    { field: "candidates[].organicScore", type: "number | null", meaning: "Jupiter's 0-100 estimate of real (non-bot) trading activity.", howComputed: "Jupiter organicScore, rounded." },
    { field: "candidates[].tokenProgram", type: '"spl-token" | "token-2022"', meaning: "Which token program the token uses.", howComputed: "Jupiter tokenProgram field." },
    { field: "candidates[].mintAuthorityDisabled / freezeAuthorityDisabled", type: "boolean | null", meaning: "Whether anyone can still mint more or freeze holders' tokens. True is safer.", howComputed: "Jupiter audit data; null when unknown. token_verdict checks these on chain." },
    { field: "recommendation", type: "string", meaning: "What to do next, in one sentence.", howComputed: "Built from confidence and copycatCount." },
  ],
  example: async () => ({ query: "BONK" }),
  run: async ({ query }, ctx) => {
    const q = String(query).trim();
    const results = (await jupSearch(ctx, q)).map(candidate);
    const same = results.filter((c) => c.symbol.toLowerCase() === q.toLowerCase());
    const verifiedSame = same.filter((c) => c.verified).sort((a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0));
    const bestMatch = verifiedSame[0] ?? null;
    const confidence = bestMatch ? (verifiedSame.length === 1 ? "high" : "medium") : "low";
    const copycatCount = same.filter((c) => !c.verified).length;
    const recommendation = bestMatch
      ? `Use mint ${bestMatch.mint}.${copycatCount ? ` Ignore the ${copycatCount} unverified token(s) also called ${q}.` : ""}${confidence === "medium" ? " More than one verified token uses this ticker; confirm with the user." : ""}`
      : results.length ? `No verified token is called exactly "${q}". Show the user the candidates and ask which mint they mean.` : `No token found for "${q}". Ask the user for the mint address.`;
    return { query: q, bestMatch, confidence, copycatCount, candidates: results.slice(0, 10), recommendation };
  },
};

type Check = { id: string; status: "pass" | "info" | "warn" | "fail"; detail: string; source: string };

const EXTENSION_RULES: Record<string, (ext: any, stable: string | null) => Omit<Check, "id" | "source"> | null> = {
  permanentDelegate: (e, stable) => ({ status: stable ? "info" : "fail", detail: `A permanent delegate (${e.state?.delegate ?? "set"}) can transfer or burn anyone's tokens at any time.${stable ? ` Expected for ${stable}, a regulated stablecoin.` : ""}` }),
  transferHook: (e) => (e.state?.programId ? { status: "warn", detail: `Every transfer calls program ${e.state.programId}, which can block or alter transfers.` } : null),
  transferFeeConfig: (e) => {
    const bps = Number(e.state?.newerTransferFee?.transferFeeBasisPoints ?? e.state?.olderTransferFee?.transferFeeBasisPoints ?? 0);
    return bps > 0 ? { status: "warn", detail: `Transfers pay a ${bps / 100}% fee to the token's fee authority.` } : null;
  },
  defaultAccountState: (e) => (e.state?.accountState === "frozen" ? { status: "fail", detail: "New holder accounts start frozen; the issuer must approve each holder before tokens can move." } : null),
  nonTransferable: () => ({ status: "fail", detail: "The token cannot be transferred at all (soulbound)." }),
  pausableConfig: () => ({ status: "warn", detail: "The issuer can pause all transfers." }),
  mintCloseAuthority: (e, stable) => (e.state?.closeAuthority ? { status: stable ? "info" : "warn", detail: `Close authority ${e.state.closeAuthority} can close the mint once supply is zero.` } : null),
};

export const tokenVerdict: ToolDef = {
  name: "token_verdict",
  title: "Token safety verdict",
  category: "tokens",
  useWhen: "Use before buying, accepting or recommending a token. Returns SAFE, CAUTION or AVOID with the exact reasons, from on-chain data plus market data.",
  description: "Checks a token's on-chain powers (mint, freeze, Token-2022 traps), verification, liquidity, holder concentration and age, and turns them into one verdict.",
  inputs: { mint: z.string(), network: NETWORK },
  inputDocs: [
    { name: "mint", type: "string (base58 mint)", required: true, description: "The token's mint address.", howToGet: "From resolve_token (for a ticker) or get_token_accounts (for tokens a wallet holds)." },
    NETWORK_DOC,
  ],
  outputs: [
    { field: "verdict", type: '"SAFE" | "CAUTION" | "AVOID"', meaning: "Overall call. AVOID: at least one check failed. CAUTION: at least one warning. SAFE: no warnings.", howComputed: "Worst status across checks: any fail gives AVOID, else any warn gives CAUTION, else SAFE." },
    { field: "summary", type: "string", meaning: "One-sentence explanation of the verdict.", howComputed: "Built from the failing and warning checks." },
    { field: "token.symbol / name", type: "string | null", meaning: "Display info.", howComputed: "Jupiter token data." },
    { field: "token.decimals", type: "number", meaning: "Decimal places.", howComputed: "On-chain mint account." },
    { field: "token.supply", type: "string", meaning: "Total supply in whole tokens.", howComputed: "On-chain mint supply / 10^decimals, exact." },
    { field: "token.tokenProgram", type: '"spl-token" | "token-2022"', meaning: "Token program.", howComputed: "Owner of the mint account." },
    { field: "token.mintAuthority", type: "string | null", meaning: "Who can create more tokens; null means nobody (fixed supply).", howComputed: "On-chain mint account." },
    { field: "token.freezeAuthority", type: "string | null", meaning: "Who can freeze holders' tokens; null means nobody.", howComputed: "On-chain mint account." },
    { field: "token.extensions", type: "string[]", meaning: "Token-2022 extensions enabled on the mint.", howComputed: "Parsed mint extensions." },
    { field: "token.usdPrice / liquidityUsd / holderCount / top10HolderPct / firstPoolAt", type: "number | string | null", meaning: "Market facts used by the checks.", howComputed: "Jupiter token data (top10HolderPct = Jupiter audit topHoldersPercentage; firstPoolAt = first pool creation time)." },
    { field: "checks[].id", type: "string", meaning: "Which check: verified, mint_authority, freeze_authority, extension:<name>, liquidity, holder_concentration, age, known_stablecoin.", howComputed: "Fixed list of checks." },
    { field: "checks[].status", type: '"pass" | "info" | "warn" | "fail"', meaning: "Result of that check. info means notable but expected (for example a regulated stablecoin's freeze power).", howComputed: "Thresholds per check: liquidity fail < $10k, warn < $100k; top-10 holders warn > 50%, fail > 80% (info for known stablecoins); age warn < 24h; permanent delegate, frozen-by-default and non-transferable fail; mint/freeze authority warn unless a known stablecoin." },
    { field: "checks[].detail", type: "string", meaning: "The fact behind the result, in plain words.", howComputed: "Built from the data." },
    { field: "checks[].source", type: '"on-chain" | "jupiter"', meaning: "Where the fact came from.", howComputed: "on-chain for mint data, jupiter for market data." },
  ],
  notes: [
    "A verdict is a screening signal, not a guarantee. It does not detect every scam (for example coordinated wallets or off-chain rug pulls).",
    "Top-holder share counts accounts, which can include exchanges and liquidity pools.",
  ],
  example: async () => ({ mint: BONK_MINT }),
  run: async ({ mint, network }, ctx) => {
    const mintAddress = assertAddress(mint, "mint");
    const conn = ctx.connection(network);
    const [account, jupList] = await Promise.all([conn.getParsedAccountInfo(new PublicKey(mintAddress), "confirmed"), jupSearch(ctx, mintAddress)]);
    const owner = account.value?.owner.toBase58();
    const parsed: any = (account.value?.data as any)?.parsed;
    if (!account.value) throw new ToolError(404, `Mint ${mintAddress} does not exist on this network.`, "Check the address (resolve_token) and network.");
    if ((owner !== TOKEN_PROGRAM && owner !== TOKEN_2022_PROGRAM) || parsed?.type !== "mint") throw new ToolError(422, `${mintAddress} is not a token mint.`, "Pass a mint address; inspect_address shows what this address is.");
    const info = parsed.info;
    const j = jupList.find((t) => t.id === mintAddress);
    const stable = KNOWN_STABLECOINS[mintAddress] ?? null;
    const extensions: any[] = info.extensions ?? [];
    const checks: Check[] = [];
    const add = (id: string, status: Check["status"], detail: string, source: Check["source"]) => checks.push({ id, status, detail, source });

    if (stable) add("known_stablecoin", "info", `${stable}: issuer powers below are expected for a regulated stablecoin.`, "on-chain");
    add("verified", j?.isVerified ? "pass" : "warn", j?.isVerified ? "Listed as verified by Jupiter." : j ? "Not verified by Jupiter. Many scam tokens are unverified." : "Jupiter has no data on this token; it may be brand new or untraded.", "jupiter");
    add("mint_authority", info.mintAuthority ? (stable ? "info" : "warn") : "pass", info.mintAuthority ? `${info.mintAuthority} can mint unlimited new tokens, diluting holders.` : "Mint authority revoked: supply is fixed.", "on-chain");
    add("freeze_authority", info.freezeAuthority ? (stable ? "info" : "warn") : "pass", info.freezeAuthority ? `${info.freezeAuthority} can freeze any holder's tokens.` : "Freeze authority revoked: nobody can freeze holders.", "on-chain");
    for (const ext of extensions) {
      const rule = EXTENSION_RULES[ext.extension];
      const result = rule?.(ext, stable);
      if (result) add(`extension:${ext.extension}`, result.status, result.detail, "on-chain");
    }
    if (typeof j?.liquidity === "number") {
      const liq = j.liquidity;
      add("liquidity", liq < 10_000 ? "fail" : liq < 100_000 ? "warn" : "pass", `About $${Math.round(liq).toLocaleString("en-US")} of DEX liquidity.${liq < 100_000 ? " Trades of a few hundred dollars can move the price sharply, and exits may be hard." : ""}`, "jupiter");
    } else if (!stable) add("liquidity", "warn", "No liquidity data; the token may be untradeable.", "jupiter");
    const top = j?.audit?.topHoldersPercentage;
    if (typeof top === "number") {
      // Stablecoins are redeemable at the issuer, so concentration in exchange and treasury wallets is not a price risk.
      if (stable) add("holder_concentration", "info", `Top 10 holders own ${top.toFixed(1)}% of supply, mostly exchanges and issuer treasury; normal for a redeemable stablecoin.`, "jupiter");
      else add("holder_concentration", top > 80 ? "fail" : top > 50 ? "warn" : "pass", `Top 10 holders own ${top.toFixed(1)}% of supply.${top > 50 ? " A few wallets selling could crash the price." : ""}`, "jupiter");
    }
    const firstPoolAt = j?.firstPool?.createdAt ?? null;
    if (firstPoolAt) {
      const ageHours = (Date.now() - Date.parse(firstPoolAt)) / 3.6e6;
      add("age", ageHours < 24 ? "warn" : "pass", ageHours < 24 ? `First traded ${Math.max(Math.round(ageHours), 0)} hour(s) ago. Most rug pulls happen in the first day.` : `Trading since ${firstPoolAt.slice(0, 10)}.`, "jupiter");
    }

    const fails = checks.filter((c) => c.status === "fail");
    const warns = checks.filter((c) => c.status === "warn");
    const verdict = fails.length ? "AVOID" : warns.length ? "CAUTION" : "SAFE";
    const summary = fails.length ? `AVOID: ${fails.map((c) => c.detail).join(" ")}` : warns.length ? `CAUTION: ${warns.map((c) => c.detail).join(" ")}` : "No red flags found in on-chain powers, verification, liquidity, concentration or age.";
    return {
      mint: mintAddress, network, verdict, summary,
      token: {
        symbol: j?.symbol ?? null, name: j?.name ?? null, decimals: Number(info.decimals), supply: formatUnits(info.supply, info.decimals),
        tokenProgram: owner === TOKEN_PROGRAM ? "spl-token" : "token-2022", mintAuthority: info.mintAuthority ?? null, freezeAuthority: info.freezeAuthority ?? null,
        extensions: extensions.map((e) => e.extension), usdPrice: j?.usdPrice ?? null, liquidityUsd: typeof j?.liquidity === "number" ? Math.round(j.liquidity) : null,
        holderCount: j?.holderCount ?? null, top10HolderPct: typeof top === "number" ? Math.round(top * 10) / 10 : null, firstPoolAt,
      },
      checks,
    };
  },
};

export const TOKEN_TOOLS = [resolveToken, tokenVerdict];
