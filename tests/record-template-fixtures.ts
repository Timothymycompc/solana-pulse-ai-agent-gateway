// Records real Pulse answers for the agent templates' guard (templates/shared/pulse-guard.ts) into
// tests/fixtures/template-guard.json. Builds real unsigned SOL transfers on mainnet; nothing is signed or sent.
// Run: npx tsx tests/record-template-fixtures.ts
import { writeFileSync } from "node:fs";
import { Connection, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { EXAMPLE_RECIPIENT, EXAMPLE_WALLET } from "../server/tools/lib";
import { callPulse } from "../templates/shared/pulse-guard";

const STRANGER = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"; // a real wallet that is not the requested recipient
const conn = new Connection("https://api.mainnet-beta.solana.com", "confirmed");

async function transfer(to: string, lamports: number) {
  const { blockhash } = await conn.getLatestBlockhash();
  const from = new PublicKey(EXAMPLE_WALLET);
  const msg = new TransactionMessage({ payerKey: from, recentBlockhash: blockhash, instructions: [SystemProgram.transfer({ fromPubkey: from, toPubkey: new PublicKey(to), lamports })] }).compileToV0Message();
  return Buffer.from(new VersionedTransaction(msg).serialize()).toString("base64");
}

const cases = {
  // The user asked for 0.001 SOL to EXAMPLE_RECIPIENT, and that is what the transaction does.
  ok: { tx: await transfer(EXAMPLE_RECIPIENT, 1_000_000), expected: { token: "SOL", amount: "0.001", to: EXAMPLE_RECIPIENT, from: EXAMPLE_WALLET } },
  // Same request, but the transaction pays someone else (a swapped or poisoned address).
  wrongRecipient: { tx: await transfer(STRANGER, 1_000_000), expected: { token: "SOL", amount: "0.001", to: EXAMPLE_RECIPIENT, from: EXAMPLE_WALLET } },
  // More SOL than the wallet holds: the dry run fails.
  tooLarge: { tx: await transfer(EXAMPLE_RECIPIENT, 9_999_999 * 1e9), expected: { token: "SOL", amount: "9999999", to: EXAMPLE_RECIPIENT, from: EXAMPLE_WALLET } },
};
const out: Record<string, unknown> = { recordedAt: new Date().toISOString(), source: "live Solana Pulse, mainnet-beta" };
for (const [name, c] of Object.entries(cases)) {
  out[name] = { ...c, check_tx: await callPulse("check_tx", { tx: c.tx }), tx_matches: await callPulse("tx_matches", { tx: c.tx, expected: c.expected }) };
}
writeFileSync(new URL("./fixtures/template-guard.json", import.meta.url), JSON.stringify(out, null, 2) + "\n");
console.log(Object.entries(out).filter(([k]) => typeof out[k] === "object").map(([k, v]: any) => `${k}: ${v.check_tx.verdict}/${v.tx_matches.verdict}`).join("  "));
