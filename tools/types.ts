import type { Connection } from "@solana/web3.js";
import type { z } from "zod";

// Documentation for one input. Every tool documents what each input is and where a caller gets it.
export type InputDoc = {
  name: string;
  type: string;
  required: boolean;
  description: string;
  howToGet: string;
};

// Documentation for one output field: what it is, exactly how the gateway computes it, and what it means.
// Nested fields use dot and [] paths, e.g. "walletChanges[].change".
export type OutputDoc = {
  field: string;
  type: string;
  meaning: string;
  howComputed: string;
};

export type ToolContext = {
  connection: (network: string) => Connection;
  fetchJson: (url: string, timeoutMs?: number) => Promise<any>;
};

export type ToolCategory = "transactions" | "tokens" | "wallets" | "network" | "reference";

export interface ToolDef {
  name: string;
  title: string;
  category: ToolCategory;
  // A concrete example of the money or the hallucination this tool prevents.
  benefit: { kind: "money" | "accuracy"; text: string };
  // One line telling an agent when to call this tool. Most paid listings lack this; ours always have it.
  useWhen: string;
  description: string;
  inputs: z.ZodRawShape;
  inputDocs: InputDoc[];
  outputs: OutputDoc[];
  notes?: string[];
  // Builds arguments from live mainnet data, so the playground runs a real request with no edits.
  example: (ctx: ToolContext) => Promise<Record<string, unknown>>;
  run: (args: any, ctx: ToolContext) => Promise<Record<string, unknown>>;
}

// A failure the caller can fix; carries an HTTP status and a hint.
export class ToolError extends Error {
  constructor(public status: number, message: string, public fix?: string) {
    super(message);
  }
}
