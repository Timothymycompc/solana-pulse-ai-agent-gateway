// tx_version: which transaction format a transaction uses (legacy, version 0 or version 1), and what that means for
// code that reads it. Version 1 went live on mainnet on 2026-09-15 (first one in slot 447120004); apps that ask the RPC
// for version 0 at most get error -32015 on it, and some library versions can't decode it even when asked correctly.
// Library results below were measured on mainnet on 2026-10-30 (~/v1-ready FINDINGS.md, Cloud Build de37e854).
import { z } from "zod";
import { NETWORK_DOC, isoTime } from "./lib";
import { ToolError, type ToolDef } from "./types";

const NETWORK = z.enum(["mainnet-beta", "devnet"]).optional().default("mainnet-beta");

export type TxFormat = "legacy" | "0" | "1" | "unknown";

// Reads the version from raw transaction bytes, no RPC needed.
// Legacy and v0 start with the signature count (a small number, below 0x80), then 64 bytes per signature, then the
// message; a v0 message's first byte has the high bit set (0x80). A v1 transaction starts with its version byte (0x81),
// before anything else (seen on mainnet: v1 bytes begin "81 01 00 01", legacy and v0 begin with "01").
export function versionFromBytes(raw: Uint8Array): TxFormat {
  if (!raw.length) return "unknown";
  if (raw[0] & 0x80) return (raw[0] & 0x7f) === 1 ? "1" : "unknown";
  const messageAt = 1 + 64 * raw[0];
  if (messageAt >= raw.length) return "unknown";
  const first = raw[messageAt];
  if (!(first & 0x80)) return "legacy";
  return (first & 0x7f) === 0 ? "0" : "unknown";
}

const READERS = {
  legacy: "Every reader can read it, whatever maxSupportedTransactionVersion it asks for.",
  "0": "Readers must ask with maxSupportedTransactionVersion 0 or higher. Code that asks for none at all gets error -32015.",
  "1": "Readers must ask with maxSupportedTransactionVersion: 1. Code that asks for 0 gets error -32015 and never sees it. "
    + "@solana/web3.js before 1.99.0 throws on it even when asked correctly; @solana/kit before 7.1.0 returns version as the bigint 1n "
    + "(and its types reject 1 before 6.10.0); solana-py 0.30.2-0.41.0 reads it fine with max_supported_transaction_version=1.",
  unknown: "The format couldn't be read: unknown.",
};
const FIX = "Ask with maxSupportedTransactionVersion: 1 (Python: max_supported_transaction_version=1, Rust: Some(1)), and use @solana/web3.js 1.99.0+ or @solana/kit 7.1.0+.";

export const txVersion: ToolDef = {
  name: "tx_version",
  title: "Which transaction version is this?",
  category: "transactions",
  benefit: { kind: "money", text: "About 45% of Solana transactions are version 1 since September 15, 2026, and apps that read with version 0 silently miss them: payments rejected, trades not copied, burns not credited." },
  useWhen: "Run when code can't find or read a transaction that is on chain, or before relying on code that reads other people's transactions.",
  usage: '{"tx_id": "<signature>"}  or  {"tx": "<base64 transaction>"}',
  description: "Says whether a transaction is legacy, version 0 or version 1, and which readers (RPC settings and library versions) can read it.",
  inputs: { tx_id: z.string().min(64).max(100).optional(), tx: z.string().optional(), network: NETWORK },
  inputDocs: [
    { name: "tx_id", type: "string (base58)", required: false, lookingFor: "A landed transaction's signature. Give this or tx.", whereToGet: "Returned when it was sent, or from history. Never make one up." },
    { name: "tx", type: "string (base64)", required: false, lookingFor: "A raw transaction, signed or not. Give this or tx_id.", whereToGet: "The bytes a wallet or builder gave you, base64-encoded." },
    NETWORK_DOC,
  ],
  outputs: [
    { field: "version", type: '"legacy" | "0" | "1" | "unknown"', is: "The transaction's format.", howWorkedOut: "tx_id: the version the RPC reports, asked with maxSupportedTransactionVersion 1. tx: read from the first bytes (see notes)." },
    { field: "readable_with_max_version_0", type: "boolean | null", is: "Whether code asking with maxSupportedTransactionVersion: 0 can read it. null when the version is unknown.", howWorkedOut: "True for legacy and 0, false for 1." },
    { field: "who_can_read_it", type: "string", is: "Which RPC settings and library versions can read this format.", howWorkedOut: "Fixed text per version, from mainnet tests of each library version (2026-10-30)." },
    { field: "fix", type: "string | null", is: "What to change so code reads it. null when nothing needs changing.", howWorkedOut: "Given for version 1." },
    { field: "found / slot / time", type: "boolean / number | null / string | null", is: "For tx_id: whether the transaction was found, and where and when it landed.", howWorkedOut: "From getTransaction (finalized or confirmed)." },
    { field: "source", type: "string", is: "Where the version came from.", howWorkedOut: '"rpc getTransaction" or "transaction bytes".' },
  ],
  notes: [
    "Version 1 transactions start with the byte 0x81, before the signatures; legacy and version 0 start with the signature count. Code that parses raw bytes the old way breaks on version 1 too.",
    "Version 1 went live on mainnet on 2026-09-15; the first one we found is in slot 447120004.",
  ],
  example: async () => ({ tx_id: "33H9WFGP5sbhujwe8FvhCXi99Y3js3eUcrc8ABoTNm9VCdxKh3QkWe2CZteXfaEv6YytRYr1YX4ykJ9jtLmsGGD1" }),
  run: async ({ tx_id, tx, network }, ctx) => {
    const answer = (version: TxFormat, extra: Record<string, unknown>) => ({
      version,
      readable_with_max_version_0: version === "unknown" ? null : version !== "1",
      who_can_read_it: READERS[version],
      fix: version === "1" ? FIX : null,
      ...extra,
    });
    if (tx) {
      const raw = Buffer.from(String(tx).trim(), "base64");
      if (!raw.length) throw new ToolError(400, "tx is not base64.", "Pass the transaction bytes base64-encoded.");
      return answer(versionFromBytes(raw), { found: null, slot: null, time: null, source: "transaction bytes" });
    }
    if (!tx_id) throw new ToolError(400, "Give tx_id (a signature) or tx (base64 bytes).", 'Example: {"tx_id": "<signature>"}');
    const res: any = await (ctx.connection(network) as any)._rpcRequest("getTransaction", [String(tx_id).trim(), { encoding: "json", maxSupportedTransactionVersion: 1, commitment: "confirmed" }]);
    if (res.error) throw new ToolError(502, `RPC error: ${res.error.message}`, "Retry in a moment.");
    const t = res.result;
    if (!t) return { version: "unknown", readable_with_max_version_0: null, who_can_read_it: "Not found on chain (yet): unknown.", fix: null, found: false, slot: null, time: null, source: "rpc getTransaction" };
    const v: TxFormat = t.version === "legacy" ? "legacy" : t.version === 0 ? "0" : t.version === 1 ? "1" : "unknown";
    return answer(v, { found: true, slot: t.slot, time: isoTime(t.blockTime), source: "rpc getTransaction" });
  },
};
