// Checks a transaction with Solana Pulse before anything signs it. Both checks must pass:
//   check_tx   dry-runs it on live mainnet and must answer OK (not REVIEW or BLOCK)
//   tx_matches compares it with what the user asked for and must answer MATCH
// Anything else, including Pulse being unreachable or out of free calls, means "don't sign" (fail closed).
// Same file in every template (templates/shared/pulse-guard.ts is the original; a test keeps the copies identical).

export const PULSE_URL = (process.env.PULSE_URL || "https://solana-pulse-gateway-1021990235790.us-central1.run.app").replace(/\/$/, "");

export type Expected =
  | { action?: "transfer"; token: string; amount: string; to: string; from?: string }
  | { action: "swap"; sell: string; amount: string; buy: string; from?: string };

export type GuardResult = {
  allowed: boolean;
  reasons: string[]; // why it was refused, in plain words; empty when allowed
  check: Record<string, any>; // check_tx's full answer
  match: Record<string, any>; // tx_matches's full answer
};

export async function callPulse(tool: string, input: Record<string, unknown>, fetchFn: typeof fetch = fetch): Promise<Record<string, any>> {
  const key = process.env.PULSE_API_KEY;
  try {
    const res = await fetchFn(`${PULSE_URL}/api/tools/${tool}`, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "pulse-template/0.1", ...(key ? { "x-api-key": key } : {}) },
      body: JSON.stringify(input),
    });
    const data: any = await res.json().catch(() => ({}));
    if (res.status === 402) return { error: `${tool}: today's 25 free calls are used up (pay per call with x402, or set PULSE_API_KEY).` };
    if (!res.ok) return { error: `${tool}: ${data?.error ?? `HTTP ${res.status}`}` };
    return data;
  } catch (e) {
    return { error: `${tool}: could not reach Solana Pulse (${e instanceof Error ? e.message : String(e)}).` };
  }
}

export async function checkBeforeSigning(tx: string, expected: Expected, fetchFn: typeof fetch = fetch): Promise<GuardResult> {
  const [check, match] = await Promise.all([callPulse("check_tx", { tx }, fetchFn), callPulse("tx_matches", { tx, expected }, fetchFn)]);
  const reasons: string[] = [];
  if (check.error) reasons.push(`Could not check the transaction: ${check.error}`);
  else if (check.verdict !== "OK") reasons.push(`check_tx says ${check.verdict}: ${check.summary ?? "no summary"}`);
  if (match.error) reasons.push(`Could not compare it with the request: ${match.error}`);
  else if (match.verdict !== "MATCH") reasons.push(`tx_matches says ${match.verdict}: ${match.summary ?? "no summary"}`);
  return { allowed: reasons.length === 0, reasons, check, match };
}
