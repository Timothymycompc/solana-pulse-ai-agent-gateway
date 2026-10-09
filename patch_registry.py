import sys
p = "server.ts"
s = open(p).read()
edits = [
 ('import { meterCall, meterMiddleware, refundCredit } from "./meter";',
  'import { meterCall, meterMiddleware, refundCredit } from "./meter";\nimport { FREE_TOOL_NAMES, PRICE_LAMPORTS, getTool, buildDescription } from "./toolRegistry";'),
 ('const FREE_TOOLS = new Set(["get_solana_balance", "get_solana_blockhash", "get_token_accounts", "get_recent_transactions", "find_ata"]);',
  'const FREE_TOOLS = new Set(FREE_TOOL_NAMES);'),
 ('    const handler = rest.pop();\n',
  '    const handler = rest.pop();\n    const reg = getTool(name);\n    if (reg && typeof rest[0] === "string") rest[0] = buildDescription(reg);\n    else console.warn(`[registry] MCP tool "${name}" is not in toolRegistry.ts`);\n'),
 ('priceLamports: 2200000 });', 'priceLamports: PRICE_LAMPORTS });'),
 ('m.priceLamports || 2200000', 'm.priceLamports || PRICE_LAMPORTS'),
]
for old, new in edits:
    n = s.count(old)
    if n != 1:
        print("ABORT: expected 1 match, found", n, "for:", old[:70]); sys.exit(1)
    s = s.replace(old, new)
open(p, "w").write(s)
print("PATCHED", len(edits), "edits")
