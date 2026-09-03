import { Connection, Keypair, SystemProgram, TransactionMessage, VersionedTransaction, clusterApiUrl } from "@solana/web3.js";

async function main() {
  const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

  // Two throwaway keypairs — this is just for simulation, nothing is ever broadcast
  const sender = Keypair.generate();
  const receiver = Keypair.generate();

  const { blockhash } = await connection.getLatestBlockhash("finalized");

  const instructions = [
    SystemProgram.transfer({
      fromPubkey: sender.publicKey,
      toPubkey: receiver.publicKey,
      lamports: 1000, // tiny transfer amount, doesn't matter for simulation
    }),
  ];

  const messageV0 = new TransactionMessage({
    payerKey: sender.publicKey,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();

  const tx = new VersionedTransaction(messageV0);
  // Not signing — our /api/solana/simulate endpoint uses sigVerify: false,
  // so an unsigned transaction is fine for simulation purposes.

  const base64Tx = Buffer.from(tx.serialize()).toString("base64");

  console.log("Sender:  ", sender.publicKey.toBase58());
  console.log("Receiver:", receiver.publicKey.toBase58());
  console.log("\nBase64 transaction (use this in your curl command):\n");
  console.log(base64Tx);
}

main().catch(console.error);
