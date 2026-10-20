// Solana Pulse as a Solana Agent Kit plugin: safety checks an agent runs before it signs or buys, from live mainnet data
// with sources. Each Pulse tool becomes one action (PULSE_CHECK_TX, PULSE_TOKEN_SAFETY, ...) and one method
// (agent.methods.pulseCheckTx(agent, input)). Use the default export for all of them, or createPulsePlugin({ tools })
// for a subset.
import type { Action, Plugin, SolanaAgentKit } from "solana-agent-kit";
import { callPulse, DEFAULT_URL } from "./client";
import { TOOLS } from "./tools.generated";

export { callPulse, toBase64, DEFAULT_URL, PLUGIN_VERSION } from "./client";
export { TOOLS, PULSE_VERSION } from "./tools.generated";

export type PulseTool = (typeof TOOLS)[number]["name"];

// Phrases an agent framework matches to pick an action.
const SIMILES: Record<PulseTool, string[]> = {
  check_tx: ["check transaction before signing", "is this transaction safe", "simulate transaction", "detect drainer", "preflight transaction"],
  tx_matches: ["confirm transaction matches request", "verify transfer amount and recipient", "check swap does what I asked", "intent check"],
  explain_tx: ["explain transaction", "what did this transaction do", "why did my transaction fail", "transaction details"],
  fee: ["priority fee", "how much priority fee", "compute unit price", "fee estimate"],
  find_token: ["find token address", "resolve ticker", "token mint for symbol", "which token is BONK"],
  token_safety: ["is this token safe", "rug check", "token risk", "check token before buying", "honeypot check"],
  wallet: ["wallet summary", "what does this wallet hold", "portfolio value"],
  balance: ["sol balance", "how much SOL", "check balance"],
  tokens: ["list wallet tokens", "token holdings", "spl tokens in wallet"],
  history: ["recent transactions", "wallet history", "transaction ids for wallet"],
  blockhash: ["fresh blockhash", "recent blockhash", "blockhash expiry"],
  token_account: ["associated token account", "find ATA", "where do I send this token"],
  whats_this: ["what is this address", "identify address", "is this a wallet or a token"],
  convert: ["convert token amount", "raw units", "decimals conversion", "lamports"],
  why_failed: ["explain solana error", "decode error code", "custom program error", "why did it fail"],
};

const camel = (name: string) => "pulse" + name.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join("");

export const actions: Action[] = TOOLS.map((t) => ({
  name: `PULSE_${t.name.toUpperCase()}`,
  similes: SIMILES[t.name],
  description: `${t.description} Solana Pulse (${t.price}).`,
  examples: [[{ input: t.example, output: { status: "success", docs: `${DEFAULT_URL}/api/tools/${t.name}` }, explanation: `${t.title} Every output field is explained at the docs link.` }]],
  schema: t.schema,
  handler: async (agent: SolanaAgentKit, input: Record<string, any>) => {
    const parsed = t.schema.safeParse(input);
    if (!parsed.success) return { status: "error", message: `Invalid input for ${t.name}: ${parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ")}` };
    return callPulse(agent, t.name, parsed.data as Record<string, unknown>);
  },
}));

export function createPulsePlugin(options: { tools?: PulseTool[] } = {}): Plugin {
  const chosen = TOOLS.filter((t) => !options.tools || options.tools.includes(t.name));
  const unknown = (options.tools ?? []).filter((n) => !TOOLS.some((t) => t.name === n));
  if (unknown.length) throw new Error(`Unknown Solana Pulse tool(s): ${unknown.join(", ")}. Tools: ${TOOLS.map((t) => t.name).join(", ")}.`);
  const picked = actions.filter((a) => chosen.some((t) => a.name === `PULSE_${t.name.toUpperCase()}`));
  return {
    name: "pulse",
    // tx may be a Transaction or VersionedTransaction object as well as base64.
    methods: Object.fromEntries(chosen.map((t, i) => [camel(t.name), (agent: SolanaAgentKit, input: Record<string, any> = {}) => picked[i].handler(agent, input)])),
    actions: picked,
    initialize() {},
  };
}

export default createPulsePlugin();
