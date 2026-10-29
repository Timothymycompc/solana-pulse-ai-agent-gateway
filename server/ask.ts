import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { mcpDescription, TOOLS } from "./tools";

// Plain-English questions for the Telegram bot: Claude reads the question, calls Pulse's own tools (all read-only:
// nothing here can sign or send), and answers only from what they returned. Off unless ANTHROPIC_API_KEY is set.
// Every question costs money, so the bot gives each person ASK_DAILY_LIMIT a day and each question a hard cap
// on rounds and tool calls.

export const ASK_MODEL = process.env.PULSE_ASK_MODEL || "claude-opus-5-5";
export const ASK_DAILY_LIMIT = Number(process.env.ASK_DAILY_LIMIT || 5);
const MAX_ROUNDS = 4;
const MAX_TOOL_CALLS = 6;
const MAX_RESULT_CHARS = 12_000;

const SYSTEM = `You are the Solana Pulse assistant in a Telegram chat. You answer questions about Solana tokens, wallets and transactions using only the Pulse tools you are given.

Rules:
- Every fact in your answer must come from a tool result in this conversation. If the tools didn't return it, say it's unknown. Never guess an address, amount, date or name.
- Say which tool each key fact came from, in plain words (for example "token_safety found...").
- A SAFE verdict means none of the scam traps Pulse checks for were found. It never means a token is a good buy. Never give investment advice, price predictions or buy/sell suggestions.
- You can't sign, send, swap or move anything. If asked to, say so and suggest the check that fits.
- If the question isn't about Solana tokens, wallets or transactions, say briefly what you can check.
- Keep answers short: a few plain sentences or a short list. Use full addresses only when the person needs to copy one.`;

export type AskToolRun = (tool: string, args: Record<string, unknown>) => Promise<{ status: number; body: unknown }>;
export type AskResult = { answer: string; tools: { name: string; status: number }[]; stopped: "done" | "limit" | "refusal" | "error" };

// Pulse's tools in the form the Messages API takes, from the same registry the HTTP and MCP routes use.
export const askTools = (): Anthropic.Beta.BetaTool[] => TOOLS.map((tool) => ({
  name: tool.name,
  description: mcpDescription(tool),
  input_schema: z.toJSONSchema(z.object(tool.inputs), { io: "input" }) as Anthropic.Beta.BetaTool.InputSchema,
}));

const textOf = (content: Anthropic.Beta.BetaContentBlock[]) =>
  content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("\n").trim();

export async function askPulse(question: string, runTool: AskToolRun, client: Pick<Anthropic, "beta"> = new Anthropic()): Promise<AskResult> {
  const tools = askTools();
  const used: AskResult["tools"] = [];
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: question.slice(0, 2000) }];

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const lastRound = round === MAX_ROUNDS - 1 || used.length >= MAX_TOOL_CALLS;
    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await client.beta.messages.create({
        model: ASK_MODEL,
        max_tokens: 4000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low" },
        system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
        tools,
        // On the last round the tools stay listed (so the cached prefix holds) but may not be called.
        tool_choice: lastRound ? { type: "none" } : { type: "auto" },
        messages,
      });
    } catch (error) {
      console.error("ask: model call failed:", error instanceof Anthropic.APIError ? `${error.status} ${error.message}` : error);
      return { answer: "", tools: used, stopped: "error" };
    }

    if (response.stop_reason === "refusal") return { answer: "", tools: used, stopped: "refusal" };
    const calls = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (response.stop_reason !== "tool_use" || calls.length === 0) {
      return { answer: textOf(response.content), tools: used, stopped: lastRound && used.length >= MAX_TOOL_CALLS ? "limit" : "done" };
    }

    messages.push({ role: "assistant", content: response.content });
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const call of calls) {
      if (used.length >= MAX_TOOL_CALLS) {
        results.push({ type: "tool_result", tool_use_id: call.id, is_error: true, content: "Tool limit for this question reached. Answer with what you have, and say what is still unknown." });
        continue;
      }
      const input = call.input && typeof call.input === "object" ? (call.input as Record<string, unknown>) : {};
      const out = await runTool(call.name, input).catch((e) => ({ status: 502, body: { error: String(e?.message ?? e) } }));
      used.push({ name: call.name, status: out.status });
      results.push({ type: "tool_result", tool_use_id: call.id, is_error: out.status >= 400, content: JSON.stringify(out.body).slice(0, MAX_RESULT_CHARS) });
    }
    messages.push({ role: "user", content: results });
  }
  return { answer: "", tools: used, stopped: "limit" };
}
