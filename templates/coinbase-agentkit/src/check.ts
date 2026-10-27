// The safety path for real, without an AI model: runs AgentKit's pulse_send_sol action, which builds a real transfer
// on mainnet and runs both Pulse checks. Nothing is signed or sent unless PULSE_SEND=1 and SOLANA_PRIVATE_KEY are set.
// Run: WALLET_ADDRESS=<your wallet> npm run check -- <recipient> <amount in SOL>
import { AgentKit } from "@coinbase/agentkit";
import { pulseActionProvider } from "./pulse-actions";
import { PulseSolanaWalletProvider } from "./pulse-wallet";

const [to, amount = "0.001"] = process.argv.slice(2);
if (!to) throw new Error("Usage: npm run check -- <recipient address> [amount in SOL]");
const agentKit = await AgentKit.from({ walletProvider: new PulseSolanaWalletProvider(), actionProviders: [pulseActionProvider()] });
const send = agentKit.getActions().find((a) => a.name.endsWith("pulse_send_sol"))!;
const answer = await send.invoke({ to, amount });
console.log(`AgentKit actions: ${agentKit.getActions().map((a) => a.name).join(", ")}\n${answer}`);
process.exitCode = answer.startsWith("Refused") ? 1 : 0;
