// Transaction decoding and simulation shared by check_tx, tx_matches and fee.
import { AddressLookupTableAccount, Connection, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { getCompiledTransactionMessageDecoder, getTransactionDecoder, decompileTransactionMessage } from "@solana/kit";
import { AccountLayout } from "@solana/spl-token";
import {
  ATA_PROGRAM, BASE_FEE_LAMPORTS_PER_SIGNATURE, COMPUTE_BUDGET_PROGRAM, formatUnits, labelFor, lamportsToSol,
  SYSTEM_PROGRAM, TOKEN_2022_PROGRAM, TOKEN_PROGRAM,
} from "./lib";
import { ToolError } from "./types";

export type DecodedInstruction = {
  index: number;
  programId: string;
  program: string | null;
  type: string;
  accounts: string[];
  info: Record<string, string | number | null>;
};

// Version 1 transactions (on mainnet since 2026; 40% of non-vote transactions in a block on 2026-10-19) are newer than
// web3.js, which reads only legacy and v0. They are decoded with @solana/kit and carry their own bytes: simulateTransaction
// only calls serialize() on what it is given, so a v1 transaction is passed as its bytes behind that one method.
type WireTransaction = { message: unknown; signatures: Uint8Array[]; serialize(): Uint8Array };
// A v1 transaction sets its compute limit and priority fee (in lamports, not per compute unit) in its header config
// instead of Compute Budget steps.
export type V1Config = { computeUnitLimit?: number; priorityFeeLamports?: bigint; loadedAccountsDataSizeLimit?: number; heapSize?: number };

export type LoadedTransaction = {
  tx: VersionedTransaction;
  version: "legacy" | 0 | 1;
  config: V1Config | null;
  keys: string[];
  writable: string[];
  signers: string[];
  feePayer: string;
  recentBlockhash: string;
  instructions: DecodedInstruction[];
  usesLookupTables: boolean;
};

const u64 = (data: Buffer, offset: number) => data.readBigUInt64LE(offset).toString();
const TOKEN_PROGRAMS = new Set([TOKEN_PROGRAM, TOKEN_2022_PROGRAM]);
const AUTHORITY_TYPES = ["MintTokens", "FreezeAccount", "AccountOwner", "CloseAccount"];

function decodeInstruction(index: number, programId: string, accounts: string[], data: Buffer): DecodedInstruction {
  const base = { index, programId, program: labelFor(programId), accounts };
  try {
    if (programId === SYSTEM_PROGRAM && data.length >= 4) {
      const kind = data.readUInt32LE(0);
      if (kind === 2) return { ...base, type: "sol_transfer", info: { from: accounts[0], to: accounts[1], lamports: u64(data, 4) } };
      if (kind === 0) return { ...base, type: "create_account", info: { payer: accounts[0], newAccount: accounts[1], lamports: u64(data, 4), space: u64(data, 12), owner: new PublicKey(data.subarray(20, 52)).toBase58() } };
      if (kind === 1) return { ...base, type: "assign_owner", info: { account: accounts[0], newOwnerProgram: new PublicKey(data.subarray(4, 36)).toBase58() } };
      if (kind === 11) return { ...base, type: "sol_transfer_with_seed", info: { from: accounts[0], to: accounts[2], lamports: u64(data, 4) } };
    }
    if (TOKEN_PROGRAMS.has(programId) && data.length >= 1) {
      const kind = data[0];
      if (kind === 3) return { ...base, type: "token_transfer", info: { source: accounts[0], destination: accounts[1], authority: accounts[2], amountRaw: u64(data, 1), mint: null, decimals: null } };
      if (kind === 12) return { ...base, type: "token_transfer", info: { source: accounts[0], mint: accounts[1], destination: accounts[2], authority: accounts[3], amountRaw: u64(data, 1), decimals: data[9] } };
      if (kind === 4) return { ...base, type: "token_approve", info: { account: accounts[0], delegate: accounts[1], owner: accounts[2], amountRaw: u64(data, 1), mint: null } };
      if (kind === 13) return { ...base, type: "token_approve", info: { account: accounts[0], mint: accounts[1], delegate: accounts[2], owner: accounts[3], amountRaw: u64(data, 1) } };
      if (kind === 6) {
        const hasNew = data[2] === 1;
        return { ...base, type: "token_set_authority", info: { account: accounts[0], currentAuthority: accounts[1], authorityType: AUTHORITY_TYPES[data[1]] ?? String(data[1]), newAuthority: hasNew ? new PublicKey(data.subarray(3, 35)).toBase58() : null } };
      }
      if (kind === 9) return { ...base, type: "token_close_account", info: { account: accounts[0], destination: accounts[1], owner: accounts[2] } };
      if (kind === 8 || kind === 15) return { ...base, type: "token_burn", info: { account: accounts[0], mint: accounts[1], owner: accounts[2], amountRaw: u64(data, 1) } };
      if (kind === 7 || kind === 14) return { ...base, type: "token_mint_to", info: { mint: accounts[0], destination: accounts[1], authority: accounts[2], amountRaw: u64(data, 1) } };
      if (kind === 5) return { ...base, type: "token_revoke", info: { account: accounts[0], owner: accounts[1] } };
      if (kind === 10) return { ...base, type: "token_freeze", info: { account: accounts[0], mint: accounts[1], authority: accounts[2] } };
      if (kind === 17) return { ...base, type: "token_sync_native", info: { account: accounts[0] } };
      if (kind === 1 || kind === 16 || kind === 18) return { ...base, type: "token_initialize_account", info: { account: accounts[0], mint: accounts[1] } };
    }
    if (programId === COMPUTE_BUDGET_PROGRAM && data.length >= 1) {
      if (data[0] === 2) return { ...base, type: "set_compute_unit_limit", info: { units: data.readUInt32LE(1) } };
      if (data[0] === 3) return { ...base, type: "set_compute_unit_price", info: { microLamportsPerComputeUnit: u64(data, 1) } };
      if (data[0] === 1) return { ...base, type: "request_heap_frame", info: { bytes: data.readUInt32LE(1) } };
      if (data[0] === 4) return { ...base, type: "set_loaded_accounts_data_size_limit", info: { bytes: data.readUInt32LE(1) } };
    }
    if (programId === ATA_PROGRAM) {
      return { ...base, type: data.length && data[0] === 1 ? "create_token_account_idempotent" : data.length && data[0] === 2 ? "recover_nested_token_account" : "create_token_account", info: { payer: accounts[0], tokenAccount: accounts[1], owner: accounts[2], mint: accounts[3], tokenProgram: accounts[5] ?? null } };
    }
    if (programId.startsWith("Memo")) return { ...base, type: "memo", info: { text: data.toString("utf8").slice(0, 200) } };
  } catch { /* fall through to unknown */ }
  return { ...base, type: labelFor(programId) ? "other" : "unknown_program", info: { dataBytes: data.length } };
}

const DECODE_FAILED = () => new ToolError(400, "Could not decode the transaction.", "Pass the full serialized transaction (legacy, v0 or v1) as base64, e.g. Buffer.from(tx.serialize({ requireAllSignatures: false })).toString('base64').");

function loadV1(bytes: Buffer): LoadedTransaction {
  const decoded = getTransactionDecoder().decode(bytes);
  const m: any = getCompiledTransactionMessageDecoder().decode(decoded.messageBytes);
  if (m.version !== 1) throw DECODE_FAILED();
  const keys: string[] = m.staticAccounts.map(String);
  const { numSignerAccounts: signerCount, numReadonlySignerAccounts: readonlySigners, numReadonlyNonSignerAccounts: readonlyOthers } = m.header;
  const writable = keys.filter((_, i) => (i < signerCount ? i < signerCount - readonlySigners : i < keys.length - readonlyOthers));
  const signers = keys.slice(0, signerCount);
  const instructions = m.instructionHeaders.map((h: any, i: number) => decodeInstruction(i, keys[h.programAccountIndex], m.instructionPayloads[i].instructionAccountIndices.map((k: number) => keys[k]), Buffer.from(m.instructionPayloads[i].instructionData)));
  const config: V1Config = { ...(decompileTransactionMessage(m) as { config?: V1Config }).config };
  const signatures = signers.map((k) => new Uint8Array((decoded.signatures as Record<string, Uint8Array | null>)[k] ?? new Uint8Array(64)));
  const tx: WireTransaction = { message: m, signatures, serialize: () => new Uint8Array(bytes) };
  return { tx: tx as unknown as VersionedTransaction, version: 1, config, keys, writable, signers, feePayer: keys[0], recentBlockhash: String(m.lifetimeToken), instructions, usesLookupTables: false };
}

export async function loadTransaction(conn: Connection, base64: string): Promise<LoadedTransaction> {
  const bytes = Buffer.from(String(base64).trim(), "base64");
  let tx: VersionedTransaction;
  try { tx = VersionedTransaction.deserialize(bytes); }
  catch {
    try { return loadV1(bytes); } catch { throw DECODE_FAILED(); }
  }
  const msg = tx.message;
  const lookups = msg.addressTableLookups ?? [];
  let tables: AddressLookupTableAccount[] = [];
  if (lookups.length) {
    tables = (await Promise.all(lookups.map((l) => conn.getAddressLookupTable(l.accountKey)))).map((r, i) => {
      if (!r.value) throw new ToolError(422, `Address lookup table ${lookups[i].accountKey.toBase58()} was not found.`, "The transaction references a lookup table that does not exist on this network.");
      return r.value;
    });
  }
  const accountKeys = msg.getAccountKeys({ addressLookupTableAccounts: tables });
  const keys: string[] = [];
  for (let i = 0; i < accountKeys.length; i++) keys.push(accountKeys.get(i)!.toBase58());
  const writable = keys.filter((_, i) => msg.isAccountWritable(i));
  const signers = keys.slice(0, msg.header.numRequiredSignatures);
  const instructions = msg.compiledInstructions.map((ix, i) => decodeInstruction(i, keys[ix.programIdIndex], ix.accountKeyIndexes.map((k) => keys[k]), Buffer.from(ix.data)));
  return { tx, version: tx.version, config: null, keys, writable, signers, feePayer: keys[0], recentBlockhash: msg.recentBlockhash, instructions, usesLookupTables: lookups.length > 0 };
}

// Fees as charged by the runtime: base fee per signature, plus priority fee on the requested compute limit. A v1
// transaction states both in its config, and its priority fee is a lamport total.
export function feeBreakdown(loaded: LoadedTransaction) {
  const limitIx = loaded.instructions.find((i) => i.type === "set_compute_unit_limit");
  const priceIx = loaded.instructions.find((i) => i.type === "set_compute_unit_price");
  const nonBudget = loaded.instructions.filter((i) => i.programId !== COMPUTE_BUDGET_PROGRAM).length;
  const v1Limit = loaded.config?.computeUnitLimit;
  const computeUnitLimit = v1Limit !== undefined ? v1Limit : limitIx ? Number(limitIx.info.units) : Math.min(200_000 * Math.max(nonBudget, 1), 1_400_000);
  const v1Fee = loaded.config?.priorityFeeLamports;
  const microLamportsPerComputeUnit = v1Fee !== undefined ? (computeUnitLimit ? (BigInt(v1Fee) * 1_000_000n) / BigInt(computeUnitLimit) : 0n)
    : priceIx ? BigInt(String(priceIx.info.microLamportsPerComputeUnit)) : 0n;
  const priorityLamports = v1Fee !== undefined ? BigInt(v1Fee) : (microLamportsPerComputeUnit * BigInt(computeUnitLimit) + 999_999n) / 1_000_000n;
  const baseLamports = BigInt(BASE_FEE_LAMPORTS_PER_SIGNATURE * loaded.signers.length);
  return {
    baseLamports: baseLamports.toString(), priorityLamports: priorityLamports.toString(), totalLamports: (baseLamports + priorityLamports).toString(),
    totalSol: lamportsToSol(baseLamports + priorityLamports), computeUnitLimit, computeUnitLimitSource: v1Limit !== undefined ? "set in transaction config (v1)" : limitIx ? "set in transaction" : "runtime default (200,000 per instruction)",
    microLamportsPerComputeUnit: microLamportsPerComputeUnit.toString(),
  };
}

type AccountState = { lamports: bigint; owner: string; token?: { mint: string; owner: string; amount: bigint } };
const readState = (lamports: number | bigint, owner: string, data: Buffer | null): AccountState => {
  const state: AccountState = { lamports: BigInt(lamports), owner };
  if (data && TOKEN_PROGRAMS.has(owner) && data.length >= AccountLayout.span) {
    const t = AccountLayout.decode(data.subarray(0, AccountLayout.span));
    state.token = { mint: t.mint.toBase58(), owner: t.owner.toBase58(), amount: BigInt(t.amount.toString()) };
  }
  return state;
};

export type WalletChange = { wallet: string; asset: string; symbol: string | null; before: string; after: string; change: string; changeRaw: string; decimals: number };

// Simulate and compute every balance change on the transaction's writable accounts.
export async function simulateWithChanges(conn: Connection, loaded: LoadedTransaction, symbols: (mints: string[]) => Promise<Map<string, string>>) {
  const watched = loaded.writable.slice(0, 64);
  const preInfos = await conn.getMultipleAccountsInfo(watched.map((k) => new PublicKey(k)), "confirmed");
  const sim = await conn.simulateTransaction(loaded.tx, { sigVerify: false, replaceRecentBlockhash: true, commitment: "confirmed", accounts: { encoding: "base64", addresses: watched } });
  const value = sim.value;
  const changes: WalletChange[] = [];
  // Raw lamport change of every watched account, token accounts included (e.g. the deposit that creates one).
  const lamportDeltas = new Map<string, bigint>();
  if (!value.err && value.accounts) {
    const tokenDeltas = new Map<string, { wallet: string; mint: string; before: bigint; after: bigint }>();
    watched.forEach((address, i) => {
      const preRaw = preInfos[i];
      const pre = preRaw ? readState(preRaw.lamports, preRaw.owner.toBase58(), Buffer.from(preRaw.data)) : null;
      const postRaw = value.accounts![i];
      const post = postRaw ? readState(postRaw.lamports, postRaw.owner, Buffer.from(postRaw.data[0], "base64")) : null;
      const before = pre?.lamports ?? 0n;
      const after = post?.lamports ?? 0n;
      lamportDeltas.set(address, after - before);
      const isTokenAccount = Boolean(pre?.token || post?.token);
      if (!isTokenAccount && before !== after) {
        changes.push({ wallet: address, asset: "SOL", symbol: "SOL", before: lamportsToSol(before), after: lamportsToSol(after), change: formatUnits(after - before, 9), changeRaw: (after - before).toString(), decimals: 9 });
      }
      const token = post?.token ?? pre?.token;
      if (token) {
        const key = `${token.owner}:${token.mint}`;
        const entry = tokenDeltas.get(key) ?? { wallet: token.owner, mint: token.mint, before: 0n, after: 0n };
        entry.before += pre?.token?.amount ?? 0n;
        entry.after += post?.token?.amount ?? 0n;
        tokenDeltas.set(key, entry);
      }
    });
    const mints = [...new Set([...tokenDeltas.values()].map((d) => d.mint))];
    const mintInfos = await conn.getMultipleParsedAccounts(mints.map((m) => new PublicKey(m)), { commitment: "confirmed" });
    const decimals = new Map(mints.map((m, i) => [m, Number((mintInfos.value[i]?.data as any)?.parsed?.info?.decimals ?? 0)]));
    const names = await symbols(mints);
    for (const d of tokenDeltas.values()) {
      if (d.before === d.after) continue;
      const dec = decimals.get(d.mint) ?? 0;
      changes.push({ wallet: d.wallet, asset: d.mint, symbol: names.get(d.mint) ?? null, before: formatUnits(d.before, dec), after: formatUnits(d.after, dec), change: formatUnits(d.after - d.before, dec), changeRaw: (d.after - d.before).toString(), decimals: dec });
    }
  }
  return {
    success: value.err === null, error: value.err ?? null, unitsConsumed: value.unitsConsumed ?? null,
    logs: (value.logs ?? []).slice(-25), changes, lamportDeltas, watchedAccounts: watched.length, totalWritable: loaded.writable.length,
  };
}

// Owner and mint of token accounts (existing on chain, or created by an ATA instruction in the same transaction).
export async function tokenAccountOwners(conn: Connection, loaded: LoadedTransaction, accounts: string[]) {
  const out = new Map<string, { owner: string; mint: string } | null>();
  const unique = [...new Set(accounts)];
  const infos = await conn.getMultipleAccountsInfo(unique.map((a) => new PublicKey(a)), "confirmed");
  unique.forEach((a, i) => {
    const info = infos[i];
    const state = info ? readState(info.lamports, info.owner.toBase58(), Buffer.from(info.data)) : null;
    if (state?.token) return out.set(a, { owner: state.token.owner, mint: state.token.mint });
    const created = loaded.instructions.find((ix) => ix.type.startsWith("create_token_account") && ix.info.tokenAccount === a);
    out.set(a, created ? { owner: String(created.info.owner), mint: String(created.info.mint) } : null);
  });
  return out;
}
