// build_tx: builds the transaction an agent asked for (a SOL or token transfer, or a Jupiter swap), then has Pulse
// check it before handing it back: check_tx must say OK and tx_matches must say MATCH, and for a swap the bought token
// must not be AVOID. Only then is ready_to_sign true. Pulse never signs or sends: the caller's wallet does.
// The checks are the same tools, run on the built transaction, so their measured accuracy carries over.
import { ComputeBudgetProgram, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction, type Connection, type TransactionInstruction } from "@solana/web3.js";
import { createAssociatedTokenAccountIdempotentInstruction, createTransferCheckedInstruction, getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { z } from "zod";
import { assertAddress, EXAMPLE_RECIPIENT, EXAMPLE_WALLET, jupiterHost, NATIVE_MINT, NETWORK_DOC, parseUnits } from "./lib";
import { checkTransactionIntent, feeAdvice, preflightTransaction } from "./transactions";
import { tokenVerdict } from "./tokens";
import { ToolError, type ToolContext, type ToolDef } from "./types";

const MAX_SLIPPAGE_BPS = 300; // 3%: more than this on a swap is usually a mistake or a trap
const isSol = (token: string) => token.trim().toUpperCase() === "SOL";

// A token's decimals and which token program owns it (classic SPL Token or Token-2022).
async function mintInfo(conn: Connection, mint: string, field: string) {
  const info = await conn.getParsedAccountInfo(new PublicKey(mint), "confirmed");
  const parsed: any = (info.value?.data as any)?.parsed;
  if (parsed?.type !== "mint") throw new ToolError(422, `${mint} is not a token address.`, `${field} must be "SOL" or a token's mint address (find_token gives it).`);
  return { decimals: Number(parsed.info.decimals), program: info.value!.owner.equals(TOKEN_2022_PROGRAM_ID) ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID };
}

// Fresh blockhash, the "normal" priority price from the fee tool, and a compute limit from a dry run of the same steps.
async function assemble(conn: Connection, ctx: ToolContext, network: string, payer: PublicKey, steps: TransactionInstruction[]) {
  const price = await feeAdvice.run({ network }, ctx).then((f: any) => Number(f?.prices?.normal?.compute_unit_price) || 0).catch(() => 0);
  const compile = (limit: number, blockhash: string) => new VersionedTransaction(new TransactionMessage({
    payerKey: payer, recentBlockhash: blockhash,
    instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: limit }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: price }), ...steps],
  }).compileToV0Message());
  const { blockhash } = await conn.getLatestBlockhash("confirmed");
  const trial = await conn.simulateTransaction(compile(200_000, blockhash), { sigVerify: false, replaceRecentBlockhash: true, commitment: "confirmed" });
  const used = trial.value.unitsConsumed ?? 0;
  const limit = used ? Math.ceil(used * 1.2) + 300 : 200_000;
  return Buffer.from(compile(limit, blockhash).serialize()).toString("base64");
}

async function buildTransfer(conn: Connection, ctx: ToolContext, network: string, from: string, to: string, token: string, amount: string) {
  const payer = new PublicKey(from), dest = new PublicKey(to);
  if (isSol(token)) {
    const lamports = parseUnits(amount, 9);
    return assemble(conn, ctx, network, payer, [SystemProgram.transfer({ fromPubkey: payer, toPubkey: dest, lamports })]);
  }
  const mint = new PublicKey(assertAddress(token, "token"));
  const { decimals, program } = await mintInfo(conn, mint.toBase58(), "token");
  const raw = parseUnits(amount, decimals);
  const source = getAssociatedTokenAddressSync(mint, payer, true, program);
  const target = getAssociatedTokenAddressSync(mint, dest, true, program);
  return assemble(conn, ctx, network, payer, [
    // Creates the recipient's token account only if it doesn't exist yet (about 0.002 SOL deposit, paid by the sender).
    createAssociatedTokenAccountIdempotentInstruction(payer, target, dest, mint, program),
    createTransferCheckedInstruction(source, mint, target, payer, raw, decimals, [], program),
  ]);
}

async function buildSwap(conn: Connection, ctx: ToolContext, from: string, sell: string, buy: string, amount: string, slippageBps: number) {
  if (!ctx.postJson) throw new ToolError(503, "Swap building isn't available here.");
  const inMint = isSol(sell) ? NATIVE_MINT : assertAddress(sell, "token");
  const outMint = isSol(buy) ? NATIVE_MINT : assertAddress(buy, "buy");
  if (inMint === outMint) throw new ToolError(400, "token and buy are the same.", "Pick two different tokens.");
  const decimals = inMint === NATIVE_MINT ? 9 : (await mintInfo(conn, inMint, "token")).decimals;
  const raw = parseUnits(amount, decimals);
  const jup = `${jupiterHost()}/swap/v1`;
  const quote = await ctx.fetchJson(`${jup}/quote?inputMint=${inMint}&outputMint=${outMint}&amount=${raw}&slippageBps=${slippageBps}&restrictIntermediateTokens=true`, 10_000)
    .catch(() => { throw new ToolError(503, "Jupiter's quote service couldn't be reached.", "Retry in a moment. Failed calls are never charged."); });
  if (!quote?.outAmount) throw new ToolError(422, "Jupiter found no route for this swap.", "The token may have no market. Check it with token_safety.");
  const built = await ctx.postJson(`${jup}/swap`, { quoteResponse: quote, userPublicKey: from, wrapAndUnwrapSol: true, dynamicComputeUnitLimit: true, prioritizationFeeLamports: "auto" }, 15_000)
    .catch(() => { throw new ToolError(503, "Jupiter's swap builder couldn't be reached.", "Retry in a moment. Failed calls are never charged."); });
  if (!built?.swapTransaction) throw new ToolError(502, "Jupiter didn't return a transaction.", "Retry in a moment.");
  return { tx: String(built.swapTransaction), quote: { in_amount: String(quote.inAmount), out_amount: String(quote.outAmount), min_out_amount: String(quote.otherAmountThreshold), price_impact_pct: String(quote.priceImpactPct ?? "0"), slippage_bps: slippageBps } };
}

export const buildTransaction: ToolDef = {
  name: "build_tx",
  title: "Build it, checked",
  category: "transactions",
  benefit: { kind: "money", text: "An agent that builds its own transactions can get the token, amount, decimals or recipient wrong. This builds exactly what was asked, then refuses to call it ready unless check_tx says OK and tx_matches says MATCH." },
  useWhen: "Run when an agent needs to send SOL or a token, or swap through Jupiter: it returns the unsigned transaction already checked, with ready_to_sign and the reasons. Sign only when ready_to_sign is true.",
  usage: '{"action": "transfer", "from": "<wallet>", "to": "<address>", "token": "SOL", "amount": "0.01"}',
  description: "Builds a SOL or token transfer, or a Jupiter swap, as an unsigned transaction with a fresh blockhash and a fair priority fee, then runs check_tx and tx_matches on it (and token_safety on a token being bought). Never signs or sends.",
  inputs: {
    action: z.enum(["transfer", "swap"]),
    from: z.string(),
    to: z.string().optional(),
    token: z.string().optional().default("SOL"),
    amount: z.string().regex(/^\d+(\.\d+)?$/, "a plain decimal amount like 1.5"),
    buy: z.string().optional(),
    slippage_bps: z.number().int().min(1).max(MAX_SLIPPAGE_BPS).optional().default(50),
    allow_avoid: z.boolean().optional().default(false),
    network: z.enum(["mainnet-beta", "devnet"]).optional().default("mainnet-beta"),
  },
  inputDocs: [
    { name: "action", type: '"transfer" | "swap"', required: true, lookingFor: "Send a token to someone, or swap one token for another through Jupiter.", whereToGet: "From the request." },
    { name: "from", type: "string (base58 address)", required: true, lookingFor: "The wallet that pays and will sign.", whereToGet: "The agent's or user's own wallet address." },
    { name: "to", type: "string (base58 address)", required: false, lookingFor: "Transfers: who receives it.", whereToGet: "From the request. Check it with whats_this first if it came from someone else." },
    { name: "token", type: 'string ("SOL" or mint address)', required: false, lookingFor: 'The token to send (transfer) or to sell (swap). Default "SOL".', whereToGet: "find_token turns a name like USDC into its mint address. Never guess a mint." },
    { name: "amount", type: "string (decimal)", required: true, lookingFor: 'How much of token, in whole tokens: "1.5" means 1.5 USDC, not raw units.', whereToGet: "From the request." },
    { name: "buy", type: 'string ("SOL" or mint address)', required: false, lookingFor: "Swaps: the token to buy.", whereToGet: "find_token gives the mint." },
    { name: "slippage_bps", type: "integer 1-300", required: false, lookingFor: "Swaps: the most the price may move against you, in basis points (50 = 0.5%). Default 50, at most 300.", whereToGet: "Leave the default unless the token is thinly traded." },
    { name: "allow_avoid", type: "boolean", required: false, lookingFor: "Swaps: build even when token_safety says AVOID for the token being bought. Default false.", whereToGet: "Only when the user has read the AVOID reasons and still wants it." },
    NETWORK_DOC,
  ],
  outputs: [
    { field: "ready_to_sign", type: "boolean", is: "True only when every check below passed. Sign only then.", howWorkedOut: "check_tx OK, tx_matches MATCH, and for a swap the bought token isn't AVOID (unless allow_avoid)." },
    { field: "summary", type: "string", is: "What the transaction does and whether it's ready, in one or two sentences.", howWorkedOut: "From the request and the checks." },
    { field: "tx", type: "string (base64)", is: "The unsigned transaction (version 0). Sign it with the from wallet and send it within about a minute, before the blockhash expires.", howWorkedOut: "Transfers built here (Compute Budget, then the transfer; token transfers create the recipient's account if needed). Swaps built by Jupiter's swap API." },
    { field: "reasons[]", type: "string[]", is: "Why it isn't ready, in plain words. Empty when ready_to_sign is true.", howWorkedOut: "The failing checks' own summaries." },
    { field: "checks", type: "object", is: "The full answers: check_tx (verdict, summary, checks, balance_changes), tx_matches (verdict, summary, compared), and token_safety for a swap's bought token.", howWorkedOut: "The same tools, run on the built transaction." },
    { field: "quote", type: "object | null", is: "Swaps: in_amount, out_amount and min_out_amount in raw units, price_impact_pct and slippage_bps.", howWorkedOut: "Jupiter's quote that the transaction was built from." },
  ],
  notes: [
    "Never signs or sends. The from wallet signs; keys never reach Pulse.",
    "A blockhash lasts about a minute: sign and send soon, or build again.",
    "The checks run on the transaction as built. If anything changes it afterwards, check it again.",
  ],
  example: async () => ({ action: "transfer", from: EXAMPLE_WALLET, to: EXAMPLE_RECIPIENT, token: "SOL", amount: "0.01" }),
  run: async ({ action, from, to, token, amount, buy, slippage_bps, allow_avoid, network }, ctx) => {
    const conn = ctx.connection(network);
    const sender = assertAddress(from, "from");
    let tx: string, quote: any = null, expected: Record<string, string>, buyCheck: any = null;
    if (action === "transfer") {
      if (!to) throw new ToolError(400, "A transfer needs to.", "Add the recipient's address as to.");
      const recipient = assertAddress(to, "to");
      if (recipient === sender) throw new ToolError(400, "from and to are the same wallet.", "Check the recipient.");
      tx = await buildTransfer(conn, ctx, network, sender, recipient, token, amount);
      expected = { action: "transfer", token: isSol(token) ? "SOL" : token, amount, to: recipient, from: sender };
    } else {
      if (!buy) throw new ToolError(400, "A swap needs buy.", 'Add the token to buy as buy ("SOL" or a mint address).');
      ({ tx, quote } = await buildSwap(conn, ctx, sender, token, buy, amount, slippage_bps));
      expected = { action: "swap", sell: isSol(token) ? "SOL" : token, amount, buy: isSol(buy) ? "SOL" : buy, from: sender };
      if (!isSol(buy)) buyCheck = await tokenVerdict.run({ token: buy, network }, ctx).catch(() => null);
    }
    // One after the other, not together: the answers stay in a fixed order, so recorded tests replay exactly.
    const check: any = await preflightTransaction.run({ tx, network }, ctx);
    const match: any = await checkTransactionIntent.run({ tx, expected, network }, ctx);
    const reasons: string[] = [];
    if (check.verdict !== "OK") reasons.push(`check_tx says ${check.verdict}: ${check.summary}`);
    if (match.verdict !== "MATCH") reasons.push(`tx_matches says ${match.verdict}: ${match.summary}`);
    if (buyCheck?.verdict === "AVOID" && !allow_avoid) reasons.push(`token_safety says AVOID for the token being bought: ${buyCheck.summary} Set allow_avoid only if the user has read this and still wants it.`);
    if (action === "swap" && !isSol(buy!) && !buyCheck) reasons.push("token_safety couldn't check the token being bought right now, so this isn't marked ready. Try again in a moment.");
    const ready = reasons.length === 0;
    const what = action === "transfer" ? `Sends ${amount} ${isSol(token) ? "SOL" : token} from ${sender} to ${to}.` : `Swaps ${amount} ${isSol(token) ? "SOL" : token} for ${isSol(buy!) ? "SOL" : buy} through Jupiter (at most ${slippage_bps / 100}% slippage).`;
    return {
      ready_to_sign: ready,
      summary: `${what} ${ready ? "Checked: ready to sign. Sign it with the from wallet and send it within about a minute." : `Not ready: ${reasons.length} problem${reasons.length === 1 ? "" : "s"} below. Don't sign it.`}`,
      tx, reasons, quote,
      checks: { check_tx: check, tx_matches: match, ...(buyCheck ? { token_safety: buyCheck } : {}) },
    };
  },
};

