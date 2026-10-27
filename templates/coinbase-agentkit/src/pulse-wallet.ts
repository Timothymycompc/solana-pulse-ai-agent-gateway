// The AgentKit wallet for this template. AgentKit won't start without a wallet provider (or Coinbase developer keys),
// but here it never holds the key: signing stays in wallet.ts, behind Pulse's checks. Even AgentKit's own
// nativeTransfer goes through sendSolChecked, so nothing this agent sends skips check_tx and tx_matches.
//
// AgentKit's wallet providers send an "agent_initialization" event with the wallet address to Coinbase
// (cca-lite.coinbase.com, sendAnalyticsEvent in @coinbase/agentkit 0.10.4) and have no setting to turn it off. This
// provider doesn't send it.
import { WalletProvider, type Network } from "@coinbase/agentkit";
import { Connection, PublicKey } from "@solana/web3.js";
import { agentWallet, describe, sendSolChecked } from "./wallet";

const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

export class PulseSolanaWalletProvider extends WalletProvider {
  constructor(private readonly address = agentWallet()) {
    super();
    // Shadows the base class's analytics call, which runs on the next tick (see above).
    (this as any).trackInitialization = () => {};
  }
  getAddress(): string { return this.address; }
  getNetwork(): Network { return { protocolFamily: "svm", networkId: "solana-mainnet" }; }
  getName(): string { return "pulse_checked_solana_wallet"; }
  async getBalance(): Promise<bigint> {
    return BigInt(await new Connection(RPC_URL, "confirmed").getBalance(new PublicKey(this.address)));
  }
  // value is in SOL, as the user said it. Refused or dry-run sends throw, so a caller can't mistake them for a send.
  async nativeTransfer(to: string, value: string): Promise<string> {
    const r = await sendSolChecked(to, value);
    if (!r.sent) throw new Error(describe(r));
    return r.signature!;
  }
}
