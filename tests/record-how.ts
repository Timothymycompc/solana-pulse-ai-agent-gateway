// Records real mainnet transactions for tests/how.test.ts: ordinary transactions that hand out approvals or change a
// token account's owner (launchpads, swaps), which "how it happened" must NOT call an attack. Found 2026-11-17 by
// scanning recent blocks for every approve / setAuthority(accountOwner) to an address that isn't signing.
// Run: SOLANA_MAINNET_RPC_URL=... npx tsx tests/record-how.ts    Read-only: nothing is signed or sent.
import { clusterApiUrl } from "@solana/web3.js";
import { grantsIn } from "../server/tools/how";
import { parsedTransaction } from "../server/tools/transactions";
import { recordingContext, saveFixture } from "./helpers/replay";

const RPC = process.env.SOLANA_MAINNET_RPC_URL || clusterApiUrl("mainnet-beta");
export const ORDINARY = [
  // A token launch: the launcher creates a token account and hands it to the launch program in the same transaction.
  { tx: "2zXnNeixzmvV2rWkyTawbtvzEdkKwmCvPkAYgeBhDjSJppwy4nLfAZuz8FF7C8ZyKoDL76M2yUh2mmfSreRLVdfH", wallet: "DcdFtJMzQfmEh9T6TiMqS2EU1VEMv1sHiW2xzoUVk1Vq" },
  // A launchpad buy: the program (not the buyer) changes owners of accounts it just created.
  { tx: "5RhQqzztHUng3RznLDEjVnShD1kPzWjMnpan7sf71r8XgJ6pSmWtCa22CLFRXacsY37cMqfC2H1UJXBD1XUZePHa", wallet: "whamNNP9tHoxLg92yHvJPdYhghEoCg1qYTsh5a2oLbx" },
  // Approvals inside other programs' transactions (swaps, order books).
  { tx: "q5P61VFyyKQ68Wxgg9miYU2sXB4y8nphGhae9XiQkC9VKinXLrpqK24aDfLgs53Es8TPzmQbwrJF3HymVc367Bd", wallet: "2ZDPcrhs6BQK2AvvVEbjy345c71Q2Ynmb2dx5zA3Q7jH" },
  { tx: "5tJbr3vErHHyc7LrxWPwpnjhoGg3uW4Qw4sicgfXnrzLbn6p6bwgaLUPtDHKJTLzW1YLzX56wccudrgjpxLoY2Jn", wallet: "4EaQVDYpFzLAvb2Cr8acBKMHnFHv2AaftXWferucfNC1" },
  { tx: "5EFwLbQu2s8SD9KSrhuaYJfvS6BB9L9xex74k2wNswxWi1isQC6Gonrdut8F1mNkexbjdy7jz1dwFHC3C5WjARXx", wallet: "2GZ17ZkmeMb2gSEbMj1TdYuJMXA1d3vjzmYJxthHiNAQ" },
  { tx: "37LrSotaUcB4MTxEPvoTHFjEUkAXreARufqovCo8m8XvKnE5YFkzXtrPBCdJTHQCUoq1vkhFZKLQticp6D4p8TXe", wallet: "AsWHqj9nhN9NhZSUjuyQZ9DcRfWmPZPxnvUzfSMzx3XQ" },
];

if (process.argv[1]?.endsWith("record-how.ts")) {
  const { ctx, recording } = recordingContext(RPC);
  const conn = ctx.connection("mainnet-beta");
  for (const o of ORDINARY) {
    const tx = await parsedTransaction(conn, o.tx);
    console.log(o.tx.slice(0, 8), o.wallet.slice(0, 6), JSON.stringify(tx ? grantsIn(o.wallet, tx, null) : "not found"));
  }
  saveFixture({ name: "how-ordinary", recordedAt: new Date().toISOString(), args: {}, recording });
}
