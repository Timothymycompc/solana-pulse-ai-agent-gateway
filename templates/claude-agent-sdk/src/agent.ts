// A Claude Agent SDK agent with one money-moving tool, send_sol, plus Solana Pulse's read-only tools over MCP.
// send_sol builds the transfer, has Pulse check it (check_tx must say OK, tx_matches must say MATCH), and only then
// signs. Dry run unless PULSE_SEND=1. Built-in tools (Bash, file edits) are switched off.
// Run: WALLET_ADDRESS=<your wallet> npm start -- "send 0.001 SOL to <address>"
// (signed in to Claude Code, or with ANTHROPIC_API_KEY set)
import { createSdkMcpServer, query, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { PULSE_URL } from "./pulse-guard";
import { agentWallet, describe, sendSolChecked } from "./wallet";

const wallet = createSdkMcpServer({
  name: "wallet",
  tools: [
    tool(
      "send_sol",
      "Send SOL from the agent's wallet. Solana Pulse checks the transaction before it is signed; if either check fails, nothing is signed and the reasons come back.",
      {
        to: z.string().describe("The recipient's wallet address, exactly as the user gave it."),
        amount: z.string().describe('Amount in SOL as the user said it, e.g. "0.5".'),
      },
      async ({ to, amount }) => ({ content: [{ type: "text", text: describe(await sendSolChecked(to, amount)) }] }),
    ),
  ],
});

const request = process.argv.slice(2).join(" ") || "What can you do?";
for await (const message of query({
  prompt: request,
  options: {
    systemPrompt: `You manage the Solana wallet ${agentWallet()}. Use send_sol for any transfer and token_safety before recommending a token. If send_sol says Refused, tell the user why and do not retry with a different address or amount.`,
    tools: [],
    mcpServers: { wallet, pulse: { type: "http", url: `${PULSE_URL}/mcp` } },
    allowedTools: ["mcp__wallet__send_sol", "mcp__pulse__token_safety", "mcp__pulse__find_token", "mcp__pulse__balance", "mcp__pulse__explain_tx"],
    settingSources: [],
    maxTurns: 6,
    ...(process.env.MODEL ? { model: process.env.MODEL } : {}),
  },
})) {
  if (message.type === "result") console.log(message.subtype === "success" ? message.result : `Stopped: ${message.subtype}`);
}
