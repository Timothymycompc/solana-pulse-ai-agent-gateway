// Record real mainnet responses once, then replay them so the safety tests run offline and give the same answer every time.
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { Connection, PublicKey } from "@solana/web3.js";
import type { ToolContext } from "../../server/tools";
import { clearJupCache, httpError } from "../../server/tools/lib";

export const FIXTURES = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "fixtures");

type Recording = { calls: Record<string, unknown[]>; http: Record<string, unknown>; post?: Record<string, unknown> };

// POST answers are keyed by the URL and a hash of the body, so a replay only matches the exact same request.
const postKey = (url: string, body: unknown) => `${url} ${crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex").slice(0, 16)}`;
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
        let result;
        try { result = await member.apply(target, args); }
        catch (error: any) {
          // Errors are answers too (the code may handle one), so they replay as the same error.
          (recording.calls[String(prop)] ??= []).push({ __error: String(error?.message ?? error) });
          throw error;
        }
        (recording.calls[String(prop)] ??= []).push(encode(result));
        return result;
      };
    },
  });
  const ctx: ToolContext = {
    connection: () => connection,
    fetchJson: async (url) => {
      const res = await fetch(url, { headers: { accept: "application/json" } });
      // Errors are answers too (a "not tradable" quote), so they replay as the same error.
      if (!res.ok) { const error = await httpError(res, url); recording.http[url] = { __error: error.message }; throw error; }
      const body = await res.json();
      recording.http[url] = encode(body);
      return body;
    },
    postJson: async (url, payload) => {
      const res = await fetch(url, { method: "POST", headers: { accept: "application/json", "content-type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
      const body = await res.json();
      (recording.post ??= {})[postKey(url, payload)] = encode(body);
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
        const next: any = queue.shift();
        if (next && typeof next.__error === "string") throw new Error(next.__error);
        return decode(next);
      };
    },
  }) as Connection;
  return {
    connection: () => connection,
    retryDelayMs: 0,
    fetchJson: async (url) => {
      if (options.httpDown) throw new Error("HTTP 503 from lite-api.jup.ag");
      if (!(url in fixture.recording.http)) throw new Error(`Fixture ${fixture.name} has no recorded response for ${url}`);
      const recorded: any = fixture.recording.http[url];
      if (recorded && typeof recorded.__error === "string") throw new Error(recorded.__error);
      return decode(recorded);
    },
    postJson: async (url, payload) => {
      if (options.httpDown) throw new Error("HTTP 503 from lite-api.jup.ag");
      const key = postKey(url, payload);
      if (!fixture.recording.post || !(key in fixture.recording.post)) throw new Error(`Fixture ${fixture.name} has no recorded POST to ${url}`);
      return decode(fixture.recording.post[key]);
    },
  };
}

export const loadFixture = (name: string): Fixture => JSON.parse(fs.readFileSync(path.join(FIXTURES, `${name}.json`), "utf8"));

export function saveFixture(fixture: Fixture) {
  fs.mkdirSync(FIXTURES, { recursive: true });
  fs.writeFileSync(path.join(FIXTURES, `${fixture.name}.json`), JSON.stringify(fixture, null, 1) + "\n");
}
