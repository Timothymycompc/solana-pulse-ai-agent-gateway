// Transaction intelligence: check before signing, verify intent, explain what happened, and price fees correctly.
import { ComputeBudgetProgram, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction, type Connection } from "@solana/web3.js";
import { createApproveInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { z } from "zod";
import { feeBreakdown, loadTransaction, simulateWithChanges, tokenAccountOwners, type LoadedTransaction } from "./decode";
import { explainError } from "./errors";
import {
  assertAddress, BASE_FEE_LAMPORTS_PER_SIGNATURE, EXAMPLE_RECIPIENT, EXAMPLE_WALLET, formatUnits, isoTime, jupByMints, labelFor,
  lamportsToSol, NATIVE_MINT, NETWORK_DOC, parseUnits, USDC_MINT,
} from "./lib";
import { ToolError, type ToolContext, type ToolDef } from "./types";

const NETWORK = z.enum(["mainnet-beta", "devnet"]).optional().default("mainnet-beta");
const TX_DOC = {
  name: "transaction", type: "string (base64)", required: true,
  description: "The unsigned (or signed) transaction, serialized and base64-encoded. Legacy and v0 transactions with lookup tables are supported. Signatures are not checked.",
  howToGet: "From your wallet SDK before signing: Buffer.from(tx.serialize({ requireAllSignatures: false })).toString('base64'), or the swap transaction returned by an aggregator API.",
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

type Check = { id: string; status: "pass" | "info" | "warn" | "fail"; detail: string };

function permissionChecks(loaded: LoadedTransaction, signers: Set<string>): Check[] {
  const checks: Check[] = [];
  for (const ix of loaded.instructions) {
    if (ix.type === "token_approve" && !signers.has(String(ix.info.delegate))) {
      checks.push({ id: "token_approval", status: "fail", detail: `Instruction ${ix.index} lets ${ix.info.delegate} move up to ${ix.info.amountRaw} base units from token account ${ix.info.account} at any time. This is the most common wallet-drainer pattern.` });
    }
    if (ix.type === "token_set_authority") {
      checks.push({ id: "authority_change", status: "fail", detail: `Instruction ${ix.index} changes the ${ix.info.authorityType} authority of ${ix.info.account} to ${ix.info.newAuthority ?? "nobody"}. Whoever holds that authority controls the account.` });
    }
    if (ix.type === "assign_owner" && signers.has(String(ix.info.account))) {
      checks.push({ id: "wallet_reassigned", status: "fail", detail: `Instruction ${ix.index} hands ownership of signer ${ix.info.account} to program ${ix.info.newOwnerProgram}. The wallet would stop being a normal wallet.` });
    }
    if (ix.type === "token_close_account" && !signers.has(String(ix.info.destination))) {
      checks.push({ id: "close_to_other", status: "fail", detail: `Instruction ${ix.index} closes token account ${ix.info.account} and sends its SOL deposit to ${ix.info.destination}, which is not a signer.` });
    }
  }
  return checks;
}

export const preflightTransaction: ToolDef = {
  name: "preflight_transaction",
  title: "Check before signing",
  category: "transactions",
  useWhen: "Use on every transaction before your agent signs it. Shows exactly what each wallet gains and loses, blocks drainer patterns, and catches failures and expired blockhashes before any fee is spent.",
  description: "Decodes every instruction, simulates the transaction against live state, computes each wallet's SOL and token changes, and returns OK, REVIEW or BLOCK with reasons.",
  inputs: { transaction: z.string().min(20), network: NETWORK },
  inputDocs: [TX_DOC, NETWORK_DOC],
  outputs: [
    { field: "verdict", type: '"OK" | "REVIEW" | "BLOCK"', meaning: "BLOCK: do not sign (a failing check). REVIEW: a human or the agent's policy should confirm (a warning). OK: nothing found.", howComputed: "Worst status across checks: fail gives BLOCK, warn gives REVIEW, otherwise OK." },
    { field: "summary", type: "string", meaning: "One sentence: the verdict and the main reason.", howComputed: "Built from the worst checks and the signer's balance changes." },
    { field: "checks[].id", type: "string", meaning: "simulation, blockhash, fee_payer_balance, token_approval, authority_change, wallet_reassigned, close_to_other, unknown_programs, priority_fee, outflow.", howComputed: "Fixed list of checks." },
    { field: "checks[].status", type: '"pass" | "info" | "warn" | "fail"', meaning: "Result of the check.", howComputed: "simulation fails if the dry run errors; blockhash warns if expired; fee_payer_balance fails if the payer cannot cover fees; approvals to non-signers, authority changes, reassigning a signer and closing to a non-signer fail; unknown programs warn; priority fee over 0.01 SOL warns; outflows from signers are info." },
    { field: "checks[].detail", type: "string", meaning: "The specific finding in plain words.", howComputed: "Built from decoded instructions and simulation." },
    { field: "walletChanges[].wallet", type: "string", meaning: "The wallet (or account) whose balance changes.", howComputed: "For SOL: the account itself. For tokens: the owner of the token account." },
    { field: "walletChanges[].asset / symbol", type: "string", meaning: '"SOL" or the token mint, and its ticker.', howComputed: "From account data; ticker from Jupiter." },
    { field: "walletChanges[].before / after / change", type: "string (decimal)", meaning: "Balance before, after, and the difference. Negative means the wallet loses it.", howComputed: "Pre-state from getMultipleAccountsInfo, post-state from simulateTransaction's returned accounts, formatted with exact decimals. SOL changes include fees." },
    { field: "walletChanges[].isSigner", type: "boolean", meaning: "True when the wallet signs this transaction (so it is you).", howComputed: "Wallet is among the transaction's required signers." },
    { field: "instructions[]", type: "object[]", meaning: "Every instruction decoded: index, program, type (sol_transfer, token_transfer, token_approve, token_set_authority, token_close_account, create_token_account, set_compute_unit_price, unknown_program and more) and its key fields.", howComputed: "Decoded from the instruction data for System, SPL Token, Token-2022, Compute Budget, Associated Token Account and Memo programs." },
    { field: "fee.baseLamports / priorityLamports / totalLamports / totalSol", type: "string", meaning: "What this transaction will cost in fees.", howComputed: "Base: 5000 lamports x signatures. Priority: ceil(microLamportsPerComputeUnit x computeUnitLimit / 1,000,000)." },
    { field: "fee.computeUnitLimit / computeUnitLimitSource / microLamportsPerComputeUnit", type: "number | string", meaning: "The compute settings fees are charged on.", howComputed: "From the transaction's Compute Budget instructions, or the runtime default when absent." },
    { field: "simulation.success / error / unitsConsumed / logs", type: "object", meaning: "The raw dry-run result: whether it worked, the error, compute used, and the last 25 log lines.", howComputed: "simulateTransaction with sigVerify off and a fresh blockhash." },
    { field: "simulation.errorExplanation", type: "object | null", meaning: "Plain-language explanation of a failure.", howComputed: "explain_error applied to the simulation error." },
  ],
  notes: [
    "Simulation runs against current state; a later send can still differ if state changes.",
    "Balance changes cover up to 64 writable accounts.",
  ],
  example: async (ctx) => ({ transaction: await exampleTransaction(ctx.connection("mainnet-beta"), "sol_transfer") }),
  run: async ({ transaction, network }, ctx) => {
    const conn = ctx.connection(network);
    const loaded = await loadTransaction(conn, transaction);
    const signers = new Set(loaded.signers);
    const [sim, blockhashValid, payerBalance] = await Promise.all([
      simulateWithChanges(conn, loaded, symbolsFor(ctx)),
      conn.isBlockhashValid(loaded.recentBlockhash, { commitment: "confirmed" }).then((r) => r.value).catch(() => null),
      conn.getBalance(new PublicKey(loaded.feePayer), "confirmed"),
    ]);
    const fee = feeBreakdown(loaded);
    const checks: Check[] = [];
    const explanation = sim.error ? explainError(sim.error).matches[0] ?? null : null;
    checks.push(sim.success ? { id: "simulation", status: "pass", detail: `Dry run succeeded using ${sim.unitsConsumed ?? "?"} compute units.` } : { id: "simulation", status: "fail", detail: `Dry run failed: ${explanation ? `${explanation.name}: ${explanation.meaning} Fix: ${explanation.fix}` : JSON.stringify(sim.error)}` });
    if (blockhashValid === false) checks.push({ id: "blockhash", status: "warn", detail: "The transaction's blockhash has expired, so it would be rejected. It was simulated with a fresh one; rebuild with get_solana_blockhash before signing." });
    else if (blockhashValid) checks.push({ id: "blockhash", status: "pass", detail: "Blockhash is still valid." });
    checks.push(BigInt(payerBalance) >= BigInt(fee.totalLamports) ? { id: "fee_payer_balance", status: "pass", detail: `Fee payer holds ${lamportsToSol(payerBalance)} SOL; fees are ${fee.totalSol} SOL.` } : { id: "fee_payer_balance", status: "fail", detail: `Fee payer holds ${lamportsToSol(payerBalance)} SOL but fees are ${fee.totalSol} SOL.` });
    checks.push(...permissionChecks(loaded, signers));
    const unknown = [...new Set(loaded.instructions.filter((i) => i.type === "unknown_program").map((i) => i.programId))];
    if (unknown.length) checks.push({ id: "unknown_programs", status: "warn", detail: `Calls program(s) the gateway does not recognize: ${unknown.join(", ")}. Make sure you trust them.` });
    if (BigInt(fee.priorityLamports) > 10_000_000n) checks.push({ id: "priority_fee", status: "warn", detail: `Priority fee is ${lamportsToSol(fee.priorityLamports)} SOL, unusually high. fee_advice shows a fair price.` });
    const changes = sim.changes.map((c) => ({ ...c, isSigner: signers.has(c.wallet) }));
    const outflows = changes.filter((c) => c.isSigner && c.changeRaw.startsWith("-"));
    if (outflows.length) checks.push({ id: "outflow", status: "info", detail: `Your wallet sends: ${outflows.map((c) => `${c.change.slice(1)} ${c.symbol ?? c.asset}`).join(", ")} (SOL includes fees).` });
    const fails = checks.filter((c) => c.status === "fail");
    const warns = checks.filter((c) => c.status === "warn");
    const verdict = fails.length ? "BLOCK" : warns.length ? "REVIEW" : "OK";
    const summary = `${verdict}: ${fails[0]?.detail ?? warns[0]?.detail ?? (outflows.length ? checks.find((c) => c.id === "outflow")!.detail : "No issues found and no outflows from signers besides fees.")}`;
    return {
      network, verdict, summary, feePayer: loaded.feePayer, signers: loaded.signers, checks, walletChanges: changes,
      instructions: loaded.instructions, fee, simulation: { success: sim.success, error: sim.error, errorExplanation: explanation, unitsConsumed: sim.unitsConsumed, logs: sim.logs },
    };
  },
};

export const checkTransactionIntent: ToolDef = {
  name: "check_transaction_intent",
  title: "Does it do what I meant?",
  category: "transactions",
  useWhen: 'Use right before signing a transfer your agent built from an instruction like "send 5 USDC to X". Confirms the transaction moves exactly that token, amount and recipient and nothing else, catching hallucinated amounts, wrong decimals and injected instructions.',
  description: "Compares a transaction against the stated intent field by field (asset, amount in exact base units, recipient, sender) and flags any extra transfers or permission changes.",
  inputs: {
    transaction: z.string().min(20),
    intent: z.object({ action: z.literal("transfer").optional().default("transfer"), token: z.string(), amount: z.string(), recipient: z.string(), sender: z.string().optional() }),
    network: NETWORK,
  },
  inputDocs: [
    TX_DOC,
    { name: "intent.token", type: 'string ("SOL" or mint)', required: true, description: "What should be sent.", howToGet: 'Use "SOL" for native SOL, otherwise the mint from resolve_token.' },
    { name: "intent.amount", type: "string (decimal)", required: true, description: 'How much should be sent, in human units, e.g. "5" for 5 USDC.', howToGet: "The amount the user asked for, as a string." },
    { name: "intent.recipient", type: "string (wallet address)", required: true, description: "The wallet that should receive it (the person, not their token account).", howToGet: "The address the user gave. Do not take it from the transaction itself." },
    { name: "intent.sender", type: "string (wallet address)", required: false, description: "The wallet that should pay. Defaults to the transaction's fee payer.", howToGet: "Your agent's wallet address." },
    { name: "intent.action", type: '"transfer"', required: false, description: "The kind of intent. Only transfers are supported today.", howToGet: 'Leave out, or pass "transfer".' },
    NETWORK_DOC,
  ],
  outputs: [
    { field: "verdict", type: '"MATCH" | "MISMATCH"', meaning: "MATCH: the transaction does exactly what the intent says. MISMATCH: at least one field check failed; do not sign.", howComputed: "MATCH only when every fieldChecks entry is ok and unexpectedEffects is empty." },
    { field: "explanation", type: "string", meaning: "Plain-language result, naming the first mismatch.", howComputed: "Built from the failed checks." },
    { field: "expected.assetMint / amountBaseUnits / decimals", type: "string | number", meaning: "The intent converted to exact on-chain terms.", howComputed: "SOL uses 9 decimals; tokens use the mint's on-chain decimals; amount converted with exact integer math." },
    { field: "fieldChecks[].field", type: '"asset" | "amount" | "recipient" | "sender" | "simulation"', meaning: "What was compared.", howComputed: "Fixed list." },
    { field: "fieldChecks[].expected / actual", type: "string", meaning: "The intended value and what the transaction actually does.", howComputed: "actual comes from the decoded transfer instruction; for tokens the recipient is the owner of the destination token account (read on chain, or from an ATA-create instruction in the same transaction)." },
    { field: "fieldChecks[].ok", type: "boolean", meaning: "Whether they match.", howComputed: "Exact equality (amounts compared in base units)." },
    { field: "transfers[]", type: "object[]", meaning: "Every transfer found in the transaction with from wallet, to wallet, asset and exact amount.", howComputed: "Decoded System and Token transfer instructions; token account owners resolved on chain." },
    { field: "unexpectedEffects[]", type: "string[]", meaning: "Anything the intent did not ask for: extra transfers out of the sender, approvals, authority changes, account closures to others.", howComputed: "Transfers other than the matched one whose source is the sender, plus the permission checks used by preflight_transaction." },
  ],
  notes: ["Creating the recipient's token account (about 0.002 SOL deposit) is allowed and reported as expected, since token transfers to new holders need it."],
  example: async (ctx) => ({ transaction: await exampleTransaction(ctx.connection("mainnet-beta"), "sol_transfer"), intent: { action: "transfer", token: "SOL", amount: "0.01", recipient: EXAMPLE_RECIPIENT } }),
  run: async ({ transaction, intent, network }, ctx) => {
    const conn = ctx.connection(network);
    const loaded = await loadTransaction(conn, transaction);
    const isSol = intent.token.trim().toUpperCase() === "SOL";
    const assetMint = isSol ? NATIVE_MINT : assertAddress(intent.token, "intent.token");
    const recipient = assertAddress(intent.recipient, "intent.recipient");
    const sender = intent.sender ? assertAddress(intent.sender, "intent.sender") : loaded.feePayer;
    let decimals = 9;
    if (!isSol) {
      const mintInfo = await conn.getParsedAccountInfo(new PublicKey(assetMint), "confirmed");
      const parsed: any = (mintInfo.value?.data as any)?.parsed;
      if (parsed?.type !== "mint") throw new ToolError(422, `${assetMint} is not a token mint.`, "intent.token must be \"SOL\" or a mint address (resolve_token).");
      decimals = Number(parsed.info.decimals);
    }
    const amountBase = parseUnits(intent.amount, decimals);

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
    const sim = await conn.simulateTransaction(loaded.tx, { sigVerify: false, replaceRecentBlockhash: true, commitment: "confirmed" });
    const simError = sim.value.err;
    const fieldChecks = [
      { field: "asset", expected: isSol ? "SOL" : assetMint, actual: match ? (match.asset === NATIVE_MINT ? "SOL" : match.asset) : `no ${isSol ? "SOL" : "token"} transfer found`, ok: Boolean(match) },
      { field: "amount", expected: `${intent.amount} (${amountBase} base units)`, actual: match ? `${match.amount} (${match.amountRaw} base units)` : "none", ok: Boolean(match) && BigInt(match!.amountRaw) === amountBase },
      { field: "recipient", expected: recipient, actual: match?.to ?? "none", ok: match?.to === recipient },
      { field: "sender", expected: sender, actual: match?.from ?? "none", ok: match?.from === sender },
      { field: "simulation", expected: "succeeds", actual: simError ? `fails: ${explainError(simError).matches[0]?.name ?? JSON.stringify(simError)}` : "succeeds", ok: !simError },
    ];
    const unexpectedEffects = [
      ...transfers.filter((t) => t !== match && t.from === sender).map((t) => `Extra transfer at instruction ${t.index}: ${t.amount} ${t.asset === NATIVE_MINT ? "SOL" : t.asset} to ${t.to}.`),
      ...permissionChecks(loaded, new Set(loaded.signers)).map((c) => c.detail),
    ];
    const verdict = fieldChecks.every((c) => c.ok) && !unexpectedEffects.length ? "MATCH" : "MISMATCH";
    const firstBad = fieldChecks.find((c) => !c.ok);
    const explanation = verdict === "MATCH"
      ? `The transaction sends exactly ${intent.amount} ${isSol ? "SOL" : assetMint} from ${sender} to ${recipient} and does nothing else unexpected.`
      : firstBad ? `Mismatch on ${firstBad.field}: expected ${firstBad.expected}, transaction has ${firstBad.actual}.` : `Unexpected effect: ${unexpectedEffects[0]}`;
    return { network, verdict, explanation, expected: { assetMint, amountBaseUnits: amountBase.toString(), decimals, recipient, sender }, fieldChecks, transfers, unexpectedEffects };
  },
};

export const explainTransaction: ToolDef = {
  name: "explain_transaction",
  title: "What happened in this transaction?",
  category: "transactions",
  useWhen: "Use after a transaction lands (or fails) to report what actually happened, instead of guessing from logs. For failures it names the failing program and the fix.",
  description: "Reads a confirmed transaction and returns status, fee, every SOL and token balance change by wallet, the programs used, and a decoded failure reason.",
  inputs: { signature: z.string().min(64).max(100), network: NETWORK },
  inputDocs: [{ name: "signature", type: "string (base58)", required: true, description: "The transaction signature (its id).", howToGet: "Returned when you send a transaction, or from get_recent_transactions. Never invent one." }, NETWORK_DOC],
  outputs: [
    { field: "status", type: '"success" | "failed"', meaning: "Whether the transaction succeeded. Failed transactions still pay fees.", howComputed: "meta.err is null for success." },
    { field: "summary", type: "string", meaning: "One-paragraph plain-language account of what happened.", howComputed: "Built from the status, fee and the largest balance changes." },
    { field: "time / slot", type: "string | number", meaning: "When and where it landed.", howComputed: "blockTime as ISO 8601, and slot." },
    { field: "feePayer / signers", type: "string / string[]", meaning: "Who paid the fee and who signed.", howComputed: "First account key, and keys flagged as signers." },
    { field: "fee.lamports / fee.sol", type: "string", meaning: "Fee charged.", howComputed: "meta.fee." },
    { field: "programs[]", type: "{ programId, label }[]", meaning: "Programs the transaction called at the top level.", howComputed: "Unique program ids of the instructions, with known labels." },
    { field: "solChanges[]", type: "{ account, before, after, change }[]", meaning: "Every account whose SOL changed, including the fee.", howComputed: "meta.preBalances vs meta.postBalances, exact decimals." },
    { field: "tokenChanges[]", type: "{ owner, mint, symbol, before, after, change }[]", meaning: "Every token balance that changed, grouped by owner wallet and mint.", howComputed: "meta.preTokenBalances vs meta.postTokenBalances (amounts in base units, formatted with each token's decimals); tickers from Jupiter." },
    { field: "computeUnitsConsumed", type: "number | null", meaning: "Compute used.", howComputed: "meta.computeUnitsConsumed." },
    { field: "failure", type: "object | null", meaning: "For failed transactions: the raw error, the failing instruction index and program, a plain-language explanation and the last log lines.", howComputed: "meta.err parsed; failing program is the program of the instruction index in InstructionError; explanation from explain_error with that program." },
  ],
  example: async (ctx) => {
    const sigs = await ctx.connection("mainnet-beta").getSignaturesForAddress(new PublicKey(EXAMPLE_WALLET), { limit: 10 }, "confirmed");
    const ok = sigs.find((s) => !s.err) ?? sigs[0];
    if (!ok) throw new ToolError(503, "Could not load a recent example signature.", "Retry in a moment.");
    return { signature: ok.signature };
  },
  run: async ({ signature, network }, ctx) => {
    const tx = await ctx.connection(network).getParsedTransaction(String(signature).trim(), { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
    if (!tx) throw new ToolError(404, "Transaction not found.", "Check the signature and network. Very new transactions can take a few seconds to appear; very old ones may be pruned by this RPC.");
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
      failure = { error: meta.err, failingInstruction: failingIndex, failingProgram, failingProgramLabel: failingProgram ? labelFor(failingProgram) : null, explanation: withProgram.matches[0] ?? null, logsTail: (meta.logMessages ?? []).slice(-12) };
    }
    const biggest = [...tokenChanges.map((t) => `${t.owner.slice(0, 4)}…${t.owner.slice(-4)} ${t.change.startsWith("-") ? "" : "+"}${t.change} ${t.symbol ?? t.mint.slice(0, 6)}`),
      ...solChanges.filter((c) => c.account !== keys[0] || BigInt(c.changeRaw) !== -BigInt(meta.fee)).slice(0, 3).map((c) => `${c.account.slice(0, 4)}…${c.account.slice(-4)} ${c.change.startsWith("-") ? "" : "+"}${c.change} SOL`)].slice(0, 5);
    const summary = `${meta.err ? "Failed" : "Succeeded"}${programs.length ? ` (${programs.map((p) => p.label ?? p.programId.slice(0, 8)).join(", ")})` : ""}. Fee payer ${keys[0]} paid ${lamportsToSol(meta.fee)} SOL in fees.${biggest.length ? ` Balance changes: ${biggest.join("; ")}.` : " No balance changes besides the fee."}${failure?.explanation ? ` Failure: ${failure.explanation.name}. ${failure.explanation.fix}` : ""}`;
    return {
      signature, network, status: meta.err ? "failed" : "success", summary, time: isoTime(tx.blockTime), slot: tx.slot, feePayer: keys[0], signers,
      fee: { lamports: String(meta.fee), sol: lamportsToSol(meta.fee) }, programs, solChanges, tokenChanges, computeUnitsConsumed: meta.computeUnitsConsumed ?? null, failure,
    };
  },
};

const percentile = (sorted: number[], p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : 0);

export const feeAdvice: ToolDef = {
  name: "fee_advice",
  title: "Priority fee advice",
  category: "network",
  useWhen: "Use before setting a priority fee. Gives prices in the exact unit Compute Budget expects (micro-lamports per compute unit) and the total cost in SOL, so you never overpay by a unit mistake.",
  description: "Turns recent on-chain priority fees into three price tiers and, when you pass your transaction, a compute limit and exact cost for each tier.",
  inputs: { transaction: z.string().min(20).optional(), network: NETWORK },
  inputDocs: [
    { ...TX_DOC, required: false, description: "Optional. Your transaction, so fees are measured on the accounts it writes to and compute is measured by simulation." },
    NETWORK_DOC,
  ],
  outputs: [
    { field: "unit", type: "string", meaning: 'Always "micro-lamports per compute unit". 1,000,000 micro-lamports = 1 lamport. This is the unit setComputeUnitPrice takes.', howComputed: "Fixed." },
    { field: "basedOn", type: "string", meaning: "Which fees were sampled: the accounts your transaction writes to, or network-wide.", howComputed: "Writable accounts of the transaction when given, else none (global)." },
    { field: "samples / nonZeroShare", type: "number", meaning: "How many recent slots were sampled, and the share that paid any priority fee.", howComputed: "getRecentPrioritizationFees (about the last 150 slots)." },
    { field: "tiers.economy / standard / fast .microLamportsPerComputeUnit", type: "number", meaning: "Price to set with setComputeUnitPrice. economy usually lands within a few slots in calm conditions; fast is for urgent trades.", howComputed: "The 50th, 75th and 90th percentile of sampled fees (at least 1 for standard and fast when everything sampled is zero)." },
    { field: "tiers.*.priorityLamports / totalLamports / totalSol", type: "string", meaning: "What the transaction would pay at that tier.", howComputed: "priority = ceil(price x computeUnits / 1,000,000); total = priority + 5000 lamports x signatures." },
    { field: "computeUnits", type: "number", meaning: "Compute units the costs are calculated for.", howComputed: "With a transaction: simulated units consumed + 10% headroom. Without: 200,000 (a typical single-instruction default)." },
    { field: "computeUnitsSource", type: "string", meaning: "Whether computeUnits came from simulation or the default.", howComputed: '"simulation" or "default".' },
    { field: "howToApply", type: "string", meaning: "The two Compute Budget instructions to add.", howComputed: "Built from the standard tier and computeUnits." },
  ],
  example: async (ctx) => ({ transaction: await exampleTransaction(ctx.connection("mainnet-beta"), "sol_transfer") }),
  run: async ({ transaction, network }, ctx) => {
    const conn = ctx.connection(network);
    let accounts: PublicKey[] = [];
    let computeUnits = 200_000;
    let computeUnitsSource = "default";
    let signatures = 1;
    if (transaction) {
      const loaded = await loadTransaction(conn, transaction);
      accounts = loaded.writable.slice(0, 128).map((a) => new PublicKey(a));
      signatures = loaded.signers.length;
      const sim = await conn.simulateTransaction(loaded.tx, { sigVerify: false, replaceRecentBlockhash: true, commitment: "confirmed" });
      if (sim.value.unitsConsumed) { computeUnits = Math.ceil(sim.value.unitsConsumed * 1.1); computeUnitsSource = "simulation"; }
    }
    const fees = (await conn.getRecentPrioritizationFees(accounts.length ? { lockedWritableAccounts: accounts } : undefined)).map((f) => f.prioritizationFee).sort((a, b) => a - b);
    const tier = (price: number) => {
      const priority = (BigInt(price) * BigInt(computeUnits) + 999_999n) / 1_000_000n;
      const total = priority + BigInt(BASE_FEE_LAMPORTS_PER_SIGNATURE * signatures);
      return { microLamportsPerComputeUnit: price, priorityLamports: priority.toString(), totalLamports: total.toString(), totalSol: lamportsToSol(total) };
    };
    const p50 = percentile(fees, 50), p75 = Math.max(percentile(fees, 75), 1), p90 = Math.max(percentile(fees, 90), p75, 1);
    const tiers = { economy: tier(p50), standard: tier(p75), fast: tier(p90) };
    return {
      network, unit: "micro-lamports per compute unit", basedOn: accounts.length ? `${accounts.length} writable account(s) in your transaction` : "network-wide",
      samples: fees.length, nonZeroShare: fees.length ? Math.round((fees.filter((f) => f > 0).length / fees.length) * 100) / 100 : 0,
      tiers, computeUnits, computeUnitsSource,
      howToApply: `Add ComputeBudgetProgram.setComputeUnitLimit({ units: ${computeUnits} }) and ComputeBudgetProgram.setComputeUnitPrice({ microLamports: ${tiers.standard.microLamportsPerComputeUnit} }) as the first instructions.`,
    };
  },
};

export const TRANSACTION_TOOLS = [preflightTransaction, checkTransactionIntent, explainTransaction, feeAdvice];
export { exampleTransaction };
