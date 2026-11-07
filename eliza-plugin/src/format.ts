// Turns a Pulse answer into the plain words the agent replies with. Every reply names its source.

const SOURCE = "Source: Solana Pulse, live Solana mainnet data.";

export function replyText(tool: string, data: Record<string, any>): string {
  const lines: string[] = [];
  if (tool === "find_token") {
    const best = data.best;
    if (best?.address) {
      lines.push(`${best.symbol ?? "?"} (${best.name ?? "unknown name"}): ${best.address}. Confidence: ${data.confidence ?? "unknown"}.`);
      if (Number(data.copycats) > 0) lines.push(`${data.copycats} other tokens use a similar name. Use this address, not the name.`);
    } else {
      lines.push(`No token found for "${data.name ?? "that name"}".`);
    }
    if (data.next_step) lines.push(String(data.next_step));
  } else if (tool === "why_failed") {
    const first = data.explanations?.[0];
    if (first) {
      lines.push(`${first.name ?? first.code}: ${first.meaning ?? ""}`.trim());
      if (first.likely_cause) lines.push(`Likely cause: ${first.likely_cause}`);
      if (first.fix) lines.push(`Fix: ${first.fix}`);
    } else {
      lines.push("Pulse doesn't know this error.");
      if (data.next_step) lines.push(String(data.next_step));
    }
  } else if (typeof data.summary === "string" && data.summary) {
    const verdict = typeof data.verdict === "string" ? data.verdict : "";
    lines.push(verdict && !data.summary.startsWith(verdict) ? `${verdict}: ${data.summary}` : data.summary);
    if (tool === "token_safety") lines.push("A safety check can't promise a token is safe. It looks for the known ways people lose money with a token.");
  } else {
    lines.push("Pulse answered without a summary. The full answer is in the action's data.");
  }
  lines.push(SOURCE);
  return lines.join("\n");
}
