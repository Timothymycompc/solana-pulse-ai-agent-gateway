// The drainer patterns shared by check_tx and tx_matches: steps that hand control of funds or accounts to someone
// who is not signing.
import type { DecodedInstruction, LoadedTransaction } from "./decode";

export type Check = { name: string; result: "pass" | "info" | "warn" | "fail"; detail: string };

export function permissionCheck(ix: DecodedInstruction, signers: Set<string>): Check | null {
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

export const permissionChecks = (loaded: LoadedTransaction, signers: Set<string>): Check[] =>
  loaded.instructions.map((ix) => permissionCheck(ix, signers)).filter((c): c is Check => c !== null);
