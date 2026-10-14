// A note from the developer to one particular caller, found by its user agent. Only that caller's /api answers change:
// a JSON object gets a note_from_the_developer field and every answer gets an x-note-from-the-developer header.
import type { NextFunction, Request, Response } from "express";

const CONTACT = "timothymycompc@gmail.com or https://github.com/Timothymycompc/solana-pulse-ai-agent-gateway/issues";

export const CALLER_NOTES: { userAgent: RegExp; note: string }[] = [
  {
    // Seen from 2026-10-12: checks token_safety on USDC every 15 minutes, from India and an AWS server.
    userAgent: /^algebra-executor\//i,
    note: `Hi from the developer of Solana Pulse 👋 I noticed your algebra-executor checking token_safety on USDC every 15 minutes. Glad it's useful! I'd love to hear what you're making, and if anything's missing or you'd like more free calls while you test, just ask. Contact: ${CONTACT}`,
  },
];

// Headers must be plain ASCII, so the emoji is dropped there.
const asHeader = (text: string) => text.replace(/[^\x20-\x7E]/g, "").replace(/\s+/g, " ").trim();

export function callerNotes(req: Request, res: Response, next: NextFunction) {
  const ua = req.get("user-agent") ?? "";
  const match = CALLER_NOTES.find((n) => n.userAgent.test(ua));
  if (!match) return next();
  res.setHeader("x-note-from-the-developer", asHeader(match.note));
  const json = res.json.bind(res);
  res.json = (body: any) => json(body && typeof body === "object" && !Array.isArray(body) ? { ...body, note_from_the_developer: match.note } : body);
  next();
}
