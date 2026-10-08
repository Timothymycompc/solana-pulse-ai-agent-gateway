#!/usr/bin/env python3
"""Expose all gateway endpoints as MCP tools in server.ts.

Usage (from the repo root):  python3 patch_mcp.py [server.ts]

- Backs up server.ts to ~/bk/ first.
- Checks every anchor before writing anything; if one is missing it stops and changes nothing.
- Registers find_ata, token_profile, optimal_fee, decode_tx, validate_transaction as MCP tools.
- Adds read-only/non-destructive hints and richer descriptions to all 10 tools,
  describes the wallet, network and limit parameters, adds find_ata to FREE_TOOLS,
  and lists validate_transaction in /.well-known/mcp.json.
"""
import os
import shutil
import sys
import time

path = sys.argv[1] if len(sys.argv) > 1 else "server.ts"
src = open(path, encoding="utf-8").read()

MARK = "// ---- Added: remaining gateway endpoints exposed as MCP tools ----"
if MARK in src:
    sys.exit("Already patched - nothing changed.")

NEW_TOOLS = r'''  // ---- Added: remaining gateway endpoints exposed as MCP tools ----

  mcpServer.tool("find_ata", "Derive the Associated Token Account (ATA) address for a wallet and a token mint, and report whether that account already exists on-chain. Use it before sending SPL tokens to a wallet, to know the destination account and whether it must be created first. Free.", {
    wallet: z.string().describe("Solana wallet address (base58 public key) that owns or will own the token account."),
    mint: z.string().describe("Token mint address (base58). Example: the USDC mint address."),
    network: NETWORK
  }, READ_ONLY, async ({ wallet, mint, network }: any) => {
    stats.solanaRpcCalls++;
    try {
      const owner = new PublicKey(wallet);
      const mintPubkey = new PublicKey(mint);
      const ata = await getAssociatedTokenAddress(mintPubkey, owner);
      const accountInfo = await getConnection(network).getAccountInfo(ata);
      return { content: [{ type: "text", text: JSON.stringify({ owner: owner.toBase58(), mint: mintPubkey.toBase58(), ataAddress: ata.toBase58(), exists: !!accountInfo, network }, null, 2) }] };
    } catch (err: any) { return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true }; }
  });

  mcpServer.tool("token_profile", "Live safety profile of an SPL token: decimals, supply, whether the freeze authority and mint authority are still active (honeypot / rug risk), a HIGH or LOW risk level, and the top 10 holders. Use it before buying, swapping or recommending an unfamiliar token. Cached for 60 seconds. Costs 1 credit (0.0022 SOL) per call; requires the x-api-key header.", {
    mint: z.string().describe("Token mint address (base58). Ticker symbols are not accepted here; pass the mint address."),
    network: NETWORK
  }, READ_ONLY, async ({ mint, network }: any) => {
    stats.solanaRpcCalls++;
    try {
      let mintPubkey: PublicKey;
      try { mintPubkey = new PublicKey(String(mint)); }
      catch { return { content: [{ type: "text", text: "Error: That is not a valid mint address" }], isError: true }; }

      const cacheKey = network + ":" + mintPubkey.toBase58();
      const hit = profileCache.get(cacheKey);
      if (hit && Date.now() - hit.t < 60000) return { content: [{ type: "text", text: JSON.stringify({ ...hit.v, cached: true }, null, 2) }] };

      const connection = getConnection(network);
      const [mintInfo, largest] = await Promise.all([
        withTimeout(connection.getParsedAccountInfo(mintPubkey), 8000),
        withTimeout(connection.getTokenLargestAccounts(mintPubkey), 5000).catch((e: any) => ({ failed: String(e?.message || e) })),
      ]);

      if (!mintInfo.value) return { content: [{ type: "text", text: "Error: Mint not found" }], isError: true };
      const mintData: any = mintInfo.value.data;
      if (!mintData || typeof mintData !== "object" || !mintData.parsed || mintData.parsed.type !== "mint") {
        return { content: [{ type: "text", text: "Error: This address exists but is not a token mint" }], isError: true };
      }
      const parsedMint = mintData.parsed.info;
      const decimals = Number(parsedMint.decimals);

      let topHolders: any[] | null = null;
      let topHoldersNote: string | undefined;
      const largestValue = (largest as any).value;
      if (largestValue) {
        topHolders = largestValue.slice(0, 10).map((acc: any) => ({
          address: acc.address.toBase58(),
          amount_raw: acc.amount,
          amount_formatted: (Number(acc.amount) / Math.pow(10, decimals)).toFixed(4)
        }));
      } else {
        topHoldersNote = "Top holders are unavailable right now because the RPC was slow or declined this heavy lookup. Everything else is live.";
      }

      const freezeAuth = parsedMint.freezeAuthority;
      const mintAuth = parsedMint.mintAuthority;
      const isHoneypotRisk = freezeAuth !== null;

      const body = {
        mint: mintPubkey.toBase58(),
        decimals,
        supply_raw: parsedMint.supply,
        supply_formatted: (Number(parsedMint.supply) / Math.pow(10, decimals)).toLocaleString(),
        freezeAuthority: freezeAuth,
        mintAuthority: mintAuth,
        security: {
          isHoneypotRisk,
          freezeAuthorityEnabled: !!freezeAuth,
          mintAuthorityEnabled: !!mintAuth,
          riskLevel: isHoneypotRisk ? 'HIGH' : 'LOW',
          analysis: isHoneypotRisk
            ? "HIGH RISK: Freeze authority is active. The developer can freeze any wallet's tokens."
            : "LOW RISK: No freeze authority detected."
        },
        topHolders,
        topHoldersNote,
        network
      };
      profileCache.set(cacheKey, { t: Date.now(), v: body });
      return { content: [{ type: "text", text: JSON.stringify(body, null, 2) }] };
    } catch (err: any) {
      const slow = String(err?.message || "").includes("timed out");
      return { content: [{ type: "text", text: slow ? "Error: The Solana RPC was too slow to answer. Try again in a moment." : `Error: ${err.message}` }], isError: true };
    }
  });

  mcpServer.tool("optimal_fee", "Live priority-fee recommendations for the current network congestion: low, medium and high tiers in micro-lamports per compute unit with estimated confirmation times, plus raw min, max and average. Use it just before building or sending a transaction so it lands without overpaying. Costs 1 credit (0.0022 SOL) per call; requires the x-api-key header.", {
    network: NETWORK
  }, READ_ONLY, async ({ network }: any) => {
    stats.solanaRpcCalls++;
    try {
      const connection = getConnection(network);
      const canaryAccounts = [new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")];
      const fees = await connection.getRecentPrioritizationFees({ lockedWritableAccounts: canaryAccounts });
      if (!fees || fees.length === 0) throw new Error("Could not fetch prioritization fees from cluster");

      const feeValues = fees.map(f => f.prioritizationFee);
      const minFee = Math.min(...feeValues);
      const maxFee = Math.max(...feeValues);
      const avgFee = Math.round(feeValues.reduce((a, b) => a + b, 0) / feeValues.length);
      const tiers = {
        low: avgFee,
        medium: Math.round(avgFee * 1.5),
        high: maxFee > 0 ? maxFee : Math.round(avgFee * 3)
      };

      return { content: [{ type: "text", text: JSON.stringify({
        network,
        current_congestion: avgFee > 1000 ? "HIGH" : avgFee > 100 ? "MODERATE" : "LOW",
        tiers: {
          low: { lamports: tiers.low, description: "Economical: Good for non-urgent transfers. Might take a few blocks.", estimated_time: "15-60 seconds" },
          medium: { lamports: tiers.medium, description: "Balanced: Recommended for most swaps and agentic tasks.", estimated_time: "5-15 seconds" },
          high: { lamports: tiers.high, description: "Aggressive: Use for time-sensitive trades or high-competition mints.", estimated_time: "1-5 seconds" }
        },
        raw_stats: { min: minFee, max: maxFee, average: avgFee, sample_size: fees.length },
        llm_advice: `Network congestion is currently ${avgFee > 1000 ? 'HIGH' : 'LOW'}. For reliable execution, use at least ${tiers.medium} lamports per compute unit.`
      }, null, 2) }] };
    } catch (err: any) { return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true }; }
  });

  mcpServer.tool("decode_tx", "Explain a confirmed Solana transaction in plain language: category (swap, SOL transfer, meme-coin trade), whether it succeeded, fee, slot, time, every account's SOL balance change, and the raw logs. Use it to verify what a transaction actually did instead of guessing from a signature. Costs 1 credit (0.0022 SOL) per call; requires the x-api-key header.", {
    signature: z.string().describe("Transaction signature (base58) of a confirmed transaction. Example: a signature returned by get_recent_transactions."),
    network: NETWORK
  }, READ_ONLY, async ({ signature, network }: any) => {
    stats.solanaRpcCalls++;
    try {
      const tx = await getConnection(network).getTransaction(signature, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' });
      if (!tx) return { content: [{ type: "text", text: "Error: Transaction not found or not yet confirmed" }], isError: true };

      const logs = tx.meta?.logMessages || [];
      let summary = "Generic transaction executed.";
      let category = "Transfer";
      if (logs.some(l => l.includes("Jupiter"))) { summary = "Swap executed via Jupiter Aggregator."; category = "Swap"; }
      else if (logs.some(l => l.includes("Pump.fun"))) { summary = "Interaction with Pump.fun (Mint or Swap)."; category = "MemeCoin"; }
      else if (logs.some(l => l.includes("Raydium"))) { summary = "Swap executed via Raydium."; category = "Swap"; }
      else if (logs.some(l => l.includes("System Program: Transfer"))) { summary = "Native SOL transfer."; category = "Transfer"; }

      const accountKeys = tx.transaction.message.staticAccountKeys.map(k => k.toBase58());
      const preBalances = tx.meta?.preBalances || [];
      const postBalances = tx.meta?.postBalances || [];
      const balanceChanges = accountKeys.map((address, i) => {
        const deltaLamports = (postBalances[i] ?? 0) - (preBalances[i] ?? 0);
        return { address, deltaLamports, deltaSol: deltaLamports / 1e9 };
      }).filter(c => c.deltaLamports !== 0);

      return { content: [{ type: "text", text: JSON.stringify({
        signature,
        network,
        summary,
        category,
        details: { slot: tx.slot, fee: tx.meta?.fee, timestamp: tx.blockTime, status: tx.meta?.err === null ? "SUCCESS" : "FAILED" },
        balance_changes: balanceChanges,
        raw_logs: logs,
        llm_context: `This transaction was a ${category}. ${summary} The transaction ${tx.meta?.err === null ? 'succeeded' : 'failed'}.`
      }, null, 2) }] };
    } catch (err: any) { return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true }; }
  });

  mcpServer.tool("validate_transaction", "Safety check for a transaction before it is sent: decodes it, checks the fee payer can cover fees, runs it against live chain state without broadcasting, and returns a SAFE or UNSAFE verdict with a list of issues, each with a code and a fix hint, plus logs and compute units. Use it as the last step before signing an agent-built transaction. Nothing is sent to the network. Costs 1 credit (0.0022 SOL) per call; requires the x-api-key header.", {
    transaction: z.string().describe("Base64-encoded serialized VersionedTransaction (not a legacy Transaction)."),
    network: NETWORK
  }, READ_ONLY, async ({ transaction, network }: any) => {
    stats.solanaRpcCalls++;
    try {
      const connection = getConnection(network);
      const issues: { severity: 'ERROR' | 'WARNING'; code: string; message: string; fix: string }[] = [];

      let tx: VersionedTransaction;
      try {
        tx = VersionedTransaction.deserialize(Buffer.from(transaction, 'base64'));
      } catch (decodeErr: any) {
        return { content: [{ type: "text", text: JSON.stringify({
          network,
          verdict: "UNSAFE",
          safe: false,
          issues: [{
            severity: "ERROR",
            code: "MALFORMED_TRANSACTION",
            message: `Could not decode the transaction: ${decodeErr.message}`,
            fix: "Confirm the transaction is a base64-encoded serialized VersionedTransaction, not a legacy Transaction or raw instruction set."
          }],
          simulation: null
        }, null, 2) }] };
      }

      try {
        const feePayer = tx.message.staticAccountKeys[0];
        const numSignatures = tx.message.header.numRequiredSignatures || 1;
        const baseFeeLamports = 5000 * numSignatures;
        const feePayerBalance = await connection.getBalance(feePayer);
        if (feePayerBalance < baseFeeLamports) {
          issues.push({
            severity: "ERROR",
            code: "INSUFFICIENT_FEE_PAYER_BALANCE",
            message: `Fee payer ${feePayer.toBase58()} has ${feePayerBalance} lamports, below the estimated base fee of ${baseFeeLamports} lamports for ${numSignatures} signature(s).`,
            fix: "Fund the fee payer wallet with more SOL before sending this transaction."
          });
        }
      } catch (feeCheckErr: any) {
        issues.push({
          severity: "WARNING",
          code: "FEE_PAYER_CHECK_FAILED",
          message: `Could not verify fee payer balance: ${feeCheckErr.message}`,
          fix: "Proceed with caution — fee payer solvency was not confirmed."
        });
      }

      const simResult = await connection.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true });

      if (simResult.value.err) {
        const errStr = JSON.stringify(simResult.value.err);
        const logs = simResult.value.logs || [];
        let code = "SIMULATION_FAILED";
        let message = `Simulation returned an error: ${errStr}`;
        let fix = "Review the logs below for the failing instruction and program.";

        if (errStr.includes("InsufficientFundsForRent") || logs.some(l => l.includes("insufficient funds for rent"))) {
          code = "INSUFFICIENT_RENT";
          message = "An account in this transaction doesn't have enough SOL to remain rent-exempt.";
          fix = "Fund the account with more SOL, or create it via the appropriate 'create account' instruction with enough lamports for rent exemption.";
        } else if (logs.some(l => l.includes("insufficient lamports") || l.includes("Attempt to debit an account but found no record of a prior credit"))) {
          code = "INSUFFICIENT_BALANCE";
          message = "One of the accounts doesn't have enough SOL or tokens for the transfer being attempted.";
          fix = "Confirm the source account's real balance with get_solana_balance or get_token_accounts before retrying.";
        } else if (errStr.includes("AccountNotFound") || logs.some(l => l.includes("could not find account"))) {
          code = "ACCOUNT_NOT_FOUND";
          message = "This transaction references an account that doesn't exist on-chain yet.";
          fix = "If this is a token account, check find_ata first — it may need to be created before this transaction can run.";
        } else if (errStr.includes("custom program error")) {
          code = "PROGRAM_ERROR";
          message = `The target program rejected this instruction: ${errStr}`;
          fix = "This is a program-specific error code. Check the target program's documentation for what this code means, or inspect the logs below.";
        }
        issues.push({ severity: "ERROR", code, message, fix });
      }

      const hasErrors = issues.some(i => i.severity === "ERROR");
      return { content: [{ type: "text", text: JSON.stringify({
        network,
        verdict: hasErrors ? "UNSAFE" : "SAFE",
        safe: !hasErrors,
        issues,
        simulation: {
          success: simResult.value.err === null,
          error: simResult.value.err,
          logs: simResult.value.logs,
          unitsConsumed: simResult.value.unitsConsumed
        }
      }, null, 2) }] };
    } catch (err: any) { return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true }; }
  });

'''

ENUM = 'z.enum(["mainnet-beta", "devnet"]).optional().default("mainnet-beta")'


def once(s, old, new):
    n = s.count(old)
    if n != 1:
        sys.exit(f"ANCHOR PROBLEM: expected 1 match, found {n} for: {old[:80]!r}\nNothing was written.")
    return s.replace(old, new)


# 1. find_ata becomes a free tool
src = once(
    src,
    '"get_token_accounts", "get_recent_transactions"]);',
    '"get_token_accounts", "get_recent_transactions", "find_ata"]);',
)

# 2. shared helpers, placed right before the first tool
HELPERS = '''  const NETWORK = z.enum(["mainnet-beta", "devnet"]).optional().default("mainnet-beta").describe('Solana cluster to query: "mainnet-beta" (live network with real funds, the default) or "devnet" (test network).');
  const WALLET = z.string().describe("Solana wallet address: a base58-encoded public key, 32-44 characters.");
  const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

'''
first_tool = '  mcpServer.tool("get_solana_balance", "Get the SOL balance of any wallet address", {'
src = once(src, first_tool, HELPERS + first_tool)

# 3. new descriptions for the existing tools
DESCRIPTIONS = [
    ('"get_solana_balance", "Get the SOL balance of any wallet address"',
     '"get_solana_balance", "Get the current SOL balance of a Solana wallet. Use it to check whether a wallet can afford a transfer or fee, or to confirm that funds arrived. Returns the balance in SOL. Read-only and free."'),
    ('"get_solana_blockhash", "Get the latest finalized blockhash"',
     '"get_solana_blockhash", "Get the latest finalized blockhash. Use it when you build a transaction that you will sign and send yourself, because every transaction needs a recent blockhash to be valid. Read-only and free."'),
    ('"get_token_accounts", "Get all SPL token balances and mints owned by a wallet"',
     '"get_token_accounts", "List every SPL token account a wallet owns, with the account address, token mint, balance and decimals. Use it to see what tokens a wallet holds before swapping or sending. Read-only and free."'),
    ('"get_recent_transactions", "Get recent transaction signatures for a wallet address"',
     '"get_recent_transactions", "List the most recent transaction signatures for a wallet, newest first, with slot, time and error status. Use it to find a transaction to inspect with decode_tx. Read-only and free."'),
    ('"simulate_solana_transaction", "Simulate a Solana transaction without broadcasting it"',
     '"simulate_solana_transaction", "Dry-run a transaction against live chain state without broadcasting it, and return success or failure, program logs and compute units used. Use it to check a transaction before sending; for a SAFE or UNSAFE verdict with fix hints use validate_transaction instead. Nothing is sent to the network. Costs 1 credit (0.0022 SOL) per call; requires the x-api-key header."'),
]
for old, new in DESCRIPTIONS:
    src = once(src, old, new)

# 4. per-tool edits: shared network/wallet params, limit text, read-only hint
names = ["get_solana_balance", "get_solana_blockhash", "get_token_accounts",
         "get_recent_transactions", "simulate_solana_transaction"]
end_marker = "    return mcpServer;"
if src.count(end_marker) != 1:
    sys.exit(f"ANCHOR PROBLEM: expected 1 'return mcpServer;', found {src.count(end_marker)}\nNothing was written.")

for i, name in enumerate(names):
    start = src.index(f'mcpServer.tool("{name}"')
    if i + 1 < len(names):
        end = src.index(f'mcpServer.tool("{names[i + 1]}"')
    else:
        end = src.index(end_marker)
    block = src[start:end]

    block = once(block, ENUM, "NETWORK")
    if '"wallet"' in block or "wallet:" in block:
        if 'wallet: z.string().describe("Solana wallet public key")' in block:
            block = once(block, 'wallet: z.string().describe("Solana wallet public key")', "wallet: WALLET")
        else:
            block = once(block, "wallet: z.string(),", "wallet: WALLET,")
    if "limit: z.number()" in block:
        block = once(
            block,
            "limit: z.number().optional().default(10),",
            'limit: z.number().int().min(1).max(1000).optional().default(10).describe("How many recent signatures to return, newest first. Default 10, maximum 1000."),',
        )
    if "transaction: z.string()" in block:
        block = once(
            block,
            'transaction: z.string().describe("Base64-encoded serialized transaction")',
            'transaction: z.string().describe("Base64-encoded serialized VersionedTransaction (not a legacy Transaction), unsigned or signed.")',
        )
    block = once(block, "\n  }, async (", "\n  }, READ_ONLY, async (")
    src = src[:start] + block + src[end:]

# 5. new tools, placed just before the end of createMcpServer
src = once(src, end_marker, NEW_TOOLS + end_marker)

# 6. discovery manifest lists the validation tool too
decode_line = '{ "name": "decode_tx", "description": "Translate raw transaction logs into human-readable summaries." }'
src = once(
    src,
    decode_line,
    decode_line + ',\n        { "name": "validate_transaction", "description": "Check a transaction before sending it: SAFE or UNSAFE verdict with fix hints for each issue." }',
)

# all anchors matched: back up, then write
bk = os.path.expanduser("~/bk")
os.makedirs(bk, exist_ok=True)
backup = os.path.join(bk, f"{os.path.basename(path)}.{int(time.time())}")
shutil.copy(path, backup)
open(path, "w", encoding="utf-8").write(src)
print(f"Patched {path}. Backup: {backup}")
