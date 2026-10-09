import sys
R = open("toolRegistry.ts").read()
S = open("server.ts").read()
reg = [
 ('export const PRICE_SOL = 0.0022;',
  'export const LAMPORTS_PER_SOL = 1_000_000_000;\nexport const PRICE_SOL = PRICE_LAMPORTS / LAMPORTS_PER_SOL; // derived: lamports stay authoritative'),
 ('export const RATE_LIMIT = "120 requests per minute per IP address";',
  '// Verified in server.ts: apiLimiter (/api, /mcp) and freeLimiter are both 120/min, keyed by client IP (trust proxy = 1).\nexport const RATE_LIMIT = "120 requests per minute per IP address";'),
 ('"None of these tools signs, holds keys, or broadcasts a transaction. Every tool is read-only against Solana; the only state a call changes is your credit balance on paid tools."',
  '"These tools do not sign or broadcast Solana transactions. They read Solana state; paid calls also update gateway-side credit usage. Results are informational and do not guarantee future transaction outcomes."'),
 ('x-api-key header required; calls that return an error are refunded.`',
  'x-api-key header required; tool errors are refunded, a completed result is charged even if it reports a problem.`'),
 ('    t.broadcasts ? "" : "Read-only: nothing is broadcast to the network.",',
  '    t.broadcasts || t.trust.includes("broadcast") ? "" : "Read-only: nothing is broadcast to the network.",'),
 ('It does not prove a token is or is not a honeypot or scam.',
  'The field security.isHoneypotRisk is an authority-based heuristic (true when a freeze authority exists), not a honeypot detector. It does not prove a token is or is not a honeypot or scam.'),
 (', "See whether holders can be frozen or supply can be inflated"', ''),
]
srv = [
 ('app.use("/mcp/", apiLimiter);',
  'app.use("/mcp/", apiLimiter);\n\n  // Reject unknown networks instead of silently falling back to mainnet.\n  app.use("/api/", (req: any, res: any, next: any) => {\n    const n = req.query?.network ?? (req.body && typeof req.body === "object" ? req.body.network : undefined);\n    if (n !== undefined && n !== null && n !== "" && n !== "mainnet-beta" && n !== "devnet") {\n      return res.status(400).json({ error: `Invalid network "${String(n).slice(0, 40)}". Use "mainnet-beta" or "devnet".` });\n    }\n    next();\n  });'),
]
for label, text, edits in (("toolRegistry.ts", R, reg), ("server.ts", S, srv)):
    for old, new in edits:
        n = text.count(old)
        if n != 1:
            print("ABORT (nothing written):", label, "found", n, "for:", old[:60]); sys.exit(1)
        text = text.replace(old, new)
    if label == "toolRegistry.ts": R = text
    else: S = text
open("toolRegistry.ts", "w").write(R); open("server.ts", "w").write(S)
print("PATCHED registry (%d edits) and server.ts (%d edit)" % (len(reg), len(srv)))
