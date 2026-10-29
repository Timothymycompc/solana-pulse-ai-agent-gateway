import { Connection, clusterApiUrl } from "@solana/web3.js";
import { ToolError, type ToolContext } from "./tools";
import { httpError } from "./tools/lib";
import { recordHttp, rpcFetch } from "./trail";

// What every tool runs with: the RPC connections and outside fetches, each noted in the call's trail (trail.ts).
// Built after secrets load, so the RPC URL and Jupiter key are in the environment.
export function makeToolContext(): ToolContext {
  const connections = {
    "mainnet-beta": new Connection(process.env.SOLANA_MAINNET_RPC_URL || clusterApiUrl("mainnet-beta"), { commitment: "confirmed", fetch: rpcFetch("Solana RPC") }),
    devnet: new Connection(process.env.SOLANA_DEVNET_RPC_URL || clusterApiUrl("devnet"), { commitment: "confirmed", fetch: rpcFetch("Solana RPC (devnet)") }),
  };
  // The Jupiter key goes only to Jupiter's keyed host, never to any other site a tool fetches.
  const jupiterKeyHeader = (url: string): Record<string, string> =>
    process.env.JUPITER_API_KEY && new URL(url).host === "api.jup.ag" ? { "x-api-key": process.env.JUPITER_API_KEY } : {};
  return {
    connection: (network) => {
      const conn = connections[network as keyof typeof connections];
      if (!conn) throw new ToolError(400, 'Unsupported network. Use "mainnet-beta" or "devnet".');
      return conn;
    },
    fetchJson: (url, timeoutMs = 8000) => recordHttp(url, async () => {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: "application/json", ...jupiterKeyHeader(url) } });
      if (!res.ok) throw await httpError(res, url);
      return res.json();
    }),
    postJson: (url, body, timeoutMs = 8000) => recordHttp(url, async () => {
      const res = await fetch(url, { method: "POST", signal: AbortSignal.timeout(timeoutMs), headers: { accept: "application/json", "content-type": "application/json", ...jupiterKeyHeader(url) }, body: JSON.stringify(body) });
      if (!res.ok) throw await httpError(res, url);
      return res.json();
    }),
  };
}
