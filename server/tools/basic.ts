// Basic reads plus the helpers that prevent the most common agent mistakes.
import { PublicKey } from "@solana/web3.js";
import { getAccountLenForMint, getAssociatedTokenAddressSync, getMint } from "@solana/spl-token";
import { z } from "zod";
import { explainError } from "./errors";
import {
  assertAddress, EXAMPLE_WALLET, formatUnits, isoTime, jupByMints, jupSearch, labelFor, lamportsToSol,
  NATIVE_MINT, NETWORK_DOC, parseUnits, SYSTEM_PROGRAM, TOKEN_2022_PROGRAM, TOKEN_PROGRAM, USDC_MINT,
} from "./lib";
import { ToolError, type ToolDef } from "./types";

const NETWORK = z.enum(["mainnet-beta", "devnet"]).optional().default("mainnet-beta");
const WALLET_DOC = (what: string) => ({
  name: "wallet", type: "string (base58 address)", required: true,
  description: `The wallet whose ${what} to read.`,
  howToGet: "The user's wallet address (from their wallet app or your agent's signer public key). Not a .sol name or ticker.",
});

export const getSolanaBalance: ToolDef = {
  name: "get_solana_balance",
  title: "SOL balance",
  category: "wallets",
  benefit: { kind: "accuracy", text: "Reads the live balance instead of one remembered from earlier in a conversation, so the agent never builds a transfer the wallet can't cover." },
  useWhen: "Use before sending SOL or paying fees, to confirm the wallet really holds enough. Never rely on a balance remembered from earlier in a conversation.",
  description: "Reads a wallet's native SOL balance directly from the chain.",
  inputs: { wallet: z.string(), network: NETWORK },
  inputDocs: [WALLET_DOC("SOL balance"), NETWORK_DOC],
  outputs: [
    { field: "wallet", type: "string", meaning: "The wallet that was read.", howComputed: "Your input, normalized to canonical base58." },
    { field: "network", type: "string", meaning: "The cluster that was read.", howComputed: "Your input, defaulting to mainnet-beta." },
    { field: "lamports", type: "string (integer)", meaning: "Balance in lamports, the smallest SOL unit (1 SOL = 1,000,000,000 lamports).", howComputed: "RPC getBalance at confirmed commitment. Returned as a string so large values stay exact." },
    { field: "sol", type: "string (decimal)", meaning: "The same balance in SOL.", howComputed: "lamports divided by 10^9 with exact integer math (no floating-point rounding)." },
    { field: "slot", type: "number", meaning: "The chain slot the balance was read at.", howComputed: "The context slot returned with getBalance; higher means more recent." },
  ],
  example: async () => ({ wallet: EXAMPLE_WALLET }),
  run: async ({ wallet, network }, ctx) => {
    const address = assertAddress(wallet, "wallet");
    const { value, context } = await ctx.connection(network).getBalanceAndContext(new PublicKey(address), "confirmed");
    return { wallet: address, network, lamports: String(value), sol: lamportsToSol(value), slot: context.slot };
  },
};

export const getTokenAccounts: ToolDef = {
  name: "get_token_accounts",
  title: "Token holdings",
  category: "wallets",
  benefit: { kind: "accuracy", text: "Ranks holdings by USD value and flags unverified tokens, so an agent doesn't report a wallet's spam airdrops as real holdings." },
  useWhen: "Use when you need to know which tokens a wallet holds and how much. Ranks by USD value and flags unverified (often spam airdrop) tokens so you do not report fake holdings.",
  description: "Lists a wallet's SPL Token and Token-2022 holdings with exact amounts, verification status and USD value where a price exists.",
  inputs: { wallet: z.string(), limit: z.number().int().min(1).max(100).optional().default(25), includeZero: z.boolean().optional().default(false), network: NETWORK },
  inputDocs: [
    WALLET_DOC("token holdings"),
    { name: "limit", type: "integer 1-100", required: false, description: "Maximum tokens to return, highest USD value first. Default 25.", howToGet: "Leave out for the top 25." },
    { name: "includeZero", type: "boolean", required: false, description: "Include empty token accounts. Default false.", howToGet: "Set true only when you need to find empty accounts (for example to close them)." },
    NETWORK_DOC,
  ],
  outputs: [
    { field: "wallet", type: "string", meaning: "The wallet that was read.", howComputed: "Your input, normalized." },
    { field: "totalTokenAccounts", type: "number", meaning: "Every token account the wallet owns, including empty ones.", howComputed: "Count of getParsedTokenAccountsByOwner results across the SPL Token and Token-2022 programs." },
    { field: "nonZeroAccounts", type: "number", meaning: "Token accounts holding a balance above zero.", howComputed: "Accounts whose raw amount is greater than 0." },
    { field: "returned", type: "number", meaning: "How many tokens are in this response.", howComputed: "Up to limit, after sorting." },
    { field: "unverifiedCount", type: "number", meaning: "Returned tokens that Jupiter does not mark verified. Large counts usually mean spam airdrops.", howComputed: "Tokens whose Jupiter isVerified flag is not true, or that Jupiter does not know." },
    { field: "totalValueUsd", type: "number", meaning: "Combined USD value of the returned tokens that are verified and have a price. Spam airdrops often carry a price from a tiny pool, so unverified tokens are left out.", howComputed: "Sum of tokens[].valueUsd for verified tokens. Unpriced tokens add nothing, so this can understate the real value." },
    { field: "unverifiedValueUsd", type: "number", meaning: "The claimed USD value of returned unverified tokens, reported separately. Treat it as unreliable.", howComputed: "Sum of tokens[].valueUsd for tokens that are not verified." },
    { field: "tokens[].mint", type: "string", meaning: "The token's mint address, its unique identity. Tickers are not unique; mints are.", howComputed: "From the parsed token account." },
    { field: "tokens[].symbol", type: "string | null", meaning: "Ticker reported by Jupiter. Copycat tokens can share tickers, so trust the mint, not the symbol.", howComputed: "Jupiter token search by mint." },
    { field: "tokens[].verified", type: "boolean", meaning: "Whether Jupiter lists the token as verified.", howComputed: "Jupiter isVerified flag; false when unknown." },
    { field: "tokens[].amount", type: "string (decimal)", meaning: "Human-readable balance.", howComputed: "amountRaw divided by 10^decimals with exact integer math." },
    { field: "tokens[].amountRaw", type: "string (integer)", meaning: "Balance in base units, the number that goes into transfer instructions.", howComputed: "tokenAmount.amount from the parsed token account." },
    { field: "tokens[].decimals", type: "number", meaning: "How many decimal places the token uses.", howComputed: "From the parsed token account (copied from the mint)." },
    { field: "tokens[].tokenAccount", type: "string", meaning: "The account that holds this balance (not the wallet).", howComputed: "The token account's address." },
    { field: "tokens[].tokenProgram", type: '"spl-token" | "token-2022"', meaning: "Which token program owns the account. Transfers must use the same program.", howComputed: "Which program's query returned the account." },
    { field: "tokens[].frozen", type: "boolean", meaning: "True if the issuer froze this account; frozen tokens cannot move.", howComputed: 'Parsed account state equals "frozen".' },
    { field: "tokens[].usdPrice", type: "number | null", meaning: "Price per token in USD.", howComputed: "Jupiter usdPrice; null when Jupiter has no price." },
    { field: "tokens[].valueUsd", type: "number | null", meaning: "USD value of this holding.", howComputed: "amount x usdPrice, rounded to cents; null without a price." },
  ],
  notes: ["Prices come from Jupiter and can lag or be missing for thin tokens.", "Very large wallets are capped: prices are looked up for at most 300 tokens."],
  example: async () => ({ wallet: EXAMPLE_WALLET, limit: 10 }),
  run: async ({ wallet, limit, includeZero, network }, ctx) => {
    const owner = new PublicKey(assertAddress(wallet, "wallet"));
    const conn = ctx.connection(network);
    const [classic, t22] = await Promise.all([
      conn.getParsedTokenAccountsByOwner(owner, { programId: new PublicKey(TOKEN_PROGRAM) }, "confirmed"),
      conn.getParsedTokenAccountsByOwner(owner, { programId: new PublicKey(TOKEN_2022_PROGRAM) }, "confirmed"),
    ]);
    const all = [...classic.value.map((a) => ({ a, program: "spl-token" })), ...t22.value.map((a) => ({ a, program: "token-2022" }))].map(({ a, program }) => {
      const info = (a.account.data as any).parsed.info;
      return { mint: info.mint as string, tokenAccount: a.pubkey.toBase58(), tokenProgram: program, amountRaw: String(info.tokenAmount.amount), decimals: Number(info.tokenAmount.decimals), frozen: info.state === "frozen" };
    });
    const nonZero = all.filter((t) => BigInt(t.amountRaw) > 0n);
    const pool = includeZero ? all : nonZero;
    const jup = await jupByMints(ctx, pool.slice(0, 300).map((t) => t.mint));
    const tokens = pool.map((t) => {
      const j = jup.get(t.mint);
      const amount = formatUnits(t.amountRaw, t.decimals);
      const usdPrice = typeof j?.usdPrice === "number" ? j.usdPrice : null;
      const valueUsd = usdPrice !== null ? Math.round(Number(amount) * usdPrice * 100) / 100 : null;
      return { mint: t.mint, symbol: j?.symbol ?? null, name: j?.name ?? null, verified: j?.isVerified === true, amount, amountRaw: t.amountRaw, decimals: t.decimals, tokenAccount: t.tokenAccount, tokenProgram: t.tokenProgram, frozen: t.frozen, usdPrice, valueUsd };
    }).sort((x, y) => (y.valueUsd ?? -1) - (x.valueUsd ?? -1) || Number(y.verified) - Number(x.verified)).slice(0, limit);
    return {
      wallet: owner.toBase58(), network, totalTokenAccounts: all.length, nonZeroAccounts: nonZero.length, returned: tokens.length,
      unverifiedCount: tokens.filter((t) => !t.verified).length,
      totalValueUsd: Math.round(tokens.reduce((sum, t) => sum + (t.verified ? t.valueUsd ?? 0 : 0), 0) * 100) / 100,
      unverifiedValueUsd: Math.round(tokens.reduce((sum, t) => sum + (t.verified ? 0 : t.valueUsd ?? 0), 0) * 100) / 100,
      tokens,
    };
  },
};

export const getRecentTransactions: ToolDef = {
  name: "get_recent_transactions",
  title: "Recent transactions",
  category: "wallets",
  benefit: { kind: "accuracy", text: "Returns real signatures. Models can produce realistic-looking fake ones, which then fail every lookup that follows." },
  useWhen: "Use to find a wallet's recent activity or a real transaction signature to inspect. Never invent a signature; get one here.",
  description: "Lists a wallet's most recent transaction signatures, newest first, with status and a plain-language error name for failures.",
  inputs: { wallet: z.string(), limit: z.number().int().min(1).max(50).optional().default(10), network: NETWORK },
  inputDocs: [WALLET_DOC("transactions"), { name: "limit", type: "integer 1-50", required: false, description: "How many signatures to return. Default 10.", howToGet: "Leave out for the latest 10." }, NETWORK_DOC],
  outputs: [
    { field: "wallet", type: "string", meaning: "The wallet that was read.", howComputed: "Your input, normalized." },
    { field: "count", type: "number", meaning: "Number of signatures returned.", howComputed: "Length of the list." },
    { field: "failedCount", type: "number", meaning: "How many of them failed on chain (failed transactions still pay fees).", howComputed: "Entries with a non-null error." },
    { field: "transactions[].signature", type: "string", meaning: "The transaction's unique id. Pass it to explain_transaction.", howComputed: "RPC getSignaturesForAddress." },
    { field: "transactions[].time", type: "string | null", meaning: "When the block was produced (UTC).", howComputed: "blockTime converted to ISO 8601; null if the node does not know it." },
    { field: "transactions[].slot", type: "number", meaning: "Slot the transaction landed in.", howComputed: "From getSignaturesForAddress." },
    { field: "transactions[].status", type: '"success" | "failed"', meaning: "Whether the transaction succeeded.", howComputed: "failed when the RPC reports an error object." },
    { field: "transactions[].error", type: "string | null", meaning: "Short name of the failure, e.g. InsufficientFundsForRent.", howComputed: "The first explanation from explain_error applied to the raw error; the raw error text when unrecognized." },
    { field: "transactions[].memo", type: "string | null", meaning: "Memo text attached to the transaction, if any.", howComputed: "The memo field from getSignaturesForAddress." },
  ],
  example: async () => ({ wallet: EXAMPLE_WALLET, limit: 5 }),
  run: async ({ wallet, limit, network }, ctx) => {
    const address = assertAddress(wallet, "wallet");
    const sigs = await ctx.connection(network).getSignaturesForAddress(new PublicKey(address), { limit }, "confirmed");
    const transactions = sigs.map((s) => ({
      signature: s.signature, time: isoTime(s.blockTime), slot: s.slot, status: s.err ? "failed" : "success",
      error: s.err ? (explainError(s.err).matches[0]?.name ?? JSON.stringify(s.err)) : null, memo: s.memo ?? null,
    }));
    return { wallet: address, network, count: transactions.length, failedCount: transactions.filter((t) => t.status === "failed").length, transactions };
  },
};

export const getSolanaBlockhash: ToolDef = {
  name: "get_solana_blockhash",
  title: "Latest blockhash",
  category: "network",
  benefit: { kind: "money", text: "Says how many seconds the blockhash has left. Transactions built on an expired blockhash are rejected after the agent has already done the work." },
  useWhen: "Use right before building a transaction you will sign. Blockhashes expire after about 60-90 seconds; this tells you how much time is left.",
  description: "Returns a fresh blockhash plus how many blocks and roughly how many seconds remain before it expires.",
  inputs: { network: NETWORK },
  inputDocs: [NETWORK_DOC],
  outputs: [
    { field: "blockhash", type: "string", meaning: "The recent blockhash to put in your transaction.", howComputed: "RPC getLatestBlockhash at confirmed commitment." },
    { field: "lastValidBlockHeight", type: "number", meaning: "The transaction is rejected once the chain passes this block height.", howComputed: "Returned with the blockhash." },
    { field: "currentBlockHeight", type: "number", meaning: "The chain's block height right now.", howComputed: "RPC getBlockHeight at confirmed commitment." },
    { field: "blocksRemaining", type: "number", meaning: "Blocks left before the blockhash expires.", howComputed: "lastValidBlockHeight minus currentBlockHeight." },
    { field: "approxSecondsRemaining", type: "number", meaning: "Rough time left to sign and send.", howComputed: "blocksRemaining x 0.4 seconds (the target block time). Real block times vary, so leave a margin." },
  ],
  example: async () => ({}),
  run: async ({ network }, ctx) => {
    const conn = ctx.connection(network);
    const [latest, height] = await Promise.all([conn.getLatestBlockhash("confirmed"), conn.getBlockHeight("confirmed")]);
    const blocksRemaining = Math.max(latest.lastValidBlockHeight - height, 0);
    return { network, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight, currentBlockHeight: height, blocksRemaining, approxSecondsRemaining: Math.round(blocksRemaining * 0.4) };
  },
};

async function readMintProgram(conn: ReturnType<import("./types").ToolContext["connection"]>, mint: string) {
  const info = await conn.getParsedAccountInfo(new PublicKey(mint), "confirmed");
  const owner = info.value?.owner.toBase58();
  const parsed: any = (info.value?.data as any)?.parsed;
  if (!info.value) throw new ToolError(404, `Mint ${mint} does not exist on this network.`, "Check the mint address (resolve_token) and the network.");
  if ((owner !== TOKEN_PROGRAM && owner !== TOKEN_2022_PROGRAM) || parsed?.type !== "mint") {
    throw new ToolError(422, `${mint} is not a token mint.`, "Pass the token's mint address. inspect_address shows what this address actually is.");
  }
  return { programId: owner, info: parsed.info };
}

export const findAta: ToolDef = {
  name: "find_ata",
  title: "Token account address",
  category: "tokens",
  benefit: { kind: "money", text: "Derives the token account with the mint's real token program and prices creating it, so tokens aren't sent to a made-up or wrong-program address." },
  useWhen: "Use before sending a token to someone. Token transfers go to the recipient's token account, not their wallet; models cannot derive this address in their heads.",
  description: "Derives the associated token account (ATA) for a wallet and mint using the mint's real token program, checks whether it exists, and prices creating it if not.",
  inputs: { wallet: z.string(), mint: z.string(), network: NETWORK },
  inputDocs: [
    { name: "wallet", type: "string (base58 address)", required: true, description: "The owner of the token account (usually the recipient).", howToGet: "The recipient's wallet address." },
    { name: "mint", type: "string (base58 address)", required: true, description: "The token's mint address.", howToGet: "From resolve_token or get_token_accounts. Not a ticker." },
    NETWORK_DOC,
  ],
  outputs: [
    { field: "ataAddress", type: "string", meaning: "The recipient's token account for this token. Send tokens here.", howComputed: "getAssociatedTokenAddressSync(mint, wallet) with the token program that owns the mint." },
    { field: "tokenProgram", type: '"spl-token" | "token-2022"', meaning: "The token program the transfer must use.", howComputed: "The owner program of the mint account." },
    { field: "exists", type: "boolean", meaning: "Whether the account is already created on chain.", howComputed: "getParsedAccountInfo on ataAddress." },
    { field: "balance", type: "string | null", meaning: "Current balance in the account, when it exists.", howComputed: "Parsed token amount, formatted with the mint's decimals." },
    { field: "decimals", type: "number", meaning: "The token's decimals.", howComputed: "From the mint account." },
    { field: "createCostLamports", type: "string | null", meaning: "SOL deposit (in lamports) needed to create the account when it does not exist. Refunded if the account is later closed.", howComputed: "getMinimumBalanceForRentExemption(account size), where the size accounts for the mint's Token-2022 extensions." },
    { field: "createCostSol", type: "string | null", meaning: "The same deposit in SOL.", howComputed: "createCostLamports / 10^9." },
    { field: "ownerIsPda", type: "boolean", meaning: "True when the owner address is a program-derived address (not a normal wallet). Fine for protocols, unusual for people.", howComputed: "PublicKey.isOnCurve(wallet) is false." },
  ],
  example: async () => ({ wallet: EXAMPLE_WALLET, mint: USDC_MINT }),
  run: async ({ wallet, mint, network }, ctx) => {
    const owner = new PublicKey(assertAddress(wallet, "wallet"));
    const mintKey = new PublicKey(assertAddress(mint, "mint"));
    const conn = ctx.connection(network);
    const { programId, info } = await readMintProgram(conn, mintKey.toBase58());
    const programKey = new PublicKey(programId);
    const ata = getAssociatedTokenAddressSync(mintKey, owner, true, programKey);
    const account = await conn.getParsedAccountInfo(ata, "confirmed");
    const exists = Boolean(account.value);
    let createCostLamports: string | null = null;
    if (!exists) {
      const mintInfo = await getMint(conn, mintKey, "confirmed", programKey);
      createCostLamports = String(await conn.getMinimumBalanceForRentExemption(getAccountLenForMint(mintInfo)));
    }
    const parsed: any = (account.value?.data as any)?.parsed?.info;
    return {
      wallet: owner.toBase58(), mint: mintKey.toBase58(), network, ataAddress: ata.toBase58(),
      tokenProgram: programId === TOKEN_PROGRAM ? "spl-token" : "token-2022", exists,
      balance: parsed ? formatUnits(parsed.tokenAmount.amount, parsed.tokenAmount.decimals) : null,
      decimals: Number(info.decimals), createCostLamports, createCostSol: createCostLamports ? lamportsToSol(createCostLamports) : null,
      ownerIsPda: !PublicKey.isOnCurve(owner.toBytes()),
    };
  },
};

export const inspectAddress: ToolDef = {
  name: "inspect_address",
  title: "What is this address?",
  category: "reference",
  benefit: { kind: "money", text: "Tells a normal wallet from a mint, program or token account. Sending SOL to a mint or program by mistake leaves it stuck." },
  useWhen: "Use when you are not sure what an address is before sending to it or passing it to another tool. Sending SOL to a mint or program address can leave funds stuck.",
  description: "Classifies any address: normal wallet, token account, token mint, program, stake account and more, with the key facts for each.",
  inputs: { address: z.string(), network: NETWORK },
  inputDocs: [{ name: "address", type: "string (base58 address)", required: true, description: "Any Solana address.", howToGet: "Whatever address you are about to use." }, NETWORK_DOC],
  outputs: [
    { field: "exists", type: "boolean", meaning: "Whether any account lives at this address. A wallet that has never received SOL does not exist yet.", howComputed: "getParsedAccountInfo returned a value." },
    { field: "kind", type: "string", meaning: "wallet, token_account, mint, program, program_data, stake_account, vote_account, lookup_table, program_owned_account or not_found.", howComputed: "From the owner program, executable flag and parsed data type." },
    { field: "explanation", type: "string", meaning: "Plain-language description of the kind and what is safe to do with it.", howComputed: "Fixed text per kind." },
    { field: "lamports", type: "string", meaning: "SOL held by the account, in lamports.", howComputed: "Account lamports." },
    { field: "sol", type: "string", meaning: "The same in SOL.", howComputed: "lamports / 10^9." },
    { field: "owner", type: "string | null", meaning: "The program that owns the account.", howComputed: "Account owner." },
    { field: "ownerLabel", type: "string | null", meaning: "Friendly name of the owner program when known.", howComputed: "Lookup in the gateway's program label table." },
    { field: "executable", type: "boolean", meaning: "True for program accounts.", howComputed: "Account executable flag." },
    { field: "onCurve", type: "boolean", meaning: "True for addresses that have a private key (normal keypairs). False for program-derived addresses, which cannot sign.", howComputed: "PublicKey.isOnCurve." },
    { field: "details", type: "object", meaning: "Kind-specific facts: for token accounts mint/owner/amount/delegate; for mints decimals/supply/authorities.", howComputed: "From the parsed account data." },
  ],
  example: async () => ({ address: USDC_MINT }),
  run: async ({ address, network }, ctx) => {
    const key = new PublicKey(assertAddress(address, "address"));
    const res = await ctx.connection(network).getParsedAccountInfo(key, "confirmed");
    const onCurve = PublicKey.isOnCurve(key.toBytes());
    if (!res.value) return { address: key.toBase58(), network, exists: false, kind: "not_found", explanation: "No account exists here. A wallet address that has never received SOL looks like this; sending SOL creates it.", lamports: "0", sol: "0", owner: null, ownerLabel: null, executable: false, onCurve, details: {} };
    const acc = res.value;
    const owner = acc.owner.toBase58();
    const parsed: any = (acc.data as any)?.parsed;
    const dataLength = Array.isArray(acc.data) ? Buffer.from(acc.data[0] as string, "base64").length : (acc.data as any)?.space ?? null;
    let kind = "program_owned_account";
    let explanation = `Data account owned by ${labelFor(owner) ?? owner}. Do not send funds here unless that program's docs say to.`;
    let details: Record<string, unknown> = {};
    if (acc.executable) { kind = "program"; explanation = "An on-chain program. Never send funds to a program address."; }
    else if (owner === SYSTEM_PROGRAM && !dataLength) { kind = "wallet"; explanation = onCurve ? "A normal wallet. Safe to send SOL; send tokens to its token account (find_ata)." : "A system-owned program-derived address. Funds sent here are controlled by a program, not a person."; }
    else if ((owner === TOKEN_PROGRAM || owner === TOKEN_2022_PROGRAM) && parsed?.type === "account") {
      kind = "token_account";
      const i = parsed.info;
      details = { mint: i.mint, owner: i.owner, amount: i.tokenAmount.uiAmountString, amountRaw: i.tokenAmount.amount, decimals: i.tokenAmount.decimals, state: i.state, delegate: i.delegate ?? null, delegatedAmount: i.delegatedAmount?.uiAmountString ?? null, closeAuthority: i.closeAuthority ?? null };
      explanation = "A token account (holds one token for one owner). To pay its owner in SOL, send to the owner wallet instead.";
    } else if ((owner === TOKEN_PROGRAM || owner === TOKEN_2022_PROGRAM) && parsed?.type === "mint") {
      kind = "mint";
      const i = parsed.info;
      details = { decimals: i.decimals, supply: formatUnits(i.supply, i.decimals), mintAuthority: i.mintAuthority ?? null, freezeAuthority: i.freezeAuthority ?? null, extensions: (i.extensions ?? []).map((e: any) => e.extension) };
      explanation = "A token mint (defines a token). Never send funds to a mint address; they cannot be recovered.";
    } else if (parsed?.type === "programData") { kind = "program_data"; explanation = "Holds a program's executable code. Not a destination for funds."; }
    else if (owner === "Stake11111111111111111111111111111111111111") { kind = "stake_account"; explanation = "A stake account. SOL here is staked and moves through stake instructions."; }
    else if (owner === "Vote111111111111111111111111111111111111111") { kind = "vote_account"; explanation = "A validator vote account."; }
    else if (owner === "AddressLookupTab1e1111111111111111111111111") { kind = "lookup_table"; explanation = "An address lookup table used to fit more accounts in a transaction."; }
    return { address: key.toBase58(), network, exists: true, kind, explanation, lamports: String(acc.lamports), sol: lamportsToSol(acc.lamports), owner, ownerLabel: labelFor(owner), executable: acc.executable, onCurve, details };
  },
};

export const convertAmount: ToolDef = {
  name: "convert_amount",
  title: "Convert token amounts",
  category: "tokens",
  benefit: { kind: "money", text: "5 USDC is 5,000,000 base units because USDC has 6 decimals. Getting decimals wrong sends 1,000 times too much or too little." },
  useWhen: 'Use before putting any token amount into a transaction. "5 USDC" is 5,000,000 base units; getting decimals wrong sends 1,000x too much or too little.',
  description: "Converts between human amounts and base units using the token's real on-chain decimals.",
  inputs: { mint: z.string(), amount: z.string(), direction: z.enum(["to_base_units", "to_ui"]).optional().default("to_base_units"), network: NETWORK },
  inputDocs: [
    { name: "mint", type: 'string (base58 mint) or "SOL"', required: true, description: 'The token, or "SOL" for native SOL (9 decimals).', howToGet: "From resolve_token or get_token_accounts." },
    { name: "amount", type: "string (decimal)", required: true, description: 'The amount to convert, as a string, e.g. "5" or "0.25".', howToGet: "The amount the user asked for. Pass it as a string to avoid floating-point errors." },
    { name: "direction", type: '"to_base_units" | "to_ui"', required: false, description: "to_base_units turns 5 into 5000000 (for transactions); to_ui turns base units back into a readable amount. Default to_base_units.", howToGet: "to_base_units before building a transaction; to_ui when reading raw amounts." },
    NETWORK_DOC,
  ],
  outputs: [
    { field: "mint", type: "string", meaning: "The token converted (the native mint address for SOL).", howComputed: 'Your input; "SOL" maps to So11111111111111111111111111111111111111112.' },
    { field: "symbol", type: "string | null", meaning: "Ticker from Jupiter, for display only.", howComputed: "Jupiter token search by mint." },
    { field: "decimals", type: "number", meaning: "Decimal places the token uses.", howComputed: "Read from the mint account on chain (native SOL is always 9)." },
    { field: "decimalsSource", type: "string", meaning: "Where the decimals came from, so you can trust them.", howComputed: '"on-chain mint account" or "native SOL (fixed)".' },
    { field: "baseUnits", type: "string (integer)", meaning: "The amount in base units, exactly as it goes into a transfer instruction.", howComputed: "amount x 10^decimals with exact integer math; rejects more decimal places than the token supports." },
    { field: "uiAmount", type: "string (decimal)", meaning: "The human-readable amount.", howComputed: "baseUnits / 10^decimals with exact integer math." },
    { field: "explanation", type: "string", meaning: "One sentence stating the conversion.", howComputed: "Built from the values above." },
  ],
  example: async () => ({ mint: USDC_MINT, amount: "5", direction: "to_base_units" }),
  run: async ({ mint, amount, direction, network }, ctx) => {
    const isSol = typeof mint === "string" && mint.trim().toUpperCase() === "SOL";
    const mintAddress = isSol ? NATIVE_MINT : assertAddress(mint, "mint");
    const decimals = isSol ? 9 : Number((await readMintProgram(ctx.connection(network), mintAddress)).info.decimals);
    const base = direction === "to_ui" ? (/^\d+$/.test(String(amount).trim()) ? BigInt(String(amount).trim()) : (() => { throw new ToolError(400, "Base units must be a whole number.", 'For direction "to_ui", pass an integer string like "5000000".'); })()) : parseUnits(amount, decimals);
    const symbol = isSol ? "SOL" : (await jupSearch(ctx, mintAddress)).find((t) => t.id === mintAddress)?.symbol ?? null;
    const uiAmount = formatUnits(base, decimals);
    return {
      mint: mintAddress, symbol, network, decimals, decimalsSource: isSol ? "native SOL (fixed)" : "on-chain mint account", direction,
      baseUnits: base.toString(), uiAmount,
      explanation: `${uiAmount} ${symbol ?? "tokens"} = ${base.toString()} base units, because this token has ${decimals} decimals.`,
    };
  },
};

export const explainErrorTool: ToolDef = {
  name: "explain_error",
  title: "Explain an error",
  category: "reference",
  benefit: { kind: "money", text: "Explains the failure before the agent retries. For example 0x1771 from Jupiter is a slippage limit, which a blind retry won't fix." },
  useWhen: "Use whenever a Solana transaction or simulation fails, before retrying. Retrying without understanding the error wastes fees.",
  description: "Turns a Solana error (hex code, log line or RPC error object) into a plain-language cause and fix. Works offline; no chain call.",
  inputs: { error: z.union([z.string(), z.record(z.string(), z.unknown())]), programId: z.string().optional() },
  inputDocs: [
    { name: "error", type: "string or object", required: true, description: 'The error as you got it: "custom program error: 0x1771", "InsufficientFundsForRent", or the RPC err object.', howToGet: "From your RPC/send error, simulation result, wallet message, or get_recent_transactions." },
    { name: "programId", type: "string (base58 address)", required: false, description: "The program that failed, which disambiguates custom error codes.", howToGet: 'From the log line "Program <id> failed", or from explain_transaction.' },
  ],
  outputs: [
    { field: "recognized", type: "boolean", meaning: "Whether the gateway knows this error.", howComputed: "At least one explanation matched." },
    { field: "instructionIndex", type: "number | null", meaning: "Which instruction in the transaction failed (0-based).", howComputed: 'Parsed from InstructionError [index, ...] or "instruction N" in the text.' },
    { field: "explanations[].name", type: "string", meaning: "The error's official name.", howComputed: "Matched against tables for transaction errors, instruction errors, the System and Token programs, the Anchor framework and selected programs." },
    { field: "explanations[].scope", type: "string", meaning: "Which layer raised it (transaction, instruction, system_program, token_program, anchor_framework, program_specific).", howComputed: "Which table matched." },
    { field: "explanations[].meaning", type: "string", meaning: "What went wrong, in plain words.", howComputed: "Curated text." },
    { field: "explanations[].likelyCause", type: "string", meaning: "The usual reason this happens.", howComputed: "Curated text." },
    { field: "explanations[].fix", type: "string", meaning: "What to change before retrying, often naming the gateway tool that helps.", howComputed: "Curated text." },
    { field: "nextStep", type: "string", meaning: "The single recommended action.", howComputed: "The first explanation's fix, or advice to inspect the failing program when unrecognized." },
  ],
  notes: ["Custom codes 6000 and up are defined by each program. Without programId the gateway says so instead of guessing."],
  example: async () => ({ error: "Program JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUJoi5QNyVTaV4 failed: custom program error: 0x1771", programId: "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUJoi5QNyVTaV4" }),
  run: async ({ error, programId }) => {
    const program = programId ? assertAddress(programId, "programId") : (typeof error === "string" ? error.match(/Program ([1-9A-HJ-NP-Za-km-z]{32,44}) failed/)?.[1] : undefined);
    const { matches, instructionIndex } = explainError(error, program);
    return {
      recognized: matches.length > 0, instructionIndex, programId: program ?? null, explanations: matches,
      nextStep: matches[0]?.fix ?? "Unrecognized error. Run explain_transaction on the signature (or preflight_transaction on the unsigned transaction) to see the failing program and its logs.",
    };
  },
};

export const BASIC_TOOLS = [getSolanaBalance, getTokenAccounts, getRecentTransactions, getSolanaBlockhash, findAta, inspectAddress, convertAmount, explainErrorTool];
