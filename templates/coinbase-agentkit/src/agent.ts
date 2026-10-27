// A Coinbase AgentKit agent whose only money-moving action, pulse_send_sol, is checked by Solana Pulse before signing.
// AgentKit holds the actions; the Vercel AI SDK runs the model. AgentKit's own Vercel bridge needs AI SDK 4, so the
// actions are turned into AI SDK tools here (four lines). Dry run unless PULSE_SEND=1.
// Run: ANTHROPIC_API_KEY=... WALLET_ADDRESS=<your wallet> npm start -- "send 0.001 SOL to <address>"
import { anthropic } from "@ai-sdk/anthropic";
import { AgentKit } from "@coinbase/agentkit";
import { generateText, isStepCount, tool } from "ai";
import { pulseActionProvider } from "./pulse-actions";
import { PulseSolanaWalletProvider } from "./pulse-wallet";
import { agentWallet } from "./wallet";

const agentKit = await AgentKit.from({ walletProvider: new PulseSolanaWalletProvider(), actionProviders: [pulseActionProvider()] });
const tools = Object.fromEntries(agentKit.getActions().map((a) => [a.name, tool({
  description: a.description,
  inputSchema: a.schema as any,
  execute: async (args: any) => a.invoke(args),
})]));

const request = process.argv.slice(2).join(" ") || "What can you do?";
const { text } = await generateText({
  model: anthropic(process.env.MODEL || "claude-sonnet-5-5"),
  instructions: `You manage the Solana wallet ${agentWallet()}. Use pulse_send_sol for any transfer, and pulse_token_safety before buying or recommending a token. If a send says Refused, tell the user why and do not retry with a different address or amount.`,
  tools,
  stopWhen: isStepCount(4),
  prompt: request,
});
console.log(text);
