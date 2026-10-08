#!/usr/bin/env python3
"""Rewrite the MCP tool descriptions (what it returns, cost, example) and every parameter description.

Usage (from the repo root):  python3 patch_docs.py [server.ts]

Backs up server.ts to ~/bk/ first; if any anchor is missing it changes nothing.
"""
import json
import os
import re
import shutil
import sys
import time

path = sys.argv[1] if len(sys.argv) > 1 else "server.ts"
src = open(path, encoding="utf-8").read()
if "(real funds; the default)" in src:
    sys.exit("Already updated - nothing changed.")

PAID = "Cost: 1 credit (0.0022 SOL), x-api-key header required; calls that return an error are refunded."
USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"

TOOLS = {
    "get_solana_balance": {
        "desc": "Get a wallet's current SOL balance. Use it to check a wallet can cover a transfer or fee, or that funds arrived. Returns {wallet, network, balance_sol}. Cost: free. Example: {\"wallet\":\"<wallet address>\"}",
        "params": {"wallet": "Wallet whose SOL balance to read: base58 public key, 32-44 characters (required)."},
    },
    "get_solana_blockhash": {
        "desc": "Get the latest finalized blockhash. Use it when building a transaction you will sign and send yourself; a transaction is only valid with a recent blockhash. Returns {network, blockhash, timestamp}. Cost: free. Example: {\"network\":\"mainnet-beta\"}",
        "params": {},
    },
    "get_token_accounts": {
        "desc": "List every SPL token account a wallet owns: account address, mint, balance, decimals. Use it to see what tokens a wallet holds before swapping or sending. Returns {wallet, tokenCount, tokens}. Cost: free. Example: {\"wallet\":\"<wallet address>\"}",
        "params": {"wallet": "Wallet whose token accounts to list: base58 public key, 32-44 characters (required)."},
    },
    "get_recent_transactions": {
        "desc": "List a wallet's most recent transaction signatures, newest first, with slot, time and error status. Use it to find a transaction to inspect with decode_tx. Returns {wallet, count, signatures}. Cost: free. Example: {\"wallet\":\"<wallet address>\",\"limit\":5}",
        "params": {
            "wallet": "Wallet whose transaction history to list: base58 public key, 32-44 characters (required).",
            "limit": "How many signatures to return, newest first: integer 1-1000 (optional, default 10).",
        },
    },
    "simulate_solana_transaction": {
        "desc": "Dry-run a transaction against live chain state without sending it. Returns success, error, program logs and compute units used. Use it to test a transaction; for a SAFE or UNSAFE verdict with fix hints use validate_transaction. Nothing is broadcast. " + PAID + " Example: {\"transaction\":\"<base64 transaction>\"}",
        "params": {"transaction": "The transaction to test: base64-encoded serialized VersionedTransaction (not a legacy Transaction), signed or unsigned (required)."},
    },
    "find_ata": {
        "desc": "Derive the Associated Token Account (ATA) address for a wallet and token mint, and say whether it already exists on-chain. Use it before sending SPL tokens, to know the destination account and whether it must be created. Returns {owner, mint, ataAddress, exists, network}. Cost: free. Example: {\"wallet\":\"<wallet address>\",\"mint\":\"" + USDC + "\"}",
        "params": {
            "wallet": "Owner of the token account: a regular wallet address (base58 public key, 32-44 characters), not a program-derived address (required).",
            "mint": "Token mint address: base58, 32-44 characters (required). Example: " + USDC + " is USDC.",
        },
    },
    "token_profile": {
        "desc": "Live safety profile of an SPL token: decimals, supply, freeze and mint authority status, a risk level (HIGH when a freeze authority exists, so holders can be frozen), and the top 10 holders. Use it before buying or recommending an unfamiliar token. Cached 60 seconds. " + PAID + " Example: {\"mint\":\"" + USDC + "\"}",
        "params": {"mint": "Token mint address: base58, 32-44 characters (required). Pass the mint, not a ticker symbol."},
    },
    "optimal_fee": {
        "desc": "Live priority-fee recommendation for current congestion: low, medium and high tiers in micro-lamports per compute unit with estimated confirmation times, plus min, max and average. Use it just before sending a transaction so it lands without overpaying. " + PAID + " Example: {\"network\":\"mainnet-beta\"}",
        "params": {},
    },
    "decode_tx": {
        "desc": "Explain a confirmed transaction in plain language: category (swap, SOL transfer, meme-coin trade), success or failure, fee, slot, time, each account's SOL balance change, and raw logs. Use it to check what a transaction actually did. " + PAID + " Example: {\"signature\":\"<transaction signature>\"}",
        "params": {"signature": "Signature of a confirmed transaction: base58 string, about 88 characters; get one from get_recent_transactions (required)."},
    },
    "validate_transaction": {
        "desc": "Pre-send safety check: decodes the transaction, checks the fee payer can pay fees, tests it against live chain state without sending, and returns a SAFE or UNSAFE verdict with issues (each with a code and fix hint), logs and compute units. Use it as the last step before signing an agent-built transaction. " + PAID + " Example: {\"transaction\":\"<base64 transaction>\"}",
        "params": {"transaction": "The transaction to check: base64-encoded serialized VersionedTransaction (not a legacy Transaction), signed or unsigned (required)."},
    },
}

MANIFEST = {
    "get_solana_balance": "Free. Get a wallet's SOL balance.",
    "get_solana_blockhash": "Free. Get the latest finalized blockhash for building a transaction.",
    "get_token_accounts": "Free. List every SPL token account a wallet owns, with mint and balance.",
    "get_recent_transactions": "Free. List a wallet's recent transaction signatures, newest first.",
    "simulate_solana_transaction": "1 credit. Dry-run a base64 transaction against live chain state without sending it.",
    "find_ata": "Free. Derive a wallet's Associated Token Account for a mint and check if it exists.",
    "token_profile": "1 credit. Token safety profile: decimals, supply, freeze and mint authority, top holders.",
    "optimal_fee": "1 credit. Live low, medium and high priority-fee tiers for current congestion.",
    "decode_tx": "1 credit. Explain a confirmed transaction: category, status, fee, balance changes, logs.",
    "validate_transaction": "1 credit. Pre-send check: SAFE or UNSAFE verdict with fix hints.",
}

NETWORK_LINE = '  const NETWORK = z.enum(["mainnet-beta", "devnet"]).optional().default("mainnet-beta").describe(\'Cluster to query: "mainnet-beta" (real funds; the default) or "devnet" (test network). Optional.\');\n'


def fail(msg):
    sys.exit(f"ANCHOR PROBLEM: {msg}\nNothing was written.")


def sub1(pattern, repl, text, what):
    new, n = re.subn(pattern, lambda m: repl(m) if callable(repl) else repl, text)
    if n != 1:
        fail(f"expected 1 match, found {n} for {what}")
    return new


end_marker = "    return mcpServer;"
if src.count(end_marker) != 1:
    fail("'return mcpServer;' not found exactly once")

src = sub1(r"  const NETWORK = [^\n]*\n", NETWORK_LINE, src, "NETWORK helper line")

names = list(TOOLS)
for i, name in enumerate(names):
    start = src.find(f'mcpServer.tool("{name}"')
    if start < 0:
        fail(f"tool {name} not found")
    nxt = src.find('mcpServer.tool("', start + 10)
    end = nxt if nxt >= 0 else src.index(end_marker)
    block = src[start:end]
    spec = TOOLS[name]

    block = sub1(r'(mcpServer\.tool\("%s", )"(?:[^"\\]|\\.)*"' % name,
                 lambda m, d=spec["desc"]: m.group(1) + json.dumps(d, ensure_ascii=False), block, f"{name} description")
    for pname, text in spec["params"].items():
        lit = json.dumps(text, ensure_ascii=False)
        if pname == "limit":
            block = sub1(r"limit: z\.number\(\)[^\n]*",
                         lambda m, l=lit: "limit: z.number().int().min(1).max(1000).optional().default(10).describe(" + l + "),",
                         block, f"{name}.limit")
        elif pname == "wallet" and "wallet: WALLET" in block:
            block = sub1(r"wallet: WALLET", lambda m, l=lit: "wallet: z.string().describe(" + l + ")", block, f"{name}.wallet")
        else:
            block = sub1(r'\b%s: z\.string\(\)\.describe\("(?:[^"\\]|\\.)*"\)' % pname,
                         lambda m, p=pname, l=lit: p + ": z.string().describe(" + l + ")", block, f"{name}.{pname}")
    src = src[:start] + block + src[end:]

# the shared WALLET helper is no longer used by any tool
src = sub1(r"  const WALLET = [^\n]*\n", "", src, "WALLET helper line")
if re.search(r"\bWALLET\b", src):
    fail("WALLET is still referenced somewhere")

for name, text in MANIFEST.items():
    src = sub1(r'\{ "name": "%s", "description": "[^"]*" \}' % name,
               lambda m, n=name, t=text: '{ "name": "' + n + '", "description": ' + json.dumps(t, ensure_ascii=False) + " }",
               src, f"manifest entry {name}")

bk = os.path.expanduser("~/bk")
os.makedirs(bk, exist_ok=True)
backup = os.path.join(bk, f"{os.path.basename(path)}.{int(time.time())}")
shutil.copy(path, backup)
open(path, "w", encoding="utf-8").write(src)
print(f"Updated {path}. Backup: {backup}")
