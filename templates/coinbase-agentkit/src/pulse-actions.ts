// Solana Pulse as a Coinbase AgentKit action provider. pulse_send_sol is the only action here that moves money: it
// builds the transfer, has Pulse check it (check_tx must say OK, tx_matches must say MATCH), and only then signs.
// The other two are read-only checks an agent should run before trusting a token or an address.
//
// The actions are returned from getActions directly, not built with customActionProvider or @CreateAction: in
// @coinbase/agentkit 0.10.4 those wrap every call with an analytics event to Coinbase (action name and wallet address)
// whose failure isn't caught, and a 400 from that endpoint crashed the agent in our test (2026-10-27).
//
// Don't add AgentKit's own transfer actions (walletActionProvider's native_transfer, splActionProvider) next to these:
// they sign without asking Pulse, and the model would be free to use them instead.
import { ActionProvider, type Action, type Network } from "@coinbase/agentkit";
import { z } from "zod";
import { callPulse } from "./pulse-guard";
import { describe, sendSolChecked } from "./wallet";

const sendSol = z.object({
  to: z.string().describe("The recipient's wallet address, exactly as the user gave it."),
  amount: z.string().describe('Amount in SOL as the user said it, e.g. "0.5".'),
});
const tokenInput = z.object({ token: z.string().describe("The token's mint address. Never a ticker: look the address up first.") });
const walletInput = z.object({ wallet: z.string().describe("The wallet to follow, as the user gave it.") });

export class PulseActionProvider extends ActionProvider {
  constructor() {
    super("pulse", []);
  }
  supportsNetwork(network: Network): boolean {
    return network.protocolFamily === "svm";
  }
  getActions(): Action[] {
    return [
      {
        name: "pulse_send_sol",
        description: "Send SOL from the agent's wallet. Solana Pulse checks the transaction before it is signed; if either check fails, nothing is signed and the reasons come back.",
        schema: sendSol,
        invoke: async ({ to, amount }: z.infer<typeof sendSol>) => describe(await sendSolChecked(to, amount)),
      },
      {
        name: "pulse_token_safety",
        description: "Check a Solana token for the known traps (can't sell, liquidity the creator can pull, mint or freeze powers, a creator who rugged before) before buying, accepting or recommending it. SAFE means none were found, not that the price can't fall.",
        schema: tokenInput,
        invoke: async ({ token }: z.infer<typeof tokenInput>) => {
          const r = await callPulse("token_safety", { token });
          return r.error ?? `${r.verdict}: ${r.summary}`;
        },
      },
      {
        name: "pulse_trace",
        description: "Follow a wallet's money through its recent transactions: where it went, and drain patterns (swept with someone else paying the fee, passed straight through, emptied, lookalike-address dust) with the transactions that show them.",
        schema: walletInput,
        invoke: async ({ wallet }: z.infer<typeof walletInput>) => {
          const r = await callPulse("trace", { wallet, how_many: 25 });
          return r.error ?? r.summary;
        },
      },
    ];
  }
}

export const pulseActionProvider = () => new PulseActionProvider();
