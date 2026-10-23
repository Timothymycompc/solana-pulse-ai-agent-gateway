// Token intelligence: resolve tickers to the right mint, and give a reasoned safety verdict for a mint.
import { PublicKey } from "@solana/web3.js";
import { z } from "zod";
import { assertAddress, BONK_MINT, formatUnits, jupLookup, KNOWN_STABLECOINS, NETWORK_DOC, rugReport, TOKEN_2022_PROGRAM, TOKEN_PROGRAM, type JupToken, type RugReport } from "./lib";
import { jupiterSaysNotTradable, sellCheck } from "./sellcheck";
import { ToolError, type ToolDef } from "./types";

const NETWORK = z.enum(["mainnet-beta", "devnet"]).optional().default("mainnet-beta");

const flip = (v: boolean | undefined) => (typeof v === "boolean" ? !v : null);
// Tickers match in any case and with or without a leading "$": dogwifhat's ticker is listed as "$WIF", people type "WIF".
const ticker = (s: string) => s.trim().replace(/^\$/, "").toLowerCase();
export const sameTicker = (a: string, b: string) => ticker(a) === ticker(b);
const candidate = (t: JupToken) => ({
  address: t.id, symbol: t.symbol, name: t.name, decimals: t.decimals, verified: t.isVerified === true,
  liquidity_usd: typeof t.liquidity === "number" ? Math.round(t.liquidity) : null,
  holders: t.holderCount ?? null, real_trading_score: typeof t.organicScore === "number" ? Math.round(t.organicScore) : null,
  token_program: t.tokenProgram === TOKEN_2022_PROGRAM ? "token-2022" : "spl-token",
  can_mint_more: flip(t.audit?.mintAuthorityDisabled), can_freeze: flip(t.audit?.freezeAuthorityDisabled),
});

export const resolveToken: ToolDef = {
  name: "find_token",
  oldName: "resolve_token",
  oldInputs: { query: "name" },
  title: "Ticker to token address",
  category: "tokens",
  benefit: { kind: "money", text: "Copycats reuse popular tickers: a search for BONK finds several unverified fakes. This gives the verified token address so the agent doesn't buy a fake." },
  useWhen: 'Run whenever a user names a token ("buy BONK"). Tickers aren\'t unique; copycats reuse them. Never take an address from memory.',
  usage: '{"name": "BONK"}',
  description: "Finds the real address for a ticker or name, ranks matches by verification and liquidity, and warns when copycats share the ticker.",
  inputs: { name: z.string().min(1).max(80) },
  inputDocs: [{ name: "name", type: "string", required: true, lookingFor: 'Ticker, name or address: "BONK", "Jupiter", "USDC".', whereToGet: "Exactly as the user wrote it." }],
  outputs: [
    { field: "name", type: "string", is: "What was searched.", howWorkedOut: "Your input, trimmed." },
    { field: "best", type: "object | null", is: "The token we recommend, or null when it isn't safe to pick one for you.", howWorkedOut: "The verified token whose ticker exactly matches (any case, with or without a leading $) with the most liquidity. Null if there's no verified exact match." },
    { field: "confidence", type: '"high" | "medium" | "low"', is: "How safe it is to use best without asking the user.", howWorkedOut: "high: a verified exact match and no other verified token shares the ticker. medium: another verified token shares it. low: no verified exact match." },
    { field: "copycats", type: "number", is: "Unverified tokens using the same ticker. Usually scams copying the real one.", howWorkedOut: "Matches with the same ticker (any case, with or without a leading $) that aren't verified." },
    { field: "candidates[].address", type: "string", is: "The token's address, its real identity.", howWorkedOut: "Jupiter token search." },
    { field: "candidates[].symbol / name", type: "string", is: "Ticker and display name.", howWorkedOut: "Jupiter token search." },
    { field: "candidates[].decimals", type: "number", is: "Decimal places. Needed to convert amounts.", howWorkedOut: "Jupiter token data." },
    { field: "candidates[].verified", type: "boolean", is: "Whether Jupiter lists the token as verified.", howWorkedOut: "Jupiter's isVerified flag." },
    { field: "candidates[].liquidity_usd", type: "number | null", is: "How much can be traded across DEX pools, in USD. Low means trades move the price a lot.", howWorkedOut: "Jupiter liquidity, rounded to dollars." },
    { field: "candidates[].holders", type: "number | null", is: "How many wallets hold the token.", howWorkedOut: "Jupiter holderCount." },
    { field: "candidates[].real_trading_score", type: "number | null", is: "Jupiter's 0-100 estimate of real (not bot) trading.", howWorkedOut: "Jupiter organicScore, rounded." },
    { field: "candidates[].token_program", type: '"spl-token" | "token-2022"', is: "Which token program the token uses.", howWorkedOut: "Jupiter tokenProgram." },
    { field: "candidates[].can_mint_more / can_freeze", type: "boolean | null", is: "Whether someone can still create more of it, or freeze holders' tokens. false is safer.", howWorkedOut: "Jupiter audit data. null when unknown. token_safety checks these on chain." },
    { field: "next_step", type: "string", is: "What to do next, in one sentence.", howWorkedOut: "Built from confidence and copycats." },
  ],
  example: async () => ({ name: "BONK" }),
  run: async ({ name }, ctx) => {
    const q = String(name).trim();
    const search = await jupLookup(ctx, q.replace(/^\$/, "") || q);
    if (!search.ok) throw new ToolError(503, "Token search (Jupiter) is unavailable right now.", "Retry in a few seconds. Don't pick a token address from memory meanwhile. Failed calls are never charged.");
    const results = search.tokens.map(candidate);
    const same = results.filter((c) => sameTicker(c.symbol, q));
    const verifiedSame = same.filter((c) => c.verified).sort((a, b) => (b.liquidity_usd ?? 0) - (a.liquidity_usd ?? 0));
    const bestMatch = verifiedSame[0] ?? null;
    const confidence = bestMatch ? (verifiedSame.length === 1 ? "high" : "medium") : "low";
    const copycatCount = same.filter((c) => !c.verified).length;
    const nextStep = bestMatch
      ? `Use token address ${bestMatch.address}.${copycatCount ? ` Ignore the ${copycatCount} unverified token(s) also called ${q}.` : ""}${confidence === "medium" ? " More than one verified token uses this ticker. Confirm with the user." : ""}`
      // Every exact match unverified is how copycats look, and the real token may be missing from Jupiter's search
      // (BCAT, Oct 2026: only 3 unverified copies came back). Don't offer them as choices.
      : copycatCount ? `Every token called "${q}" found here is unverified (${copycatCount}), which is how copycats look, and the real one may be missing from the search. Ask the user for the exact token address instead of picking from these.`
      : results.length ? `No verified token is called exactly "${q}". Show the user the candidates and ask which one they mean.` : `No token found for "${q}". Ask the user for the token address.`;
    return { name: q, best: bestMatch, confidence, copycats: copycatCount, candidates: results.slice(0, 10), next_step: nextStep };
  },
};

type Check = { name: string; result: "pass" | "info" | "warn" | "fail"; detail: string; source: string };

// A SAFE summary names only the checks that ran and passed, and says which ones were skipped, so it never claims
// "it can be sold" when the sell test couldn't run (JUP, Oct 2026) or "insiders check out" for a stablecoin.
const PASS_WORDS: [string, string][] = [
  ["sell_test", "a real holder's sale worked in a simulation"], ["liquidity_pull", "the liquidity can't be pulled"],
  ["creator_history", "the creator has no rug record"], ["insiders", "no insider network holds a large share"],
  ["mint_authority", "nobody can mint more"], ["freeze_authority", "nobody can freeze holders"],
  ["verified", "Jupiter verifies it"], ["liquidity", "it has over $100,000 of liquidity"], ["holder_concentration", "the top 10 holders own under half"], ["age", "it has traded for over a day"],
];
const NOT_CHECKED = /skipped|unknown|unavailable|not available|inconclusive|not checked/i;
export function safeSummary(checks: Check[]): string {
  const passed = new Set(checks.filter((c) => c.result === "pass").map((c) => c.name));
  const said = PASS_WORDS.filter(([name]) => passed.has(name)).map(([, words]) => words);
  const skipped = checks.filter((c) => c.result === "info" && NOT_CHECKED.test(c.detail)).map((c) => c.detail);
  const stable = checks.find((c) => c.name === "known_stablecoin");
  return [
    `No red flags found${said.length ? `: ${said.join(", ")}` : ""}.`,
    stable ? `${stable.detail} The sell, liquidity-pull, insider and creator checks don't apply to it.` : "",
    skipped.length ? `Not checked: ${skipped.join(" ")}` : "",
  ].filter(Boolean).join(" ");
}

// Permanent delegates that belong to a known issuer of tokenized stocks or gold, matched by the delegate wallet itself,
// so a copycat token reusing the name still fails. The power is real (the issuer can take or burn any holder's tokens),
// so it stays a warning: holding the token means trusting that issuer. In the Oct 2026 audit these two wallets were
// the only failing check on 96 tokens. PreStocks (pre-IPO tokens) is left out on purpose and still fails.
export const KNOWN_ISSUER_DELEGATES: Record<string, string> = {
  "5aMNNLQJwAEeoemTEMkv5NVjqKwvvefRYCQ5Z67HFvEq": "xStocks (Backed Finance), the issuer of every xStock token",
  "2cVYpagTt7ZGc3mmTXBa7fAznUtx5DUu6aCq8uVDaf4a": "Backpack Securities, the issuer of Backpack's stock tokens",
  "2apBGMsS6ti9RyF5TwQTDswXBWskiJP2LD4cUEDqYJjk": "Paxos, the issuer of USDG, USDP, PYUSD and PAX Gold",
};
export function permanentDelegateRule(delegate: string | undefined, stable: string | null): Omit<Check, "name" | "source"> {
  const power = `A permanent delegate (${delegate ?? "set"}) can transfer or burn anyone's tokens at any time.`;
  if (stable) return { result: "info", detail: `${power} Expected for ${stable}, a regulated stablecoin.` };
  const issuer = delegate ? KNOWN_ISSUER_DELEGATES[delegate] : undefined;
  if (issuer) return { result: "warn", detail: `${power} It belongs to ${issuer}, so holding this token means trusting that issuer not to take it.` };
  return { result: "fail", detail: power };
}

const EXTENSION_RULES: Record<string, (ext: any, stable: string | null) => Omit<Check, "name" | "source"> | null> = {
  permanentDelegate: (e, stable) => permanentDelegateRule(e.state?.delegate, stable),
  transferHook: (e) => (e.state?.programId ? { result: "warn", detail: `Every transfer calls program ${e.state.programId}, which can block or alter transfers.` } : null),
  transferFeeConfig: (e) => {
    const bps = Number(e.state?.newerTransferFee?.transferFeeBasisPoints ?? e.state?.olderTransferFee?.transferFeeBasisPoints ?? 0);
    return bps > 0 ? { result: "warn", detail: `Transfers pay a ${bps / 100}% fee to the token's fee authority.` } : null;
  },
  defaultAccountState: (e) => (e.state?.accountState === "frozen" ? { result: "fail", detail: "New holder accounts start frozen; the issuer must approve each holder before tokens can move." } : null),
  nonTransferable: () => ({ result: "fail", detail: "The token cannot be transferred at all (soulbound)." }),
  pausableConfig: () => ({ result: "warn", detail: "The issuer can pause all transfers." }),
  mintCloseAuthority: (e, stable) => (e.state?.closeAuthority ? { result: stable ? "info" : "warn", detail: `Close authority ${e.state.closeAuthority} can close the mint once supply is zero.` } : null),
};

// Can whoever supplied the liquidity take it back? That's the classic rug pull: the creator adds a pool, buyers come in,
// then the creator withdraws the pool and the token can no longer be sold for anything. Liquidity that is locked,
// burned, sitting in a launchpad's bonding curve or spread over many providers can't be pulled by one person.
const BONDING_CURVES = /pump_?fun$|moonshot|launchlab|bonk_?fun|boop/i;
export function liquidityPullCheck(r: RugReport, verified: boolean): Omit<Check, "name" | "source"> | null {
  const markets = (r.markets ?? []).map((m) => ({ type: m.marketType ?? "", usd: (m.lp?.quoteUSD ?? 0) + (m.lp?.baseUSD ?? 0), locked: Math.min(Math.max(m.lp?.lpLockedPct ?? 0, 0), 100) }))
    .filter((m) => m.usd >= 1_000);
  if (!markets.length) return null;
  const total = markets.reduce((a, m) => a + m.usd, 0);
  const safeUsd = markets.reduce((a, m) => a + (BONDING_CURVES.test(m.type) ? m.usd : (m.usd * m.locked) / 100), 0);
  const unlockedPct = Math.round(100 - (safeUsd / total) * 100);
  const providers = r.totalLPProviders ?? 0;
  if (unlockedPct <= 20) return { result: "pass", detail: `${100 - unlockedPct}% of the liquidity is locked, burned or held by a launchpad, so nobody can pull it.` };
  if (providers >= 10) return { result: "pass", detail: `The liquidity comes from ${providers} different providers, so no single one can pull it.` };
  const who = providers ? `${providers} provider${providers === 1 ? "" : "s"}` : "a few providers";
  if (providers <= 2) return { result: verified ? "warn" : "fail", detail: `${unlockedPct}% of the liquidity is unlocked and comes from ${who}, who can withdraw it at any time and leave holders unable to sell.` };
  return { result: "warn", detail: `${unlockedPct}% of the liquidity is unlocked and comes from only ${who}. If they withdraw it, the price collapses.` };
}

// Wallets that RugCheck links by funding or transfers: one person spreading the supply over many wallets to look like
// many holders, then selling them all at once. The top-10 check misses this when no single wallet is large.
export const MAX_INSIDER_NETWORK = 500;
export const ESTABLISHED_DAYS = 90;
export function insiderCheck(r: RugReport, rawSupply: bigint): Omit<Check, "name" | "source"> | null {
  const networks = r.insiderNetworks ?? [];
  const wallets = networks.reduce((a, n) => a + (n.size ?? 0), 0);
  if (!wallets || rawSupply <= 0n) return { result: "pass", detail: "No networks of linked insider wallets detected." };
  const held = networks.reduce((a, n) => a + (Number(n.currentHolding) || 0), 0);
  const pct = (held / Number(rawSupply)) * 100;
  // RugCheck sometimes reports networks holding more than the whole supply (dogwifhat: 312%, USDG: 3,393%, Oct 2026),
  // which can't be true, so its insider data for that token can't be trusted either way. Unknown, not a verdict.
  if (pct > 100) return { result: "info", detail: `Insider wallets: unknown. RugCheck's data for this token says linked wallets hold ${Math.round(pct)}% of the supply, which is impossible, so it was not used.` };
  // RugCheck links wallets that share a funder, so a network of thousands is usually an exchange or an airdrop paying
  // many people, not one person splitting a supply (TRUMP 1,566, RAY 2,560, PYTH 8,466 wallets in the Oct 2026 audit,
  // all failing on it). The insider trick spreads a supply over tens to a few hundred wallets, so only those count.
  const counted = networks.filter((n) => (n.size ?? 0) <= MAX_INSIDER_NETWORK);
  const left = networks.length - counted.length;
  const leftNote = left ? ` ${left} network${left === 1 ? "" : "s"} of over ${MAX_INSIDER_NETWORK} linked wallets ${left === 1 ? "was" : "were"} not counted: groups that big are usually an exchange or an airdrop, not one person.` : "";
  const countedWallets = counted.reduce((a, n) => a + (n.size ?? 0), 0);
  if (!countedWallets) return { result: "pass", detail: `No networks of linked insider wallets detected.${leftNote}` };
  const countedPct = (counted.reduce((a, n) => a + (Number(n.currentHolding) || 0), 0) / Number(rawSupply)) * 100;
  const shown = countedPct < 0.1 ? "under 0.1" : countedPct.toFixed(1);
  if (countedPct > 30) return { result: "fail", detail: `${countedWallets} linked insider wallets hold ${shown}% of the supply between them and could sell together.${leftNote}` };
  if (countedPct > 10) return { result: "warn", detail: `${countedWallets} linked insider wallets hold ${shown}% of the supply between them.${leftNote}` };
  return { result: "pass", detail: `${countedWallets} linked wallets found, holding ${shown}% of the supply: too little to crash the price.${leftNote}` };
}

// The creator's track record: a wallet that has rugged before, or one that launches tokens by the hundred and
// abandons them, is the strongest warning sign there is for a new token.
export function creatorCheck(r: RugReport | null, j: JupToken | undefined, verified: boolean): Omit<Check, "name" | "source"> | null {
  if (r?.risks?.some((k) => /creator history of rugged/i.test(k.name))) return { result: "fail", detail: "The creator has launched tokens before that were rugged." };
  const made = j?.audit?.devMints;
  const holds = j?.audit?.devBalancePercentage;
  const parts: string[] = [];
  let result: Check["result"] = "pass";
  if (typeof made === "number" && made >= 20 && !verified) { result = "warn"; parts.push(`The creator has launched ${made.toLocaleString("en-US")} tokens; serial launchers usually abandon or dump them.`); }
  if (typeof holds === "number" && holds > 20) { result = "warn"; parts.push(`The creator still holds ${holds.toFixed(1)}% of the supply and could sell it at any time.`); }
  if (parts.length) return { result, detail: parts.join(" ") };
  if (typeof made !== "number" && !r) return null;
  return { result: "pass", detail: `No rugged tokens in the creator's history${typeof made === "number" ? ` (${made.toLocaleString("en-US")} token${made === 1 ? "" : "s"} launched)` : ""}.` };
}

// A name and logo that can still change let a token be renamed to impersonate a real one after people buy it.
export function metadataCheck(r: RugReport, verified: boolean, stable: string | null): Omit<Check, "name" | "source"> | null {
  const meta = r.tokenMeta;
  if (!meta || typeof meta.mutable !== "boolean") return null;
  if (!meta.mutable) return { result: "pass", detail: "The token's name and logo are locked and can't be changed." };
  const who = meta.updateAuthority ? ` by ${meta.updateAuthority}` : "";
  return { result: verified || stable ? "info" : "warn", detail: `The token's name and logo can still be changed${who}${verified || stable ? ", which is common for established tokens." : ", so it could later be renamed to look like another token."}` };
}

export const tokenVerdict: ToolDef = {
  name: "token_safety",
  oldName: "token_verdict",
  oldInputs: { mint: "token" },
  title: "Is this token safe?",
  category: "tokens",
  benefit: { kind: "money", text: "Flags tokens you can't sell, liquidity the creator can pull, creators who have rugged before, hidden insider wallets and issuers who can freeze or take your tokens, before you buy. Regulated stablecoins' powers count as expected." },
  useWhen: "Run before buying, accepting or recommending a token. Answers SAFE, CAUTION or AVOID with exact reasons from chain and market data.",
  usage: '{"token": "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"} checks BONK',
  description: "Simulates a real holder selling, then checks if liquidity can be pulled, the creator's record, insider wallet networks, issuer powers (mint, freeze, Token-2022 traps), verification, liquidity, holders and age, for one verdict.",
  inputs: { token: z.string(), network: NETWORK },
  inputDocs: [
    { name: "token", type: "string (token address)", required: true, lookingFor: "The token's address.", whereToGet: "From find_token (for a ticker) or tokens (for a wallet's tokens)." },
    NETWORK_DOC,
  ],
  outputs: [
    { field: "verdict", type: '"SAFE" | "CAUTION" | "AVOID"', is: "The answer. AVOID: at least one check failed. CAUTION: at least one warning. SAFE: no warnings.", howWorkedOut: "The worst check wins: any fail is AVOID, any warn is CAUTION, otherwise SAFE." },
    { field: "summary", type: "string", is: "One sentence explaining the verdict.", howWorkedOut: "Built from the failed and warning checks." },
    { field: "about.symbol / name", type: "string | null", is: "Ticker and name.", howWorkedOut: "Jupiter token data." },
    { field: "about.decimals", type: "number", is: "Decimal places.", howWorkedOut: "The on-chain token account." },
    { field: "about.supply", type: "string", is: "Total supply in whole tokens.", howWorkedOut: "On-chain supply / 10^decimals, exact." },
    { field: "about.token_program", type: '"spl-token" | "token-2022"', is: "Which token program it uses.", howWorkedOut: "The owner of the token's account." },
    { field: "about.who_can_mint", type: "string | null", is: "Who can create more tokens. null means nobody (fixed supply).", howWorkedOut: "The on-chain mint authority." },
    { field: "about.who_can_freeze", type: "string | null", is: "Who can freeze holders' tokens. null means nobody.", howWorkedOut: "The on-chain freeze authority." },
    { field: "about.extensions", type: "string[]", is: "Token-2022 extensions turned on.", howWorkedOut: "Read from the token's account." },
    { field: "about.usd_price / liquidity_usd / holders / top10_share_pct / first_traded", type: "number | string | null", is: "Market facts the checks use.", howWorkedOut: "Jupiter token data. top10_share_pct is the share the 10 biggest holders own. first_traded is when its first pool was made." },
    { field: "about.creator / creator_tokens_launched", type: "string | number | null", is: "The wallet that created the token, and how many tokens it has launched.", howWorkedOut: "Jupiter token data." },
    { field: "about.metadata_can_change", type: "boolean | null", is: "Whether the name and logo can still be changed.", howWorkedOut: "RugCheck's report of the token's metadata." },
    { field: "checks[].name", type: "string", is: "Which check: sell_test, liquidity_pull, creator_history, insiders, metadata, verified, mint_authority, freeze_authority, extension:<name>, liquidity, holder_concentration, age, known_stablecoin, market_data or rugcheck_data.", howWorkedOut: "A fixed list. market_data or rugcheck_data (warn) shows up only when Jupiter or RugCheck can't be reached. The checks that need them are then skipped, not guessed." },
    { field: "checks[].result", type: '"pass" | "info" | "warn" | "fail"', is: "How the check came out. info means notable but expected, like a regulated stablecoin's freeze power.", howWorkedOut: "Sell test: fail if the token blocked a real holder's simulated sale, warn if there's no route to sell or it failed for another reason. Liquidity pull: fail when over 20% of the liquidity is unlocked and comes from 1 or 2 providers (warn for verified tokens), warn for 3 to 9 providers, info for established tokens (Jupiter-verified and trading 90+ days). Creator: fail if they have rugged before, warn if an unverified token's creator launched 20+ tokens or still holds over 20%. Insiders: warn over 10% of supply, fail over 30%, counting only networks of up to 500 wallets; unknown (info) when RugCheck's numbers add up to more than the whole supply. Metadata: warn if an unverified token's name and logo can change. Liquidity: fail under $10k, warn under $100k. Top 10 holders: warn over 50%, fail over 80% (established tokens: info up to 80%, warn over; info for known stablecoins and Jupiter-verified liquid staking tokens). Age: warn under 24 hours. Permanent delegate fails, except a known issuer's delegate (xStocks, Backpack Securities, Paxos), which warns and names the issuer. Frozen-by-default and non-transferable fail. Mint and freeze powers warn unless it's a known stablecoin or an established token (Jupiter-verified and trading 90+ days), where they are info and name who holds them." },
    { field: "checks[].detail", type: "string", is: "The fact behind the result, in plain words.", howWorkedOut: "Built from the data." },
    { field: "checks[].source", type: '"on-chain" | "jupiter" | "rugcheck" | "simulation"', is: "Where the fact came from.", howWorkedOut: "on-chain for token data, jupiter for market and creator data, rugcheck for liquidity locks, insiders and creator history, simulation for the sell test." },
    { field: "history", type: "object | null", is: "What changed since Pulse first checked this token, when Pulse has been watching it. null when it hasn't.", howWorkedOut: "Pulse watches young tokens (under 3 days old) for 7 days after it first checks them, whether it found them on Jupiter's activity lists or someone ran token_safety on them, and re-reads them every 2 hours. Checking a young token starts the watch, so a later check shows what changed." },
    { field: "history.watched_since / watching_until / verdict_then / found_in", type: "string", is: "When the watch started and ends, the verdict Pulse gave then, and how the token was found.", howWorkedOut: "Stored when the watch started." },
    { field: "history.then / latest", type: "object", is: "The first and the newest reading: listed, liquidity_usd, usd_price, holders, top10_share_pct, who_can_mint, who_can_freeze (latest also has at).", howWorkedOut: "then is what this tool reported when the watch started. latest comes from Jupiter (market numbers) and the chain (authorities). A value no source answered is null." },
    { field: "history.changes[]", type: "{ at, what, result, detail, source }[]", is: "Each change once, at the first reading that showed it: liquidity_pulled (fail), price_crashed (fail), liquidity_halved, holders_halved, top10_up, mint_authority_moved, freeze_authority_moved (warn), or mint_authority_revoked / freeze_authority_revoked (info).", howWorkedOut: "Liquidity pulled: down 90%+ or no longer listed by Jupiter while Jupiter answers. Price crashed: down 90%+. Halved: down 50%+. Top 10 up: their share rose 15+ points. Authorities: a different wallet now holds the power, or it was revoked. Empty means no change crossed those lines." },
  ],
  notes: [
    "The check doesn't make a token safe, and it can't. It looks for the known ways people get robbed with a token. \"SAFE\" really means \"none of the traps we know about are present.\" Every rule exists because it matches a real scam.",
    "It can't catch everything, such as a team abandoning a project or insiders it has no data on, and SAFE says nothing about whether the price will rise or fall.",
    "history is not part of the verdict: the verdict is about the token now; history shows how it got here. Liquidity pulled since Pulse first saw it is the classic rug.",
    "The sell test sells about $20 from a real holder's wallet in a simulation only: nothing is sent, and no funds move.",
    "Top-holder share counts accounts, which can include exchanges and liquidity pools.",
    "Established tokens (Jupiter-verified and trading for 90+ days) are judged on traps, not on how they're run: a mint or freeze authority, unlocked liquidity and a big treasury show up as info naming who holds them, because bridges, issuers and market makers run real tokens that way. New tokens get the strict checks, since that's when liquidity gets pulled.",
  ],
  example: async () => ({ token: BONK_MINT }),
  run: async ({ token, network }, ctx) => {
    const mintAddress = assertAddress(token, "token");
    const conn = ctx.connection(network);
    const [account, market, rug] = await Promise.all([conn.getParsedAccountInfo(new PublicKey(mintAddress), "confirmed"), jupLookup(ctx, mintAddress), rugReport(ctx, mintAddress)]);
    const jupList = market.tokens;
    const owner = account.value?.owner.toBase58();
    const parsed: any = (account.value?.data as any)?.parsed;
    if (!account.value) throw new ToolError(404, `Token ${mintAddress} does not exist on this network.`, "Check the address (find_token) and network.");
    if ((owner !== TOKEN_PROGRAM && owner !== TOKEN_2022_PROGRAM) || parsed?.type !== "mint") throw new ToolError(422, `${mintAddress} is not a token address.`, "Pass a token address. whats_this shows what this address is.");
    const info = parsed.info;
    const j = jupList.find((t) => t.id === mintAddress);
    const stable = KNOWN_STABLECOINS[mintAddress] ?? null;
    const verified = j?.isVerified === true;
    const firstPoolAt = j?.firstPool?.createdAt ?? null;
    // Established: Jupiter-verified and trading for ESTABLISHED_DAYS or more. For these, a mint or freeze authority, unlocked
    // liquidity and a big treasury are how bridges, issuers and market makers normally run a token (WBTC, cbBTC, ETH, RAY),
    // not a trap: in the Oct 2026 audit they kept 36 of 61 well-known tokens from SAFE. The checks stay strict for new
    // tokens because that's when liquidity gets pulled (LIBRA, Feb 2025, within hours of launch).
    const established = verified && !!firstPoolAt && (Date.now() - Date.parse(firstPoolAt)) / 864e5 >= ESTABLISHED_DAYS;
    const expected = established ? ` Expected for an established token (Jupiter-verified, trading since ${firstPoolAt!.slice(0, 10)}); you are trusting whoever holds it.` : "";
    const extensions: any[] = info.extensions ?? [];
    const checks: Check[] = [];
    const add = (name: string, result: Check["result"], detail: string, source: Check["source"]) => checks.push({ name, result, detail, source });

    if (stable) add("known_stablecoin", "info", `${stable}: issuer powers below are expected for a regulated stablecoin.`, "on-chain");
    if (!market.ok) add("market_data", "warn", "Market data (Jupiter) is unavailable right now, so verification, liquidity, holder concentration and age were not checked. Retry for a full verdict.", "jupiter");
    else add("verified", j?.isVerified ? "pass" : "warn", j?.isVerified ? "Listed as verified by Jupiter." : j ? "Not verified by Jupiter. Many scam tokens are unverified." : "Jupiter has no data on this token; it may be brand new or untraded.", "jupiter");
    add("mint_authority", info.mintAuthority ? (stable || established ? "info" : "warn") : "pass", info.mintAuthority ? `${info.mintAuthority} can mint unlimited new tokens, diluting holders.${stable ? "" : expected}` : "Mint authority revoked: supply is fixed.", "on-chain");
    add("freeze_authority", info.freezeAuthority ? (stable || established ? "info" : "warn") : "pass", info.freezeAuthority ? `${info.freezeAuthority} can freeze any holder's tokens.${stable ? "" : expected}` : "Freeze authority revoked: nobody can freeze holders.", "on-chain");
    for (const ext of extensions) {
      const rule = EXTENSION_RULES[ext.extension];
      const result = rule?.(ext, stable);
      if (result) add(`extension:${ext.extension}`, result.result, result.detail, "on-chain");
    }
    if (typeof j?.liquidity === "number") {
      const liq = j.liquidity;
      add("liquidity", liq < 10_000 ? "fail" : liq < 100_000 ? "warn" : "pass", `About $${Math.round(liq).toLocaleString("en-US")} of DEX liquidity.${liq < 100_000 ? " Trades of a few hundred dollars can move the price sharply, and exits may be hard." : ""}`, "jupiter");
    } else if (!stable && market.ok) {
      // No liquidity data is a warning unless Jupiter's router also says the token can't be traded: then it's a fact
      // that there's no market to sell into. In a study of one real beginner's first wallet (Oct 2026, 598 tokens bought,
      // mostly in 2023) 305 of 315 tokens with no market left were only CAUTION. Where Jupiter can't be asked, it stays a
      // warning.
      const dead = network === "mainnet-beta" ? await jupiterSaysNotTradable(ctx, mintAddress, BigInt(info.supply)) : null;
      add("liquidity", dead ? "fail" : "warn", dead ? "No market: Jupiter has no liquidity for this token and says it is not tradable, so you likely can't sell it." : "No liquidity data; the token may be untradeable.", "jupiter");
    }
    const top = j?.audit?.topHoldersPercentage;
    if (typeof top === "number") {
      // Stablecoins are redeemable at the issuer, so concentration in exchange and treasury wallets is not a price risk.
      if (stable) add("holder_concentration", "info", `Top 10 holders own ${top.toFixed(1)}% of supply, mostly exchanges and issuer treasury; normal for a redeemable stablecoin.`, "jupiter");
      // A liquid staking token can be redeemed for its staked SOL at the stake pool, so big holders (lending vaults,
      // pools) selling can't crash it the way they crash a memecoin. Only verified ones, so a fake can't claim the tag.
      // 27 of 29 LSTs judged AVOID in the Oct 2026 audit failed on this check alone or with low liquidity.
      else if (verified && j?.tags?.includes("lst")) add("holder_concentration", "info", `Top 10 holders own ${top.toFixed(1)}% of supply. Jupiter lists it as a verified liquid staking token, which can be redeemed for its staked SOL, so a few big holders selling is not the crash risk it is for other tokens.`, "jupiter");
      else if (established && top > 50) add("holder_concentration", top > 80 ? "warn" : "info", `Top 10 holders own ${top.toFixed(1)}% of supply.${top > 80 ? " A few wallets selling could crash the price." : " Usually treasuries, vesting, exchanges and pools for an established token (Jupiter-verified, trading 90+ days)."}`, "jupiter");
      else add("holder_concentration", top > 80 ? "fail" : top > 50 ? "warn" : "pass", `Top 10 holders own ${top.toFixed(1)}% of supply.${top > 50 ? " A few wallets selling could crash the price." : ""}`, "jupiter");
    }
    if (firstPoolAt) {
      const ageHours = (Date.now() - Date.parse(firstPoolAt)) / 3.6e6;
      add("age", ageHours < 24 ? "warn" : "pass", ageHours < 24 ? `First traded ${Math.max(Math.round(ageHours), 0)} hour(s) ago. Most rug pulls happen in the first day.` : `Trading since ${firstPoolAt.slice(0, 10)}.`, "jupiter");
    }

    // The deeper checks: who can pull the liquidity, the creator's record, insider networks, the name and logo, and a
    // real sale. Stablecoins skip the ones that don't apply to a redeemable, regulated token.
    // RugCheck sometimes can't build a report for very large tokens. For a verified token that's a note, since Jupiter's
    // verification already screens out most scams; for an unverified one, the missing checks matter, so it's a warning.
    if (!rug.ok && !stable) add("rugcheck_data", verified ? "info" : "warn", `RugCheck is unavailable for this token right now, so liquidity locks, insider wallets and the creator's rug history were not checked.${verified ? "" : " Retry for a full verdict."}`, "rugcheck");
    if (rug.report && !stable) {
      const pull = liquidityPullCheck(rug.report, verified);
      if (pull) add("liquidity_pull", established && pull.result === "warn" ? "info" : pull.result, `${pull.detail}${established && pull.result === "warn" ? expected : ""}`, "rugcheck");
      const insiders = insiderCheck(rug.report, BigInt(info.supply));
      if (insiders) add("insiders", insiders.result, insiders.detail, "rugcheck");
    }
    if (!stable) {
      const creator = creatorCheck(rug.report, j, verified);
      if (creator) add("creator_history", creator.result, creator.detail, rug.report ? "rugcheck" : "jupiter");
    }
    if (rug.report) {
      const meta = metadataCheck(rug.report, verified, stable);
      if (meta) add("metadata", meta.result, meta.detail, "rugcheck");
    }
    if (!stable && network === "mainnet-beta") {
      const sell = await sellCheck(ctx, conn, mintAddress, Number(info.decimals), typeof j?.usdPrice === "number" ? j.usdPrice : null);
      add("sell_test", sell.result, sell.detail, "simulation");
    }

    const fails = checks.filter((c) => c.result === "fail");
    const warns = checks.filter((c) => c.result === "warn");
    const verdict = fails.length ? "AVOID" : warns.length ? "CAUTION" : "SAFE";
    const summary = fails.length ? `AVOID: ${fails.map((c) => c.detail).join(" ")}` : warns.length ? `CAUTION: ${warns.map((c) => c.detail).join(" ")}` : safeSummary(checks);
    return {
      token: mintAddress, network, verdict, summary,
      about: {
        symbol: j?.symbol ?? null, name: j?.name ?? null, decimals: Number(info.decimals), supply: formatUnits(info.supply, info.decimals),
        token_program: owner === TOKEN_PROGRAM ? "spl-token" : "token-2022", who_can_mint: info.mintAuthority ?? null, who_can_freeze: info.freezeAuthority ?? null,
        extensions: extensions.map((e) => e.extension), usd_price: j?.usdPrice ?? null, liquidity_usd: typeof j?.liquidity === "number" ? Math.round(j.liquidity) : null,
        holders: j?.holderCount ?? null, top10_share_pct: typeof top === "number" ? Math.round(top * 10) / 10 : null, first_traded: firstPoolAt,
        creator: j?.dev ?? rug.report?.creator ?? null, creator_tokens_launched: typeof j?.audit?.devMints === "number" ? j.audit.devMints : null,
        metadata_can_change: typeof rug.report?.tokenMeta?.mutable === "boolean" ? rug.report.tokenMeta.mutable : null,
      },
      checks,
    };
  },
};

export const TOKEN_TOOLS = [resolveToken, tokenVerdict];
