// A Vercel AI SDK agent with one money-moving tool, send_sol. The tool builds the transfer, has Solana Pulse check it
// (check_tx must say OK, tx_matches must say MATCH), and only then signs. Dry run unless PULSE_SEND=1.
// Run: ANTHROPIC_API_KEY=... WALLET_ADDRESS=<your wallet> npm start -- "send 0.001 SOL to <address>"
import { anthropic } from "@ai-sdk/anthropic";
import { generateText, isStepCount, tool } from "ai";
import { z } from "zod";
import { agentWallet, describe, sendSolChecked } from "./wallet";

const sendSol = tool({
  description: "Send SOL from the agent's wallet. Solana Pulse checks the transaction before it is signed; if either check fails, nothing is signed and the reasons come back.",
  inputSchema: z.object({
    to: z.string().describe("The recipient's wallet address, exactly as the user gave it."),
    amount: z.string().describe('Amount in SOL as the user said it, e.g. "0.5".'),
  }),
  execute: async ({ to, amount }) => describe(await sendSolChecked(to, amount)),
});

const request = process.argv.slice(2).join(" ") || "What can you do?";
const { text } = await generateText({
  model: anthropic(process.env.MODEL || "claude-sonnet-5-5"),
  instructions: `You manage the Solana wallet ${agentWallet()}. Use send_sol for any transfer. If it says Refused, tell the user why and do not retry with a different address or amount.`,
  tools: { send_sol: sendSol },
  stopWhen: isStepCount(4),
  prompt: request,
});
console.log(text);
