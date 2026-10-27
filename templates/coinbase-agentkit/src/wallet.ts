// Builds a SOL transfer, checks it with Pulse, and only then signs and sends it.
// Dry run by default: without PULSE_SEND=1 and SOLANA_PRIVATE_KEY nothing is signed or sent.
// Same file in every template (templates/shared/wallet.ts is the original).
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import { checkBeforeSigning, type GuardResult } from "./pulse-guard";

const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

function signer(): Keypair | null {
  const raw = process.env.SOLANA_PRIVATE_KEY?.trim();
  if (!raw) return null;
  return Keypair.fromSecretKey(raw.startsWith("[") ? Uint8Array.from(JSON.parse(raw)) : bs58.decode(raw));
}

// The wallet the agent pays from: the signer's address, or WALLET_ADDRESS for a dry run with no key at all.
export function agentWallet(): string {
  const key = signer();
  const address = key?.publicKey.toBase58() ?? process.env.WALLET_ADDRESS;
  if (!address) throw new Error("Set WALLET_ADDRESS (dry run) or SOLANA_PRIVATE_KEY (to send).");
  return address;
}

export type SendResult = GuardResult & { sent: boolean; dryRun: boolean; signature?: string; tx: string };

export async function sendSolChecked(to: string, amountSol: string): Promise<SendResult> {
  const from = agentWallet();
  const lamports = Math.round(Number(amountSol) * LAMPORTS_PER_SOL);
  if (!Number.isFinite(lamports) || lamports <= 0) throw new Error(`Not a valid SOL amount: ${amountSol}`);
  const conn = new Connection(RPC_URL, "confirmed");
  const { blockhash } = await conn.getLatestBlockhash();
  const message = new TransactionMessage({
    payerKey: new PublicKey(from),
    recentBlockhash: blockhash,
    instructions: [SystemProgram.transfer({ fromPubkey: new PublicKey(from), toPubkey: new PublicKey(to), lamports })],
  }).compileToV0Message();
  const unsigned = new VersionedTransaction(message);
  const tx = Buffer.from(unsigned.serialize()).toString("base64");

  // The user's request, not the transaction, says what should happen; Pulse compares the two.
  const guard = await checkBeforeSigning(tx, { token: "SOL", amount: amountSol, to, from });
  const key = signer();
  const dryRun = process.env.PULSE_SEND !== "1" || !key;
  if (!guard.allowed || dryRun) return { ...guard, sent: false, dryRun, tx };

  unsigned.sign([key!]);
  const signature = await conn.sendTransaction(unsigned);
  return { ...guard, sent: true, dryRun: false, signature, tx };
}

// One line an agent (or a person) can read.
export function describe(r: SendResult): string {
  if (!r.allowed) return `Refused, nothing was signed. ${r.reasons.join(" ")}`;
  if (r.sent) return `Sent after both checks passed. ${r.check.summary} Signature: ${r.signature}`;
  return `Both checks passed (${r.check.summary} ${r.match.summary}). Dry run: not signed or sent. Set PULSE_SEND=1 and SOLANA_PRIVATE_KEY to send.`;
}
