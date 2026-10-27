// Basic reads plus the helpers that prevent the most common agent mistakes.
import { PublicKey } from "@solana/web3.js";
import { getAccountLenForMint, getAssociatedTokenAddressSync, getMint } from "@solana/spl-token";
import { z } from "zod";
import { explainError } from "./errors";
import {
  assertAddress, EXAMPLE_WALLET, formatUnits, isoTime, jupByMints, jupSearch, labelFor, lamportsToSol,
  NATIVE_MINT, NETWORK_DOC, parseUnits, snakeKeys, SYSTEM_PROGRAM, TOKEN_2022_PROGRAM, TOKEN_PROGRAM, USDC_MINT,
} from "./lib";
import { ToolError, type ToolDef } from "./types";

const NETWORK = z.enum(["mainnet-beta", "devnet"]).optional().default("mainnet-beta");
const WALLET_DOC = (what: string) => ({
  name: "wallet", type: "string (base58 address)", required: true,
  lookingFor: `The wallet to read the ${what} of.`,
  whereToGet: "The user's address (from their wallet app) or your agent's public key. Not a .sol name or ticker.",
});
const HOW_MANY_DOC = (max: number, dflt: number, what: string) => ({
  name: "how_many", type: `integer 1-${max}`, required: false, lookingFor: `How many ${what} to return.`, whereToGet: `Default ${dflt}.`,
});

export const getSolanaBalance: ToolDef = {
  name: "balance",
  oldName: "get_solana_balance",
  title: "SOL balance",
  category: "wallets",
  benefit: { kind: "accuracy", text: "Reads the live balance, not one remembered from earlier in a chat, so the agent never builds a transfer the wallet can't cover." },
  useWhen: "Run before sending SOL or paying fees, to confirm the wallet has enough. Never trust a remembered balance.",
  usage: '{"wallet": "<address>"}',
  description: "A wallet's SOL balance, read from the chain.",
  inputs: { wallet: z.string(), network: NETWORK },
  inputDocs: [WALLET_DOC("SOL balance"), NETWORK_DOC],
  outputs: [
    { field: "wallet", type: "string", is: "The wallet that was read.", howWorkedOut: "Your input, cleaned up." },
    { field: "network", type: "string", is: "The network that was read.", howWorkedOut: "Your input. Default mainnet-beta." },
    { field: "lamports", type: "string (integer)", is: "The balance in lamports, SOL's smallest unit (1 SOL = 1,000,000,000 lamports).", howWorkedOut: "getBalance. A string so big numbers stay exact." },
    { field: "sol", type: "string (decimal)", is: "The same balance in SOL.", howWorkedOut: "lamports / 10^9 with exact integer math." },
    { field: "slot", type: "number", is: "The chain slot it was read at. Higher is newer.", howWorkedOut: "Returned with getBalance." },
  ],
  example: async () => ({ wallet: EXAMPLE_WALLET }),
  run: async ({ wallet, network }, ctx) => {
    const address = assertAddress(wallet, "wallet");
    const { value, context } = await ctx.connection(network).getBalanceAndContext(new PublicKey(address), "confirmed");
    return { wallet: address, network, lamports: String(value), sol: lamportsToSol(value), slot: context.slot };
  },
};

export const getTokenAccounts: ToolDef = {
  name: "tokens",
  oldName: "get_token_accounts",
  oldInputs: { limit: "how_many", includeZero: "include_empty" },
  title: "Tokens held",
  category: "wallets",
  benefit: { kind: "accuracy", text: "Ranks holdings by USD value and flags unverified tokens, so an agent doesn't report a wallet's spam airdrops as real money." },
  useWhen: "Run to learn which tokens a wallet holds and how much. Ranked by USD value; unverified (often spam airdrop) tokens are flagged so you don't report fake holdings.",
  usage: '{"wallet": "<address>", "how_many": 10}',
  description: "Lists a wallet's tokens (SPL Token and Token-2022) with exact amounts, whether each is verified, and USD value where priced.",
  inputs: { wallet: z.string(), how_many: z.number().int().min(1).max(100).optional().default(25), include_empty: z.boolean().optional().default(false), network: NETWORK },
  inputDocs: [
    WALLET_DOC("tokens"),
    HOW_MANY_DOC(100, 25, "tokens, highest USD value first,"),
    { name: "include_empty", type: "boolean", required: false, lookingFor: "Include empty token accounts.", whereToGet: "True only to find empty accounts, e.g. to close them." },
    NETWORK_DOC,
  ],
  outputs: [
    { field: "wallet", type: "string", is: "The wallet that was read.", howWorkedOut: "Your input, cleaned up." },
    { field: "accounts_total", type: "number", is: "Every token account the wallet owns, empty ones included.", howWorkedOut: "Token accounts across the SPL Token and Token-2022 programs." },
    { field: "accounts_with_balance", type: "number", is: "Token accounts holding more than zero.", howWorkedOut: "Accounts with a raw amount above 0." },
    { field: "returned", type: "number", is: "How many tokens are in this answer.", howWorkedOut: "Up to how_many, after sorting." },
    { field: "unverified_count", type: "number", is: "Returned tokens Jupiter doesn't mark verified. A big number usually means spam airdrops.", howWorkedOut: "Tokens without Jupiter's verified flag, or that Jupiter doesn't know." },
    { field: "total_usd", type: "number", is: "USD value of the returned tokens that are verified and priced. Spam often has a price from a tiny pool, so unverified tokens are left out.", howWorkedOut: "Sum of tokens[].usd_value for verified tokens. Unpriced tokens add nothing, so this can be low." },
    { field: "unverified_usd", type: "number", is: "The claimed USD value of the unverified tokens, kept apart. Don't trust it.", howWorkedOut: "Sum of tokens[].usd_value for unverified tokens." },
    { field: "tokens[].address", type: "string", is: "The token's address, its unique identity. Tickers aren't unique; addresses are.", howWorkedOut: "From the token account." },
    { field: "tokens[].symbol / name", type: "string | null", is: "Ticker and name from Jupiter. Copycats can share a ticker, so trust the address, not the symbol.", howWorkedOut: "Jupiter token search by address." },
    { field: "tokens[].verified", type: "boolean", is: "Whether Jupiter lists the token as verified.", howWorkedOut: "Jupiter's isVerified flag. false when unknown." },
    { field: "tokens[].amount", type: "string (decimal)", is: "The balance in normal units.", howWorkedOut: "raw_amount / 10^decimals with exact integer math." },
    { field: "tokens[].raw_amount", type: "string (integer)", is: "The balance in raw units, the number that goes into transfers.", howWorkedOut: "From the token account." },
    { field: "tokens[].decimals", type: "number", is: "How many decimal places the token uses.", howWorkedOut: "From the token account." },
    { field: "tokens[].holding_account", type: "string", is: "The account that holds this balance (not the wallet itself).", howWorkedOut: "The token account's address." },
    { field: "tokens[].token_program", type: '"spl-token" | "token-2022"', is: "Which token program owns the account. Transfers must use the same one.", howWorkedOut: "Which program's lookup found it." },
    { field: "tokens[].frozen", type: "boolean", is: "True if the issuer froze this account. Frozen tokens can't move.", howWorkedOut: 'The account state is "frozen".' },
    { field: "tokens[].usd_price", type: "number | null", is: "Price of one token in USD.", howWorkedOut: "Jupiter usdPrice. null when Jupiter has no price." },
    { field: "tokens[].usd_value", type: "number | null", is: "USD value of this holding.", howWorkedOut: "amount x usd_price, rounded to cents. null without a price." },
  ],
  notes: ["Prices come from Jupiter and can lag, or be missing for thinly traded tokens.", "Very large wallets are capped: prices are looked up for at most 300 tokens."],
  example: async () => ({ wallet: EXAMPLE_WALLET, how_many: 10 }),
  run: async ({ wallet, how_many, include_empty, network }, ctx) => {
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
    const pool = include_empty ? all : nonZero;
    const jup = await jupByMints(ctx, pool.slice(0, 300).map((t) => t.mint));
    const tokens = pool.map((t) => {
      const j = jup.get(t.mint);
      const amount = formatUnits(t.amountRaw, t.decimals);
      const usdPrice = typeof j?.usdPrice === "number" ? j.usdPrice : null;
      const valueUsd = usdPrice !== null ? Math.round(Number(amount) * usdPrice * 100) / 100 : null;
      return { address: t.mint, symbol: j?.symbol ?? null, name: j?.name ?? null, verified: j?.isVerified === true, amount, raw_amount: t.amountRaw, decimals: t.decimals, holding_account: t.tokenAccount, token_program: t.tokenProgram, frozen: t.frozen, usd_price: usdPrice, usd_value: valueUsd };
    }).sort((x, y) => (y.usd_value ?? -1) - (x.usd_value ?? -1) || Number(y.verified) - Number(x.verified)).slice(0, how_many);
    return {
      wallet: owner.toBase58(), network, accounts_total: all.length, accounts_with_balance: nonZero.length, returned: tokens.length,
      unverified_count: tokens.filter((t) => !t.verified).length,
      total_usd: Math.round(tokens.reduce((sum, t) => sum + (t.verified ? t.usd_value ?? 0 : 0), 0) * 100) / 100,
      unverified_usd: Math.round(tokens.reduce((sum, t) => sum + (t.verified ? 0 : t.usd_value ?? 0), 0) * 100) / 100,
      tokens,
    };
  },
};

export const getRecentTransactions: ToolDef = {
  name: "history",
  oldName: "get_recent_transactions",
  oldInputs: { limit: "how_many" },
  title: "Recent transactions",
  category: "wallets",
  benefit: { kind: "accuracy", text: "Gives real transaction IDs. Models can make up realistic-looking fake ones, and every lookup after that fails." },
  useWhen: "Run to see a wallet's recent activity or get a real transaction ID. Never make one up.",
  usage: '{"wallet": "<address>", "how_many": 5}',
  description: "Lists a wallet's latest transactions, newest first, whether each worked, and a plain error name for failures.",
  inputs: { wallet: z.string(), how_many: z.number().int().min(1).max(50).optional().default(10), before: z.string().min(64).max(100).optional(), network: NETWORK },
  inputDocs: [WALLET_DOC("transactions"), HOW_MANY_DOC(50, 10, "transactions"),
    { name: "before", type: "string (signature)", required: false, lookingFor: "Start below this transaction, to page further back.", whereToGet: "next_before from the previous answer." }, NETWORK_DOC],
  outputs: [
    { field: "wallet", type: "string", is: "The wallet that was read.", howWorkedOut: "Your input, cleaned up." },
    { field: "count", type: "number", is: "How many transactions came back.", howWorkedOut: "Length of the list." },
    { field: "failed_count", type: "number", is: "How many of them failed (failed transactions still pay fees).", howWorkedOut: "Entries with an error." },
    { field: "transactions[].tx_id", type: "string", is: "The transaction's ID. Pass it to explain_tx.", howWorkedOut: "getSignaturesForAddress." },
    { field: "transactions[].time", type: "string | null", is: "When it happened (UTC).", howWorkedOut: "Block time in ISO 8601. null if the node doesn't know." },
    { field: "transactions[].slot", type: "number", is: "The slot it landed in.", howWorkedOut: "getSignaturesForAddress." },
    { field: "transactions[].result", type: '"success" | "failed"', is: "Whether it worked.", howWorkedOut: "failed when the RPC reports an error." },
    { field: "transactions[].error", type: "string | null", is: "The failure's short name, e.g. InsufficientFundsForRent.", howWorkedOut: "why_failed run on the raw error. The raw error text when unknown." },
    { field: "transactions[].memo", type: "string | null", is: "Memo text attached to the transaction, if any.", howWorkedOut: "getSignaturesForAddress." },
    { field: "next_before", type: "string | null", is: "Pass as before to read the next, older page. For amounts and the other side of each transaction, use trace.", howWorkedOut: "The oldest transaction returned; null when there are no more." },
  ],
  example: async () => ({ wallet: EXAMPLE_WALLET, how_many: 5 }),
  run: async ({ wallet, how_many, before, network }, ctx) => {
    const address = assertAddress(wallet, "wallet");
    const sigs = await ctx.connection(network).getSignaturesForAddress(new PublicKey(address), { limit: how_many, ...(before ? { before } : {}) }, "confirmed");
    const transactions = sigs.map((s) => ({
      tx_id: s.signature, time: isoTime(s.blockTime), slot: s.slot, result: s.err ? "failed" : "success",
      error: s.err ? (explainError(s.err).matches[0]?.name ?? JSON.stringify(s.err)) : null, memo: s.memo ?? null,
    }));
    return { wallet: address, network, count: transactions.length, failed_count: transactions.filter((t) => t.result === "failed").length, transactions,
      next_before: sigs.length === how_many ? sigs[sigs.length - 1].signature : null };
  },
};

export const getSolanaBlockhash: ToolDef = {
  name: "blockhash",
  oldName: "get_solana_blockhash",
  title: "Fresh blockhash",
  category: "network",
  benefit: { kind: "money", text: "Says how many seconds the blockhash has left. A transaction built on an expired one gets rejected after the agent has done all the work." },
  useWhen: "Run just before building a transaction to sign. Blockhashes expire in about 60-90 seconds; this says how long is left.",
  usage: '{}',
  description: "A fresh blockhash and how many blocks (and about how many seconds) are left before it expires.",
  inputs: { network: NETWORK },
  inputDocs: [NETWORK_DOC],
  outputs: [
    { field: "blockhash", type: "string", is: "The blockhash to put in your transaction.", howWorkedOut: "getLatestBlockhash." },
    { field: "valid_until_height", type: "number", is: "Once the chain passes this block height, the transaction is rejected.", howWorkedOut: "Returned with the blockhash." },
    { field: "current_height", type: "number", is: "The chain's block height right now.", howWorkedOut: "getBlockHeight." },
    { field: "blocks_left", type: "number", is: "Blocks left before the blockhash expires.", howWorkedOut: "valid_until_height minus current_height." },
    { field: "seconds_left", type: "number", is: "Rough time left to sign and send.", howWorkedOut: "blocks_left x 0.4 seconds (the target block time). Real times vary, so leave a margin." },
  ],
  example: async () => ({}),
  run: async ({ network }, ctx) => {
    const conn = ctx.connection(network);
    const [latest, height] = await Promise.all([conn.getLatestBlockhash("confirmed"), conn.getBlockHeight("confirmed")]);
    const blocksRemaining = Math.max(latest.lastValidBlockHeight - height, 0);
    return { network, blockhash: latest.blockhash, valid_until_height: latest.lastValidBlockHeight, current_height: height, blocks_left: blocksRemaining, seconds_left: Math.round(blocksRemaining * 0.4) };
  },
};

async function readMintProgram(conn: ReturnType<import("./types").ToolContext["connection"]>, mint: string) {
  const info = await conn.getParsedAccountInfo(new PublicKey(mint), "confirmed");
  const owner = info.value?.owner.toBase58();
  const parsed: any = (info.value?.data as any)?.parsed;
  if (!info.value) throw new ToolError(404, `Token ${mint} does not exist on this network.`, "Check the token address (find_token) and the network.");
  if ((owner !== TOKEN_PROGRAM && owner !== TOKEN_2022_PROGRAM) || parsed?.type !== "mint") {
    throw new ToolError(422, `${mint} is not a token address.`, "Pass the token's address. whats_this shows what this address really is.");
  }
  return { programId: owner, info: parsed.info };
}

export const findAta: ToolDef = {
  name: "token_account",
  oldName: "find_ata",
  oldInputs: { mint: "token" },
  title: "Where to send a token",
  category: "tokens",
  benefit: { kind: "money", text: "Works out the token account with the token's real program and prices creating it, so tokens aren't sent to a made-up or wrong-program address." },
  useWhen: "Run before sending a token. Tokens go to the recipient's token account, not their wallet, and models can't work that address out.",
  usage: '{"wallet": "<recipient>", "token": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"} finds where their USDC goes',
  description: "Finds the token account (ATA) for a wallet and token with the token's real program, says if it exists, and prices creating it.",
  inputs: { wallet: z.string(), token: z.string(), network: NETWORK },
  inputDocs: [
    { name: "wallet", type: "string (base58 address)", required: true, lookingFor: "The wallet that will own it (usually the recipient).", whereToGet: "The recipient's wallet address." },
    { name: "token", type: "string (token address)", required: true, lookingFor: "The token's address.", whereToGet: "From find_token or tokens. Not a ticker." },
    NETWORK_DOC,
  ],
  outputs: [
    { field: "address", type: "string", is: "The recipient's token account for this token. Send the tokens here.", howWorkedOut: "getAssociatedTokenAddressSync(token, wallet) with the token's own program." },
    { field: "token_program", type: '"spl-token" | "token-2022"', is: "The token program the transfer must use.", howWorkedOut: "The program that owns the token." },
    { field: "exists", type: "boolean", is: "Whether the account already exists on chain.", howWorkedOut: "Looked up on chain." },
    { field: "balance", type: "string | null", is: "What the account holds now, when it exists.", howWorkedOut: "Token amount with the token's decimals." },
    { field: "decimals", type: "number", is: "The token's decimals.", howWorkedOut: "From the token." },
    { field: "create_cost_lamports", type: "string | null", is: "The SOL deposit (in lamports) to create the account when it doesn't exist. You get it back if the account is closed later.", howWorkedOut: "getMinimumBalanceForRentExemption for the account size, counting the token's Token-2022 extensions." },
    { field: "create_cost_sol", type: "string | null", is: "The same deposit in SOL.", howWorkedOut: "create_cost_lamports / 10^9." },
    { field: "owner_is_program", type: "boolean", is: "True when the wallet is a program-derived address, not a normal wallet. Fine for protocols, odd for people.", howWorkedOut: "The address is off the ed25519 curve." },
  ],
  example: async () => ({ wallet: EXAMPLE_WALLET, token: USDC_MINT }),
  run: async ({ wallet, token, network }, ctx) => {
    const owner = new PublicKey(assertAddress(wallet, "wallet"));
    const mintKey = new PublicKey(assertAddress(token, "token"));
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
      wallet: owner.toBase58(), token: mintKey.toBase58(), network, address: ata.toBase58(),
      token_program: programId === TOKEN_PROGRAM ? "spl-token" : "token-2022", exists,
      balance: parsed ? formatUnits(parsed.tokenAmount.amount, parsed.tokenAmount.decimals) : null,
      decimals: Number(info.decimals), create_cost_lamports: createCostLamports, create_cost_sol: createCostLamports ? lamportsToSol(createCostLamports) : null,
      owner_is_program: !PublicKey.isOnCurve(owner.toBytes()),
    };
  },
};

export const inspectAddress: ToolDef = {
  name: "whats_this",
  oldName: "inspect_address",
  title: "What is this address?",
  category: "reference",
  benefit: { kind: "money", text: "Tells a normal wallet from a token, program or token account. SOL sent to a token or program address by mistake is stuck." },
  useWhen: "Run when unsure what an address is, before sending to it or passing it on. SOL sent to a token or program address can be lost for good.",
  usage: '{"address": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"} is the USDC token, not a wallet',
  description: "Says what any address is (wallet, token account, token, program, stake account and more) with its key facts.",
  inputs: { address: z.string(), network: NETWORK },
  inputDocs: [{ name: "address", type: "string (base58 address)", required: true, lookingFor: "Any Solana address.", whereToGet: "The address you're about to use." }, NETWORK_DOC],
  outputs: [
    { field: "exists", type: "boolean", is: "Whether an account with SOL lives at this address. A wallet with no SOL doesn't, though it can still own tokens (see details.token_accounts).", howWorkedOut: "Looked up on chain." },
    { field: "kind", type: "string", is: "wallet, token_account, mint (a token), program, program_data, stake_account, vote_account, lookup_table, program_owned_account or not_found.", howWorkedOut: "From the owner program, whether it's a program, and its data." },
    { field: "summary", type: "string", is: "What it is, in plain words, and what's safe to do with it.", howWorkedOut: "Fixed text per kind." },
    { field: "lamports / sol", type: "string", is: "SOL held by the account, in lamports and in SOL.", howWorkedOut: "The account's lamports; sol = lamports / 10^9." },
    { field: "owner_program", type: "string | null", is: "The program that owns the account.", howWorkedOut: "The account owner." },
    { field: "owner_program_name", type: "string | null", is: "That program's name, when we know it.", howWorkedOut: "Our table of program names." },
    { field: "is_program", type: "boolean", is: "True for program accounts.", howWorkedOut: "The account's executable flag." },
    { field: "can_sign", type: "boolean", is: "True for addresses that have a private key (normal keypairs). False for program-derived addresses, which can't sign.", howWorkedOut: "The address is on the ed25519 curve." },
    { field: "details", type: "object", is: "Facts for this kind. Token accounts: token, owner, amount, delegate. Tokens: decimals, supply, who_can_mint, who_can_freeze. No SOL account: token_accounts, how many token accounts it owns, and has_history, whether it has any past transactions (each null if it couldn't be checked).", howWorkedOut: "From the account data; token_accounts from both token programs; has_history from the address's transaction signatures." },
  ],
  example: async () => ({ address: USDC_MINT }),
  run: async ({ address, network }, ctx) => {
    const key = new PublicKey(assertAddress(address, "address"));
    const res = await ctx.connection(network).getParsedAccountInfo(key, "confirmed");
    const onCurve = PublicKey.isOnCurve(key.toBytes());
    if (!res.value) {
      // No SOL account, but the address can still own tokens (a wallet that spent all its SOL, or a payout address that
      // only ever received USDC), so the token programs are asked too. null means the lookup failed: unknown, not zero.
      const tokenAccounts = await Promise.all([TOKEN_PROGRAM, TOKEN_2022_PROGRAM].map((programId) =>
        ctx.connection(network).getTokenAccountsByOwner(key, { programId: new PublicKey(programId) }, "confirmed").then((r) => r.value.length)))
        .then(([a, b]) => a + b).catch(() => null);
      // Empty today isn't the same as never used: a wallet that received dust and was then emptied (common in scam
      // traces) has past transactions, so those are checked before saying it never received anything.
      const hasHistory = tokenAccounts === 0
        ? await ctx.connection(network).getSignaturesForAddress(key, { limit: 1 }, "confirmed").then((s) => s.length > 0).catch(() => null)
        : null;
      const holder = onCurve ? "A wallet" : "A program-derived address (controlled by a program, not a person)";
      const summary = tokenAccounts ? `${holder} with no SOL that holds ${tokenAccounts} token account${tokenAccounts === 1 ? "" : "s"}. It's in use: it just needs SOL to pay fees before it can move them.`
        : tokenAccounts === 0 && hasHistory ? "Empty now, but used before: no SOL and no tokens today, and it has past transactions. Its history shows where the money went."
        : tokenAccounts === 0 && hasHistory === false ? "Nothing has ever happened here: no SOL, no tokens and no past transactions. Sending SOL creates it."
        : tokenAccounts === 0 ? "Nothing here now: no SOL and no tokens. Whether it was used before couldn't be checked right now."
        : "No SOL here. Whether it holds tokens couldn't be checked right now.";
      return { address: key.toBase58(), network, exists: false, kind: tokenAccounts ? "wallet" : "not_found", summary, lamports: "0", sol: "0", owner_program: null, owner_program_name: null, is_program: false, can_sign: onCurve, details: { token_accounts: tokenAccounts, has_history: hasHistory } };
    }
    const acc = res.value;
    const owner = acc.owner.toBase58();
    const parsed: any = (acc.data as any)?.parsed;
    const dataLength = Array.isArray(acc.data) ? Buffer.from(acc.data[0] as string, "base64").length : (acc.data as any)?.space ?? null;
    let kind = "program_owned_account";
    let explanation = `A data account owned by ${labelFor(owner) ?? owner}. Don't send money here unless that program's docs say to.`;
    let details: Record<string, unknown> = {};
    if (acc.executable) { kind = "program"; explanation = "A program. Never send money to a program address."; }
    else if (owner === SYSTEM_PROGRAM && !dataLength) { kind = "wallet"; explanation = onCurve ? "A normal wallet. Safe to send SOL. Send tokens to its token account (token_account)." : "A program-derived address. Money sent here is controlled by a program, not a person."; }
    else if ((owner === TOKEN_PROGRAM || owner === TOKEN_2022_PROGRAM) && parsed?.type === "account") {
      kind = "token_account";
      const i = parsed.info;
      details = { token: i.mint, owner: i.owner, amount: i.tokenAmount.uiAmountString, raw_amount: i.tokenAmount.amount, decimals: i.tokenAmount.decimals, state: i.state, delegate: i.delegate ?? null, delegated_amount: i.delegatedAmount?.uiAmountString ?? null, close_authority: i.closeAuthority ?? null };
      explanation = "A token account (holds one token for one owner). To pay the owner SOL, send to their wallet instead.";
    } else if ((owner === TOKEN_PROGRAM || owner === TOKEN_2022_PROGRAM) && parsed?.type === "mint") {
      kind = "mint";
      const i = parsed.info;
      details = { decimals: i.decimals, supply: formatUnits(i.supply, i.decimals), who_can_mint: i.mintAuthority ?? null, who_can_freeze: i.freezeAuthority ?? null, extensions: (i.extensions ?? []).map((e: any) => e.extension) };
      explanation = "A token's own address (its mint). Never send money to it; it can't be recovered.";
    } else if (parsed?.type === "programData") { kind = "program_data"; explanation = "Holds a program's code. Never send money here."; }
    else if (owner === "Stake11111111111111111111111111111111111111") { kind = "stake_account"; explanation = "A stake account. SOL here is staked and only moves through staking."; }
    else if (owner === "Vote111111111111111111111111111111111111111") { kind = "vote_account"; explanation = "A validator vote account."; }
    else if (owner === "AddressLookupTab1e1111111111111111111111111") { kind = "lookup_table"; explanation = "An address lookup table used to fit more accounts in a transaction."; }
    return { address: key.toBase58(), network, exists: true, kind, summary: explanation, lamports: String(acc.lamports), sol: lamportsToSol(acc.lamports), owner_program: owner, owner_program_name: labelFor(owner), is_program: acc.executable, can_sign: onCurve, details };
  },
};

// "raw" and "readable" are the current values; to_base_units and to_ui are the old ones and still work.
const TO = z.enum(["raw", "readable", "to_base_units", "to_ui"]).optional().default("raw");

export const convertAmount: ToolDef = {
  name: "convert",
  oldName: "convert_amount",
  oldInputs: { mint: "token", direction: "to" },
  title: "Convert token amounts",
  category: "tokens",
  benefit: { kind: "money", text: "5 USDC is 5,000,000 raw units because USDC has 6 decimals. Get the decimals wrong and you send 1,000 times too much or too little." },
  useWhen: 'Run before putting any token amount in a transaction. "5 USDC" is 5,000,000 raw units; wrong decimals send 1,000x too much or too little.',
  usage: '{"token": "SOL", "amount": "0.5"} gives 500000000',
  description: "Converts between normal amounts and raw units with the token's real on-chain decimals.",
  inputs: { token: z.string(), amount: z.string(), to: TO, network: NETWORK },
  inputDocs: [
    { name: "token", type: 'string (token address) or "SOL"', required: true, lookingFor: 'The token, or "SOL" for SOL (9 decimals).', whereToGet: "From find_token or tokens." },
    { name: "amount", type: "string (decimal)", required: true, lookingFor: 'The amount, as a string: "5" or "0.25".', whereToGet: "The user's amount. A string avoids rounding errors." },
    { name: "to", type: '"raw" | "readable"', required: false, lookingFor: 'Direction. "raw" turns 5 into 5000000 (for transactions); "readable" turns raw units back. Default "raw".', whereToGet: '"readable" for amounts read from chain data.' },
    NETWORK_DOC,
  ],
  outputs: [
    { field: "token", type: "string", is: "The token converted (SOL's own address for SOL).", howWorkedOut: 'Your input. "SOL" becomes So11111111111111111111111111111111111111112.' },
    { field: "symbol", type: "string | null", is: "Ticker from Jupiter, for display only.", howWorkedOut: "Jupiter token search by address." },
    { field: "decimals", type: "number", is: "Decimal places the token uses.", howWorkedOut: "Read from the token on chain (SOL is always 9)." },
    { field: "decimals_from", type: "string", is: "Where the decimals came from, so you can trust them.", howWorkedOut: '"on-chain token" or "SOL (fixed)".' },
    { field: "raw_amount", type: "string (integer)", is: "The amount in raw units, exactly as it goes into a transfer.", howWorkedOut: "amount x 10^decimals with exact integer math. Refuses more decimal places than the token has." },
    { field: "amount", type: "string (decimal)", is: "The normal, readable amount.", howWorkedOut: "raw_amount / 10^decimals with exact integer math." },
    { field: "summary", type: "string", is: "One sentence stating the conversion.", howWorkedOut: "Built from the values above." },
  ],
  example: async () => ({ token: USDC_MINT, amount: "5", to: "raw" }),
  run: async ({ token, amount, to: toInput, network }, ctx) => {
    const to = toInput === "readable" || toInput === "to_ui" ? "readable" : "raw";
    const isSol = typeof token === "string" && token.trim().toUpperCase() === "SOL";
    const mintAddress = isSol ? NATIVE_MINT : assertAddress(token, "token");
    const decimals = isSol ? 9 : Number((await readMintProgram(ctx.connection(network), mintAddress)).info.decimals);
    const base = to === "readable" ? (/^\d+$/.test(String(amount).trim()) ? BigInt(String(amount).trim()) : (() => { throw new ToolError(400, "Raw units must be a whole number.", 'For to "readable", pass a whole-number string like "5000000".'); })()) : parseUnits(amount, decimals);
    const symbol = isSol ? "SOL" : (await jupSearch(ctx, mintAddress)).find((t) => t.id === mintAddress)?.symbol ?? null;
    const uiAmount = formatUnits(base, decimals);
    return {
      token: mintAddress, symbol, network, decimals, decimals_from: isSol ? "SOL (fixed)" : "on-chain token", to,
      raw_amount: base.toString(), amount: uiAmount,
      summary: `${uiAmount} ${symbol ?? "tokens"} = ${base.toString()} raw units, because this token has ${decimals} decimals.`,
    };
  },
};

export const explainErrorTool: ToolDef = {
  name: "why_failed",
  oldName: "explain_error",
  oldInputs: { programId: "program" },
  title: "Why did it fail?",
  category: "reference",
  benefit: { kind: "money", text: "Explains the failure before the agent retries. 0x1771 from Jupiter means the price moved past the slippage limit, and a blind retry won't fix that." },
  useWhen: "Run whenever a Solana transaction or dry run fails, before retrying. Retrying blind burns fees.",
  usage: '{"error": "custom program error: 0x1771", "program": "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4"}',
  description: "Turns a Solana error (hex code, log line or RPC error) into the plain cause and fix. Offline, no chain call.",
  inputs: { error: z.union([z.string(), z.record(z.string(), z.unknown())]), program: z.string().optional() },
  inputDocs: [
    { name: "error", type: "string or object", required: true, lookingFor: 'The error as you got it: "custom program error: 0x1771", "InsufficientFundsForRent", or the RPC error object.', whereToGet: "From your send or RPC error, a dry-run result, a wallet message, or history." },
    { name: "program", type: "string (base58 address)", required: false, lookingFor: "The failing program. Needed to read custom error codes right.", whereToGet: 'From the log line "Program <address> failed", or from explain_tx.' },
  ],
  outputs: [
    { field: "known", type: "boolean", is: "Whether we know this error.", howWorkedOut: "At least one explanation matched." },
    { field: "failed_step", type: "number | null", is: "Which step in the transaction failed (counting from 0).", howWorkedOut: 'Read from InstructionError [step, ...] or "instruction N" in the text.' },
    { field: "program", type: "string | null", is: "The program the error was read against.", howWorkedOut: "Your input, or the program named in the error text." },
    { field: "explanations[].name", type: "string", is: "The error's official name.", howWorkedOut: "Matched against tables for transaction errors, instruction errors, the System and Token programs, Anchor and selected programs." },
    { field: "explanations[].scope", type: "string", is: "Which layer raised it: transaction, instruction, system_program, token_program, anchor_framework or program_specific.", howWorkedOut: "Which table matched." },
    { field: "explanations[].meaning", type: "string", is: "What went wrong, in plain words.", howWorkedOut: "Written by hand." },
    { field: "explanations[].likely_cause", type: "string", is: "The usual reason it happens.", howWorkedOut: "Written by hand." },
    { field: "explanations[].fix", type: "string", is: "What to change before retrying, often naming the tool that helps.", howWorkedOut: "Written by hand." },
    { field: "next_step", type: "string", is: "The one thing to do next.", howWorkedOut: "The first explanation's fix, or how to find the failing program when the error is unknown." },
  ],
  notes: ["Custom codes 6000 and up are defined by each program. Without program we say so instead of guessing."],
  example: async () => ({ error: "Program JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4 failed: custom program error: 0x1771", program: "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4" }),
  run: async ({ error, program: programInput }) => {
    const program = programInput ? assertAddress(programInput, "program") : (typeof error === "string" ? error.match(/Program ([1-9A-HJ-NP-Za-km-z]{32,44}) failed/)?.[1] : undefined);
    const { matches, instructionIndex } = explainError(error, program);
    return {
      known: matches.length > 0, failed_step: instructionIndex, program: program ?? null, explanations: snakeKeys(matches),
      next_step: matches[0]?.fix ?? "Unknown error. Run explain_tx on the transaction ID (or check_tx on the unsigned transaction) to see the failing program and its logs.",
    };
  },
};

export const BASIC_TOOLS = [getSolanaBalance, getTokenAccounts, getRecentTransactions, getSolanaBlockhash, findAta, inspectAddress, convertAmount, explainErrorTool];
