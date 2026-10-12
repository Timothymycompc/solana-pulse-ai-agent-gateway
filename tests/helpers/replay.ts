// Record real mainnet responses once, then replay them so the safety tests run offline and give the same answer every time.
import fs from "fs";
import path from "path";
import { Connection, PublicKey } from "@solana/web3.js";
import type { ToolContext } from "../../server/tools";
import { clearJupCache } from "../../server/tools/lib";

export const FIXTURES = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "fixtures");

type Recording = { calls: Record<string, unknown[]>; http: Record<string, unknown> };
export type Fixture = { name: string; recordedAt: string; args: Record<string, unknown>; recording: Recording };

// JSON cannot hold PublicKeys, Buffers or bigints, so tag them on the way out and rebuild them on the way back.
function encode(value: unknown): unknown {
  if (value instanceof PublicKey) return { __pk: value.toBase58() };
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return { __buf: Buffer.from(value).toString("base64") };
  if (typeof value === "bigint") return { __big: value.toString() };
  if (Array.isArray(value)) return value.map(encode);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encode(v)]));
  return value;
}

function decode(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decode);
  if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    if (typeof v.__pk === "string") return new PublicKey(v.__pk);
    if (typeof v.__buf === "string") return Buffer.from(v.__buf, "base64");
    if (typeof v.__big === "string") return BigInt(v.__big);
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, decode(x)]));
  }
  return value;
}

// A ToolContext backed by a live RPC that remembers every answer, in call order per method.
export function recordingContext(rpcUrl: string) {
  clearJupCache();
  const recording: Recording = { calls: {}, http: {} };
  const real = new Connection(rpcUrl, "confirmed");
  const connection = new Proxy(real, {
    get(target, prop, receiver) {
      const member = Reflect.get(target, prop, receiver);
      if (typeof member !== "function") return member;
      return async (...args: unknown[]) => {
        const result = await member.apply(target, args);
        (recording.calls[String(prop)] ??= []).push(encode(result));
        return result;
      };
    },
  });
  const ctx: ToolContext = {
    connection: () => connection,
    fetchJson: async (url) => {
      const res = await fetch(url, { headers: { accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
      const body = await res.json();
      recording.http[url] = encode(body);
      return body;
    },
  };
  return { ctx, connection: real, recording };
}

// A ToolContext that answers from a recording and fails loudly on any call that was not recorded.
export function replayContext(fixture: Fixture, options: { httpDown?: boolean } = {}): ToolContext {
  clearJupCache();
  const queues = Object.fromEntries(Object.entries(fixture.recording.calls).map(([method, results]) => [method, [...results]]));
  const connection = new Proxy({}, {
    get(_target, prop) {
      if (prop === "then") return undefined;
      return async () => {
        const queue = queues[String(prop)];
        if (!queue?.length) throw new Error(`Fixture ${fixture.name} has no recorded ${String(prop)} response`);
        return decode(queue.shift());
      };
    },
  }) as Connection;
  return {
    connection: () => connection,
    fetchJson: async (url) => {
      if (options.httpDown) throw new Error("HTTP 503 from lite-api.jup.ag");
      if (!(url in fixture.recording.http)) throw new Error(`Fixture ${fixture.name} has no recorded response for ${url}`);
      return decode(fixture.recording.http[url]);
    },
  };
}

export const loadFixture = (name: string): Fixture => JSON.parse(fs.readFileSync(path.join(FIXTURES, `${name}.json`), "utf8"));

export function saveFixture(fixture: Fixture) {
  fs.mkdirSync(FIXTURES, { recursive: true });
  fs.writeFileSync(path.join(FIXTURES, `${fixture.name}.json`), JSON.stringify(fixture, null, 1) + "\n");
}
