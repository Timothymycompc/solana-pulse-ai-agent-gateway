// A LangChain agent that loads Solana Pulse's read-only tools through the MCP adapter and has one money-moving tool,
// send_sol. send_sol builds the transfer, has Pulse check it (check_tx must say OK, tx_matches must say MATCH), and
// only then signs. Dry run unless PULSE_SEND=1.
// Run: ANTHROPIC_API_KEY=... WALLET_ADDRESS=<your wallet> npm start -- "send 0.001 SOL to <address>"
import { ChatAnthropic } from "@langchain/anthropic";
import { tool } from "@langchain/core/tools";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { createAgent } from "langchain";
import { z } from "zod";
import { PULSE_URL } from "./pulse-guard";
import { agentWallet, describe, sendSolChecked } from "./wallet";

const sendSol = tool(async ({ to, amount }) => describe(await sendSolChecked(to, amount)), {
  name: "send_sol",
  description: "Send SOL from the agent's wallet. Solana Pulse checks the transaction before it is signed; if either check fails, nothing is signed and the reasons come back.",
  schema: z.object({
    to: z.string().describe("The recipient's wallet address, exactly as the user gave it."),
    amount: z.string().describe('Amount in SOL as the user said it, e.g. "0.5".'),
  }),
});

// Pulse's read-only tools (token_safety, find_token, explain_tx...) come straight from its MCP server.
const pulse = new MultiServerMCPClient({ mcpServers: { pulse: { transport: "http", url: `${PULSE_URL}/mcp` } } });
const READ_ONLY = new Set(["token_safety", "find_token", "balance", "explain_tx"]);
// The adapter prefixes each tool with the server name ("pulse_token_safety").
const pulseTools = (await pulse.getTools()).filter((t) => READ_ONLY.has(t.name.replace(/^pulse_/, "")));

const agent = createAgent({
  model: new ChatAnthropic({ model: process.env.MODEL || "claude-sonnet-5-5" }),
  tools: [sendSol, ...pulseTools],
  systemPrompt: `You manage the Solana wallet ${agentWallet()}. Use send_sol for any transfer and token_safety before recommending a token. If send_sol says Refused, tell the user why and do not retry with a different address or amount.`,
});

const request = process.argv.slice(2).join(" ") || "What can you do?";
try {
  const result = await agent.invoke({ messages: [{ role: "user", content: request }] });
  console.log(result.messages.at(-1)?.text);
} finally {
  await pulse.close();
}
