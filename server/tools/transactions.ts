// Transaction intelligence: check before signing, verify intent, explain what happened, and price fees correctly.
import { ComputeBudgetProgram, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction, type Connection } from "@solana/web3.js";
import { createApproveInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { z } from "zod";
import { feeBreakdown, loadTransaction, simulateWithChanges, tokenAccountOwners, type DecodedInstruction, type LoadedTransaction } from "./decode";
import { explainError } from "./errors";
import {
  assertAddress, BASE_FEE_LAMPORTS_PER_SIGNATURE, COMPUTE_BUDGET_PROGRAM, EXAMPLE_RECIPIENT, EXAMPLE_WALLET, formatUnits, isoTime, jupByMints, labelFor,
  lamportsToSol, NATIVE_MINT, NETWORK_DOC, parseUnits, snakeKeys, USDC_MINT,
} from "./lib";
import { ToolError, type ToolContext, type ToolDef } from "./types";

const NETWORK = z.enum(["mainnet-beta", "devnet"]).optional().default("mainnet-beta");
const TX_DOC = {
  name: "tx", type: "string (base64)", required: true,
  lookingFor: "Base64 transaction, signed or not, legacy or v0.",
  whereToGet: "Before signing: Buffer.from(tx.serialize({ requireAllSignatures: false })).toString('base64'), or an aggregator's swap tx.",
};
const symbolsFor = (ctx: ToolContext) => async (mints: string[]) => {
  const map = await jupByMints(ctx, mints);
  return new Map([...map].map(([mint, t]) => [mint, t.symbol]));
};

// An arbitrary outside address used as the "attacker" in the drainer example.
const EXAMPLE_ATTACKER = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";

// Builds a real, fresh, unsigned transaction from the public example wallet, for live examples.
async function exampleTransaction(conn: Connection, kind: "sol_transfer" | "drainer_approve") {
  const payer = new PublicKey(EXAMPLE_WALLET);
  const { blockhash } = await conn.getLatestBlockhash("confirmed");
  const instructions = [ComputeBudgetProgram.setComputeUnitLimit({ units: 20_000 }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 10_000 })];
  if (kind === "sol_transfer") instructions.push(SystemProgram.transfer({ fromPubkey: payer, toPubkey: new PublicKey(EXAMPLE_RECIPIENT), lamports: 10_000_000 }));
  else {
    // Grants an outside address the right to move the wallet's USDC: the classic drainer pattern.
    const usdcAccount = getAssociatedTokenAddressSync(new PublicKey(USDC_MINT), payer, true);
    instructions.push(createApproveInstruction(usdcAccount, new PublicKey(EXAMPLE_ATTACKER), payer, 1_000_000_000_000n));
  }
  const message = new TransactionMessage({ payerKey: payer, recentBlockhash: blockhash, instructions }).compileToV0Message();
  return Buffer.from(new VersionedTransaction(message).serialize()).toString("base64");
}

type Check = { name: string; result: "pass" | "info" | "warn" | "fail"; detail: string };

// The drainer patterns: handing control of funds or accounts to someone who is not signing.
function permissionCheck(ix: DecodedInstruction, signers: Set<string>): Check | null {
  if (ix.type === "token_approve" && !signers.has(String(ix.info.delegate))) {
    return { name: "token_approval", result: "fail", detail: `Instruction ${ix.index} lets ${ix.info.delegate} move up to ${ix.info.amountRaw} base units from token account ${ix.info.account} at any time. This is the most common wallet-drainer pattern.` };
  }
  if (ix.type === "token_set_authority") {
    return { name: "authority_change", result: "fail", detail: `Instruction ${ix.index} changes the ${ix.info.authorityType} authority of ${ix.info.account} to ${ix.info.newAuthority ?? "nobody"}. Whoever holds that authority controls the account.` };
  }
  if (ix.type === "assign_owner" && signers.has(String(ix.info.account))) {
    return { name: "wallet_reassigned", result: "fail", detail: `Instruction ${ix.index} hands ownership of signer ${ix.info.account} to program ${ix.info.newOwnerProgram}. The wallet would stop being a normal wallet.` };
  }
  if (ix.type === "token_close_account" && !signers.has(String(ix.info.destination))) {
    return { name: "close_to_other", result: "fail", detail: `Instruction ${ix.index} closes token account ${ix.info.account} and sends its SOL deposit to ${ix.info.destination}, which is not a signer.` };
  }
  return null;
}

const permissionChecks = (loaded: LoadedTransaction, signers: Set<string>): Check[] =>
  loaded.instructions.map((ix) => permissionCheck(ix, signers)).filter((c): c is Check => c !== null);

// The fee breakdown with plain field names.
const feeOut = (fee: ReturnType<typeof feeBreakdown>) => ({
  base_lamports: fee.baseLamports, priority_lamports: fee.priorityLamports, total_lamports: fee.totalLamports, total_sol: fee.totalSol,
  compute_unit_limit: fee.computeUnitLimit, compute_unit_limit_from: fee.computeUnitLimitSource, compute_unit_price: fee.microLamportsPerComputeUnit,
});

export const preflightTransaction: ToolDef = {
  name: "check_tx",
  oldName: "preflight_transaction",
  oldInputs: { transaction: "tx" },
  title: "Safe to sign?",
  category: "transactions",
  benefit: { kind: "money", text: "Catches a drainer approval or a transaction that will fail, before you sign. Failed transactions still cost fees. One hidden approval can empty a wallet." },
  useWhen: "Run on every transaction before signing. Shows what each wallet gains and loses, blocks drainer tricks, and catches failures and expired blockhashes before you pay.",
  usage: '{"tx": "<base64, before signing>"}',
  description: "Decodes each step, dry-runs it on live mainnet, finds each wallet's SOL and token changes, and answers OK, REVIEW or BLOCK with reasons.",
  inputs: { tx: z.string().min(20), network: NETWORK },
  inputDocs: [TX_DOC, NETWORK_DOC],
  outputs: [
    { field: "verdict", type: '"OK" | "REVIEW" | "BLOCK"', is: "The answer. BLOCK: don't sign. REVIEW: a person or your rules should look first. OK: nothing wrong found.", howWorkedOut: "The worst check wins: any fail is BLOCK, any warn is REVIEW, otherwise OK." },
    { field: "summary", type: "string", is: "One sentence: the verdict and the main reason.", howWorkedOut: "Built from the worst check and what your wallet sends." },
    { field: "fee_payer / signers", type: "string / string[]", is: "The wallet paying the fee, and every wallet that signs.", howWorkedOut: "Read from the transaction." },
    { field: "checks[].name", type: "string", is: "Which check: simulation, blockhash, fee_payer_balance, token_approval, authority_change, wallet_reassigned, close_to_other, unknown_programs, priority_fee or outflow.", howWorkedOut: "A fixed list." },
    { field: "checks[].result", type: '"pass" | "info" | "warn" | "fail"', is: "How the check came out.", howWorkedOut: "simulation fails if the dry run errors. blockhash warns if expired. fee_payer_balance fails if the payer can't cover fees. Approvals to non-signers, authority changes, reassigning a signer and closing to a non-signer fail. Unknown programs warn. A priority fee over 0.01 SOL warns. Money leaving your wallet is info." },
    { field: "checks[].detail", type: "string", is: "What the check found, in plain words.", howWorkedOut: "Built from the decoded steps and the dry run." },
    { field: "balance_changes[].wallet", type: "string", is: "The wallet whose balance changes.", howWorkedOut: "For SOL, the account itself. For tokens, the owner of the token account." },
    { field: "balance_changes[].is_you", type: "boolean", is: "True when this wallet signs the transaction, so it's you.", howWorkedOut: "The wallet is one of the required signers." },
    { field: "balance_changes[].token / symbol", type: "string", is: '"SOL" or the token address, and its ticker.', howWorkedOut: "From the account data. Ticker from Jupiter." },
    { field: "balance_changes[].before / after / change", type: "string (decimal)", is: "Balance before, after, and the difference. Negative means the wallet loses it.", howWorkedOut: "Before: live account data. After: the dry run's account data. Exact decimals. SOL changes include fees." },
    { field: "balance_changes[].raw_change / decimals", type: "string / number", is: "The change in raw units, and the token's decimals.", howWorkedOut: "after minus before, in base units." },
    { field: "steps[]", type: "object[]", is: "Every instruction, decoded: step number, program, type (sol_transfer, token_transfer, token_approve, token_set_authority, token_close_account, create_token_account, set_compute_unit_price, unknown_program and more) and its key details.", howWorkedOut: "Decoded for the System, Token, Token-2022, Compute Budget, Associated Token Account and Memo programs." },
    { field: "fee.base_lamports / priority_lamports / total_lamports / total_sol", type: "string", is: "What this transaction costs in fees.", howWorkedOut: "Base: 5000 lamports per signature. Priority: compute_unit_price x compute_unit_limit / 1,000,000, rounded up." },
    { field: "fee.compute_unit_limit / compute_unit_limit_from / compute_unit_price", type: "number | string", is: "The compute settings the fee is charged on. compute_unit_price is in micro-lamports per compute unit.", howWorkedOut: "From the transaction's Compute Budget steps, or the runtime default when there are none." },
    { field: "simulation.worked / error / compute_used / logs", type: "object", is: "The raw dry run: whether it worked, the error, compute used, and the last 25 log lines.", howWorkedOut: "simulateTransaction with signature checks off and a fresh blockhash." },
    { field: "simulation.error_explained", type: "object | null", is: "What the failure means, in plain words.", howWorkedOut: "why_failed run on the dry-run error." },
  ],
  notes: [
    "The dry run uses the chain as it is now. If things change before you send, the real result can differ.",
    "Balance changes cover up to 64 writable accounts.",
  ],
  example: async (ctx) => ({ tx: await exampleTransaction(ctx.connection("mainnet-beta"), "sol_transfer") }),
  run: async ({ tx, network }, ctx) => {
    const conn = ctx.connection(network);
    const loaded = await loadTransaction(conn, tx);
    const signers = new Set(loaded.signers);
    const [sim, blockhashValid, payerBalance] = await Promise.all([
      simulateWithChanges(conn, loaded, symbolsFor(ctx)),
      conn.isBlockhashValid(loaded.recentBlockhash, { commitment: "confirmed" }).then((r) => r.value).catch(() => null),
      conn.getBalance(new PublicKey(loaded.feePayer), "confirmed"),
    ]);
    const fee = feeBreakdown(loaded);
    const checks: Check[] = [];
    const explanation = sim.error ? explainError(sim.error).matches[0] ?? null : null;
    checks.push(sim.success ? { name: "simulation", result: "pass", detail: `Dry run worked, using ${sim.unitsConsumed ?? "?"} compute units.` } : { name: "simulation", result: "fail", detail: `Dry run failed: ${explanation ? `${explanation.name}: ${explanation.meaning} Fix: ${explanation.fix}` : JSON.stringify(sim.error)}` });
    if (blockhashValid === false) checks.push({ name: "blockhash", result: "warn", detail: "The blockhash has expired, so the network would reject this. It was dry-run with a fresh one. Rebuild with blockhash before signing." });
    else if (blockhashValid) checks.push({ name: "blockhash", result: "pass", detail: "Blockhash is still valid." });
    checks.push(BigInt(payerBalance) >= BigInt(fee.totalLamports) ? { name: "fee_payer_balance", result: "pass", detail: `Fee payer holds ${lamportsToSol(payerBalance)} SOL; fees are ${fee.totalSol} SOL.` } : { name: "fee_payer_balance", result: "fail", detail: `Fee payer holds ${lamportsToSol(payerBalance)} SOL but fees are ${fee.totalSol} SOL.` });
    checks.push(...permissionChecks(loaded, signers));
    const unknown = [...new Set(loaded.instructions.filter((i) => i.type === "unknown_program").map((i) => i.programId))];
    if (unknown.length) checks.push({ name: "unknown_programs", result: "warn", detail: `Calls program(s) we don't recognize: ${unknown.join(", ")}. Make sure you trust them.` });
    if (BigInt(fee.priorityLamports) > 10_000_000n) checks.push({ name: "priority_fee", result: "warn", detail: `Priority fee is ${lamportsToSol(fee.priorityLamports)} SOL, unusually high. The fee tool shows a fair price.` });
    const changes = sim.changes.map((c) => ({ ...c, isSigner: signers.has(c.wallet) }));
    const outflows = changes.filter((c) => c.isSigner && c.changeRaw.startsWith("-"));
    if (outflows.length) checks.push({ name: "outflow", result: "info", detail: `Your wallet sends: ${outflows.map((c) => `${c.change.slice(1)} ${c.symbol ?? c.asset}`).join(", ")} (SOL includes fees).` });
    const fails = checks.filter((c) => c.result === "fail");
    const warns = checks.filter((c) => c.result === "warn");
    const verdict = fails.length ? "BLOCK" : warns.length ? "REVIEW" : "OK";
    const summary = `${verdict}: ${fails[0]?.detail ?? warns[0]?.detail ?? (outflows.length ? checks.find((c) => c.name === "outflow")!.detail : "Nothing wrong found, and no money leaves the signers except fees.")}`;
    return {
      network, verdict, summary, fee_payer: loaded.feePayer, signers: loaded.signers, checks,
      balance_changes: changes.map((c) => ({ wallet: c.wallet, is_you: c.isSigner, token: c.asset, symbol: c.symbol, before: c.before, after: c.after, change: c.change, raw_change: c.changeRaw, decimals: c.decimals })),
      steps: snakeKeys(loaded.instructions), fee: feeOut(fee),
      simulation: { worked: sim.success, error: sim.error, error_explained: snakeKeys(explanation), compute_used: sim.unitsConsumed, logs: sim.logs },
    };
  },
};

export const checkTransactionIntent: ToolDef = {
  name: "tx_matches",
  oldName: "check_transaction_intent",
  oldInputs: { transaction: "tx", intent: "expected", "expected.recipient": "to", "expected.sender": "from" },
  title: "Does it do what I asked?",
  category: "transactions",
  benefit: { kind: "accuracy", text: "Asked to send 5 USDC, an agent can build a transaction for 50 (a decimals slip) or to a made-up address. This says MISMATCH and names the exact field." },
  useWhen: 'Run just before signing a transfer built from a request like "send 5 USDC to X". Confirms it moves exactly that token, amount and recipient, nothing more. Catches made-up amounts, wrong decimals and hidden steps.',
  usage: '"send 1 USDC to X" is {"tx": "<base64>", "expected": {"token": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "amount": "1", "to": "X"}}',
  description: "Compares the transaction with your request (token, exact amount, recipient, sender), flags every step that isn't the transfer, and checks dry-run balances so money moved any other way is caught.",
  inputs: {
    tx: z.string().min(20),
    expected: z.object({ action: z.literal("transfer").optional(), token: z.string(), amount: z.string(), to: z.string(), from: z.string().optional() }),
    network: NETWORK,
  },
  inputDocs: [
    TX_DOC,
    { name: "expected.token", type: 'string ("SOL" or token address)', required: true, lookingFor: "The token to send.", whereToGet: '"SOL", or the token address from find_token.' },
    { name: "expected.amount", type: "string (decimal)", required: true, lookingFor: 'Normal units: "5" means 5 USDC.', whereToGet: "The user's amount, as a string." },
    { name: "expected.to", type: "string (wallet address)", required: true, lookingFor: "The person's wallet, not their token account.", whereToGet: "The address the user gave you. Never take it from the transaction." },
    { name: "expected.from", type: "string (wallet address)", required: false, lookingFor: "The wallet that pays. Default: the fee payer.", whereToGet: "Your agent's wallet address." },
    NETWORK_DOC,
  ],
  outputs: [
    { field: "verdict", type: '"MATCH" | "MISMATCH"', is: "The answer. MATCH: it does exactly what you asked. MISMATCH: something is off. Don't sign.", howWorkedOut: "MATCH only when every compared field is ok and unexpected is empty." },
    { field: "summary", type: "string", is: "One sentence, naming the first thing that's off.", howWorkedOut: "Built from the failed comparisons." },
    { field: "expected.token_address / raw_amount / decimals / to / from", type: "string | number", is: "What you asked for, in exact on-chain terms.", howWorkedOut: "SOL uses 9 decimals. Tokens use their real on-chain decimals. Converted with exact integer math." },
    { field: "compared[].what", type: '"token" | "amount" | "to" | "from" | "simulation"', is: "What was compared.", howWorkedOut: "A fixed list." },
    { field: "compared[].expected / actual", type: "string", is: "What you asked for, and what the transaction really does.", howWorkedOut: "actual comes from the decoded transfer. For tokens, the recipient is the owner of the receiving token account (read on chain, or from a create-account step in the same transaction)." },
    { field: "compared[].ok", type: "boolean", is: "Whether they match.", howWorkedOut: "Exact equality. Amounts compared in raw units." },
    { field: "transfers[]", type: "object[]", is: "Every transfer in the transaction: step, from, to, token, amount and raw amount.", howWorkedOut: "Decoded System and Token transfers. Token account owners read on chain." },
    { field: "unexpected[]", type: "string[]", is: "Anything you didn't ask for: extra transfers, approvals, authority changes, closed accounts, other programs, or the sender losing more than the transfer explains.", howWorkedOut: "Every step except the matched transfer, Compute Budget, Memo and creating the recipient's token account is listed. Then the sender's dry-run losses are compared with the amount (plus fees and the recipient's account deposit for SOL). Any bigger loss is listed." },
  ],
  notes: [
    "Creating the recipient's token account (about 0.002 SOL deposit) is allowed, since sending a token to a new holder needs it.",
    "Any other step gives MISMATCH, even a harmless one, because a transfer shouldn't need it. Read unexpected before overriding.",
  ],
  example: async (ctx) => ({ tx: await exampleTransaction(ctx.connection("mainnet-beta"), "sol_transfer"), expected: { token: "SOL", amount: "0.01", to: EXAMPLE_RECIPIENT } }),
  run: async ({ tx, expected, network }, ctx) => {
    const conn = ctx.connection(network);
    const loaded = await loadTransaction(conn, tx);
    const isSol = expected.token.trim().toUpperCase() === "SOL";
    const assetMint = isSol ? NATIVE_MINT : assertAddress(expected.token, "expected.token");
    const recipient = assertAddress(expected.to, "expected.to");
    const sender = expected.from ? assertAddress(expected.from, "expected.from") : loaded.feePayer;
    let decimals = 9;
    if (!isSol) {
      const mintInfo = await conn.getParsedAccountInfo(new PublicKey(assetMint), "confirmed");
      const parsed: any = (mintInfo.value?.data as any)?.parsed;
      if (parsed?.type !== "mint") throw new ToolError(422, `${assetMint} is not a token address.`, "expected.token must be \"SOL\" or a token address (find_token).");
      decimals = Number(parsed.info.decimals);
    }
    const amountBase = parseUnits(expected.amount, decimals);

    const tokenIxs = loaded.instructions.filter((i) => i.type === "token_transfer");
    const owners = await tokenAccountOwners(conn, loaded, tokenIxs.flatMap((i) => [String(i.info.source), String(i.info.destination)]));
    const transfers = [
      ...loaded.instructions.filter((i) => i.type === "sol_transfer" || i.type === "sol_transfer_with_seed").map((i) => ({ index: i.index, from: String(i.info.from), to: String(i.info.to), asset: NATIVE_MINT, amountRaw: String(i.info.lamports), decimals: 9 })),
      ...tokenIxs.map((i) => {
        const src = owners.get(String(i.info.source));
        const dst = owners.get(String(i.info.destination));
        return { index: i.index, from: src?.owner ?? String(i.info.authority), to: dst?.owner ?? `unknown owner of ${i.info.destination}`, asset: String(i.info.mint ?? src?.mint ?? dst?.mint ?? "unknown"), amountRaw: String(i.info.amountRaw), decimals: i.info.decimals === null ? null : Number(i.info.decimals) };
      }),
    ].map((t) => ({ ...t, amount: t.decimals === null && t.asset === assetMint ? formatUnits(t.amountRaw, decimals) : t.decimals !== null ? formatUnits(t.amountRaw, t.decimals) : t.amountRaw }));

    const candidates = transfers.filter((t) => t.asset === assetMint);
    const match = candidates.find((t) => t.to === recipient && BigInt(t.amountRaw) === amountBase) ?? candidates.find((t) => t.to === recipient) ?? candidates[0] ?? null;
    const sim = await simulateWithChanges(conn, loaded, symbolsFor(ctx));
    const simError = sim.error;
    const compared = [
      { what: "token", expected: isSol ? "SOL" : assetMint, actual: match ? (match.asset === NATIVE_MINT ? "SOL" : match.asset) : `no ${isSol ? "SOL" : "token"} transfer found`, ok: Boolean(match) },
      { what: "amount", expected: `${expected.amount} (${amountBase} raw)`, actual: match ? `${match.amount} (${match.amountRaw} raw)` : "none", ok: Boolean(match) && BigInt(match!.amountRaw) === amountBase },
      { what: "to", expected: recipient, actual: match?.to ?? "none", ok: match?.to === recipient },
      { what: "from", expected: sender, actual: match?.from ?? "none", ok: match?.from === sender },
      { what: "simulation", expected: "succeeds", actual: simError ? `fails: ${explainError(simError).matches[0]?.name ?? JSON.stringify(simError)}` : "succeeds", ok: !simError },
    ];

    // Besides the matched transfer, only setup steps are expected: compute budget, a memo, and creating the recipient's
    // token account. Anything else (another program, a new account, a swap) can move funds, so it is reported.
    const isSetup = (ix: DecodedInstruction) => ix.programId === COMPUTE_BUDGET_PROGRAM || ix.type === "memo"
      || (ix.type.startsWith("create_token_account") && ix.info.owner === recipient && ix.info.mint === assetMint);
    const signers = new Set(loaded.signers);
    const unexpectedEffects = loaded.instructions.filter((ix) => ix.index !== match?.index && !isSetup(ix)).map((ix) => {
      const t = transfers.find((x) => x.index === ix.index);
      if (t) return `Extra transfer at step ${t.index}: ${t.amount} ${t.asset === NATIVE_MINT ? "SOL" : t.asset} from ${t.from} to ${t.to}.`;
      return permissionCheck(ix, signers)?.detail ?? `Step ${ix.index} (${ix.program ?? ix.programId}: ${ix.type}) is not part of this transfer. It can move money or change permissions.`;
    });

    // Ground truth from the simulation: the sender may lose only the amount, the fees (when it pays them) and the
    // deposit that creates the recipient's token account. This also catches funds moved inside other programs.
    const fee = BigInt(feeBreakdown(loaded).totalLamports);
    const deposits = loaded.instructions.filter((ix) => ix.type.startsWith("create_token_account") && isSetup(ix) && ix.info.payer === sender)
      .reduce((sum, ix) => sum + (sim.lamportDeltas.get(String(ix.info.tokenAccount)) ?? 0n), 0n);
    const allowedLoss = (asset: string) => asset === "SOL"
      ? (isSol ? amountBase : 0n) + (sender === loaded.feePayer ? fee : 0n) + deposits
      : asset === assetMint ? amountBase : 0n;
    for (const c of sim.changes) {
      if (c.wallet !== sender || !c.changeRaw.startsWith("-")) continue;
      const allowed = allowedLoss(c.asset);
      if (-BigInt(c.changeRaw) > allowed) unexpectedEffects.push(`Dry run: the sender loses ${c.change.slice(1)} ${c.symbol ?? c.asset}, but ${c.asset === "SOL" ? "the transfer, fees and deposits account" : "the transfer accounts"} for only ${formatUnits(allowed, c.decimals)}.`);
    }
    const verdict = compared.every((c) => c.ok) && !unexpectedEffects.length ? "MATCH" : "MISMATCH";
    const firstBad = compared.find((c) => !c.ok);
    const summary = verdict === "MATCH"
      ? `The transaction sends exactly ${expected.amount} ${isSol ? "SOL" : assetMint} from ${sender} to ${recipient} and nothing else.`
      : firstBad ? `Wrong ${firstBad.what}: expected ${firstBad.expected}, transaction has ${firstBad.actual}.` : `Unexpected: ${unexpectedEffects[0]}`;
    return {
      network, verdict, summary, expected: { token_address: assetMint, raw_amount: amountBase.toString(), decimals, to: recipient, from: sender }, compared,
      transfers: transfers.map((t) => ({ step: t.index, from: t.from, to: t.to, token: t.asset === NATIVE_MINT ? "SOL" : t.asset, amount: t.amount, raw_amount: t.amountRaw, decimals: t.decimals })),
      unexpected: unexpectedEffects,
    };
  },
};

export const explainTransaction: ToolDef = {
  name: "explain_tx",
  oldName: "explain_transaction",
  oldInputs: { signature: "tx_id" },
  title: "What did this transaction do?",
  category: "transactions",
  benefit: { kind: "accuracy", text: "Reports the real balance changes from chain data, not a model's guess from raw logs. For failures it names the program and the reason." },
  useWhen: "Run after a transaction lands or fails, to report what happened instead of guessing from logs. For failures it names the failing program and the fix.",
  usage: '{"tx_id": "<signature>"}',
  description: "Reads a confirmed transaction: whether it worked, the fee, each wallet's SOL and token changes, the programs used, and why it failed.",
  inputs: { tx_id: z.string().min(64).max(100), network: NETWORK },
  inputDocs: [{ name: "tx_id", type: "string (base58)", required: true, lookingFor: "The transaction's signature.", whereToGet: "Returned when you send, or from history. Never make one up." }, NETWORK_DOC],
  outputs: [
    { field: "result", type: '"success" | "failed"', is: "Whether it worked. Failed transactions still pay fees.", howWorkedOut: "meta.err is empty for success." },
    { field: "summary", type: "string", is: "What happened, in a few plain sentences.", howWorkedOut: "Built from the result, the fee and the biggest balance changes." },
    { field: "time / slot", type: "string | number", is: "When and where it landed.", howWorkedOut: "Block time in ISO 8601, and the slot." },
    { field: "fee_payer / signers", type: "string / string[]", is: "Who paid the fee and who signed.", howWorkedOut: "The first account, and the accounts marked as signers." },
    { field: "fee.lamports / fee.sol", type: "string", is: "The fee charged.", howWorkedOut: "meta.fee." },
    { field: "programs[]", type: "{ address, name }[]", is: "The programs the transaction called.", howWorkedOut: "Each top-level step's program, with its name when we know it." },
    { field: "sol_changes[]", type: "{ account, before, after, change, raw_change }[]", is: "Every account whose SOL changed, fee included.", howWorkedOut: "Balances before vs after, exact decimals." },
    { field: "token_changes[]", type: "{ owner, token, symbol, before, after, change, raw_change }[]", is: "Every token balance that changed, by owner wallet and token.", howWorkedOut: "Token balances before vs after, with each token's decimals. Tickers from Jupiter." },
    { field: "compute_used", type: "number | null", is: "Compute units used.", howWorkedOut: "meta.computeUnitsConsumed." },
    { field: "failure", type: "object | null", is: "For failed transactions: the raw error, the step and program that failed, what it means, and the last log lines.", howWorkedOut: "meta.err decoded. The failing program is the program of the failing step. The meaning comes from why_failed." },
  ],
  example: async (ctx) => {
    const sigs = await ctx.connection("mainnet-beta").getSignaturesForAddress(new PublicKey(EXAMPLE_WALLET), { limit: 10 }, "confirmed");
    const ok = sigs.find((s) => !s.err) ?? sigs[0];
    if (!ok) throw new ToolError(503, "Could not load a recent example signature.", "Retry in a moment.");
    return { tx_id: ok.signature };
  },
  run: async ({ tx_id, network }, ctx) => {
    const tx = await ctx.connection(network).getParsedTransaction(String(tx_id).trim(), { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
    if (!tx) throw new ToolError(404, "Transaction not found.", "Check the tx_id and network. Very new transactions can take a few seconds to appear; very old ones may be pruned by this RPC.");
    const meta = tx.meta!;
    const keys = tx.transaction.message.accountKeys.map((k) => k.pubkey.toBase58());
    const signers = tx.transaction.message.accountKeys.filter((k) => k.signer).map((k) => k.pubkey.toBase58());
    const instructions = tx.transaction.message.instructions;
    const programs = [...new Set(instructions.map((i) => i.programId.toBase58()))].map((programId) => ({ programId, label: labelFor(programId) }));
    const solChanges = keys.map((account, i) => ({ account, before: BigInt(meta.preBalances[i]), after: BigInt(meta.postBalances[i]) })).filter((c) => c.before !== c.after)
      .map((c) => ({ account: c.account, before: lamportsToSol(c.before), after: lamportsToSol(c.after), change: formatUnits(c.after - c.before, 9), changeRaw: (c.after - c.before).toString() }));
    const tokenMap = new Map<string, { owner: string; mint: string; decimals: number; before: bigint; after: bigint }>();
    const addToken = (b: any, side: "before" | "after") => {
      const key = `${b.owner ?? keys[b.accountIndex]}:${b.mint}`;
      const entry = tokenMap.get(key) ?? { owner: b.owner ?? keys[b.accountIndex], mint: b.mint, decimals: b.uiTokenAmount.decimals, before: 0n, after: 0n };
      entry[side] += BigInt(b.uiTokenAmount.amount);
      tokenMap.set(key, entry);
    };
    (meta.preTokenBalances ?? []).forEach((b) => addToken(b, "before"));
    (meta.postTokenBalances ?? []).forEach((b) => addToken(b, "after"));
    const changed = [...tokenMap.values()].filter((t) => t.before !== t.after);
    const names = await symbolsFor(ctx)(changed.map((t) => t.mint));
    const tokenChanges = changed.map((t) => ({ owner: t.owner, mint: t.mint, symbol: names.get(t.mint) ?? null, before: formatUnits(t.before, t.decimals), after: formatUnits(t.after, t.decimals), change: formatUnits(t.after - t.before, t.decimals), changeRaw: (t.after - t.before).toString() }));

    let failure = null;
    if (meta.err) {
      const parsed = explainError(meta.err);
      const failingIndex = parsed.instructionIndex;
      const failingProgram = failingIndex !== null && instructions[failingIndex] ? instructions[failingIndex].programId.toBase58() : null;
      const withProgram = explainError(meta.err, failingProgram ?? undefined);
      failure = { error: meta.err, failed_step: failingIndex, failed_program: failingProgram, failed_program_name: failingProgram ? labelFor(failingProgram) : null, explanation: withProgram.matches[0] ?? null, last_logs: (meta.logMessages ?? []).slice(-12) };
    }
    const biggest = [...tokenChanges.map((t) => `${t.owner.slice(0, 4)}…${t.owner.slice(-4)} ${t.change.startsWith("-") ? "" : "+"}${t.change} ${t.symbol ?? t.mint.slice(0, 6)}`),
      ...solChanges.filter((c) => c.account !== keys[0] || BigInt(c.changeRaw) !== -BigInt(meta.fee)).slice(0, 3).map((c) => `${c.account.slice(0, 4)}…${c.account.slice(-4)} ${c.change.startsWith("-") ? "" : "+"}${c.change} SOL`)].slice(0, 5);
    const summary = `${meta.err ? "Failed" : "Succeeded"}${programs.length ? ` (${programs.map((p) => p.label ?? p.programId.slice(0, 8)).join(", ")})` : ""}. Fee payer ${keys[0]} paid ${lamportsToSol(meta.fee)} SOL in fees.${biggest.length ? ` Balance changes: ${biggest.join("; ")}.` : " No balance changes besides the fee."}${failure?.explanation ? ` Failed: ${failure.explanation.name}. ${failure.explanation.fix}` : ""}`;
    return {
      tx_id, network, result: meta.err ? "failed" : "success", summary, time: isoTime(tx.blockTime), slot: tx.slot, fee_payer: keys[0], signers,
      fee: { lamports: String(meta.fee), sol: lamportsToSol(meta.fee) },
      programs: programs.map((p) => ({ address: p.programId, name: p.label })),
      sol_changes: solChanges.map((c) => ({ account: c.account, before: c.before, after: c.after, change: c.change, raw_change: c.changeRaw })),
      token_changes: tokenChanges.map((t) => ({ owner: t.owner, token: t.mint, symbol: t.symbol, before: t.before, after: t.after, change: t.change, raw_change: t.changeRaw })),
      compute_used: meta.computeUnitsConsumed ?? null, failure: snakeKeys(failure),
    };
  },
};

const percentile = (sorted: number[], p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : 0);

export const feeAdvice: ToolDef = {
  name: "fee",
  oldName: "fee_advice",
  oldInputs: { transaction: "tx" },
  title: "What fee to pay",
  category: "network",
  benefit: { kind: "money", text: "Prices are in micro-lamports per compute unit, the unit setComputeUnitPrice takes. Mixing that up with lamports overpays a million times." },
  useWhen: "Run before setting a priority fee. Gives the price in the unit Compute Budget expects (micro-lamports per compute unit) and the total in SOL, so a unit mix-up never overpays.",
  usage: '{} for network prices, or {"tx": "<base64>"} for your own',
  description: "Turns recent priority fees into three prices: cheap, normal, fast. Pass your transaction to get its compute limit and exact cost at each.",
  inputs: { tx: z.string().min(20).optional(), network: NETWORK },
  inputDocs: [
    { ...TX_DOC, required: false, lookingFor: "Your transaction, so fees match its accounts and compute comes from a dry run." },
    NETWORK_DOC,
  ],
  outputs: [
    { field: "unit", type: "string", is: 'Always "micro-lamports per compute unit". 1,000,000 micro-lamports = 1 lamport. It is the unit setComputeUnitPrice takes.', howWorkedOut: "Fixed." },
    { field: "based_on", type: "string", is: "Which fees were sampled: the accounts your transaction writes to, or the whole network.", howWorkedOut: "Your transaction's writable accounts when given, otherwise network-wide." },
    { field: "samples / share_paying", type: "number", is: "How many recent slots were sampled, and the share that paid any priority fee.", howWorkedOut: "getRecentPrioritizationFees (about the last 150 slots)." },
    { field: "prices.cheap / normal / fast .compute_unit_price", type: "number", is: "The price to set with setComputeUnitPrice. cheap usually lands within a few slots when it's quiet. fast is for urgent trades.", howWorkedOut: "The 50th, 75th and 90th percentile of sampled fees (at least 1 for normal and fast when everything sampled is zero)." },
    { field: "prices.*.priority_lamports / total_lamports / total_sol", type: "string", is: "What the transaction would pay at that price.", howWorkedOut: "priority = price x compute units / 1,000,000, rounded up. total = priority + 5000 lamports per signature." },
    { field: "compute_units", type: "number", is: "The compute units the costs are worked out for.", howWorkedOut: "With a transaction: dry-run units used + 10%. Without: 200,000 (a typical one-step default)." },
    { field: "compute_units_from", type: "string", is: "Whether compute_units came from a dry run or the default.", howWorkedOut: '"simulation" or "default".' },
    { field: "how_to_use", type: "string", is: "The two Compute Budget steps to add.", howWorkedOut: "Built from the normal price and compute_units." },
  ],
  example: async (ctx) => ({ tx: await exampleTransaction(ctx.connection("mainnet-beta"), "sol_transfer") }),
  run: async ({ tx, network }, ctx) => {
    const conn = ctx.connection(network);
    let accounts: PublicKey[] = [];
    let computeUnits = 200_000;
    let computeUnitsSource = "default";
    let signatures = 1;
    if (tx) {
      const loaded = await loadTransaction(conn, tx);
      accounts = loaded.writable.slice(0, 128).map((a) => new PublicKey(a));
      signatures = loaded.signers.length;
      const sim = await conn.simulateTransaction(loaded.tx, { sigVerify: false, replaceRecentBlockhash: true, commitment: "confirmed" });
      if (sim.value.unitsConsumed) { computeUnits = Math.ceil(sim.value.unitsConsumed * 1.1); computeUnitsSource = "simulation"; }
    }
    const fees = (await conn.getRecentPrioritizationFees(accounts.length ? { lockedWritableAccounts: accounts } : undefined)).map((f) => f.prioritizationFee).sort((a, b) => a - b);
    const tier = (price: number) => {
      const priority = (BigInt(price) * BigInt(computeUnits) + 999_999n) / 1_000_000n;
      const total = priority + BigInt(BASE_FEE_LAMPORTS_PER_SIGNATURE * signatures);
      return { compute_unit_price: price, priority_lamports: priority.toString(), total_lamports: total.toString(), total_sol: lamportsToSol(total) };
    };
    const p50 = percentile(fees, 50), p75 = Math.max(percentile(fees, 75), 1), p90 = Math.max(percentile(fees, 90), p75, 1);
    const prices = { cheap: tier(p50), normal: tier(p75), fast: tier(p90) };
    return {
      network, unit: "micro-lamports per compute unit", based_on: accounts.length ? `${accounts.length} writable account(s) in your transaction` : "network-wide",
      samples: fees.length, share_paying: fees.length ? Math.round((fees.filter((f) => f > 0).length / fees.length) * 100) / 100 : 0,
      prices, compute_units: computeUnits, compute_units_from: computeUnitsSource,
      how_to_use: `Add ComputeBudgetProgram.setComputeUnitLimit({ units: ${computeUnits} }) and ComputeBudgetProgram.setComputeUnitPrice({ microLamports: ${prices.normal.compute_unit_price} }) as the first instructions.`,
    };
  },
};

export const TRANSACTION_TOOLS = [preflightTransaction, checkTransactionIntent, explainTransaction, feeAdvice];
export { exampleTransaction };
