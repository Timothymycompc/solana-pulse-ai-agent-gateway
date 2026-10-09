import { Connection, PublicKey, VersionedTransaction } from '@solana/web3.js';
import { z } from 'zod';

type McpToolHost = { tool: (...args: any[]) => unknown };
type ToolDeps = {
  getConnection: (network: string) => Connection;
  onRpcCall?: () => void;
};

const NETWORK = z.enum(['mainnet-beta', 'devnet']).optional().default('mainnet-beta')
  .describe('Solana cluster to query. Use mainnet-beta for real assets or devnet for test data; defaults to mainnet-beta.');
const WALLET = z.string().min(32).max(44).describe('Wallet or program address in Base58 format (32–44 characters).');
const MINT = z.string().min(32).max(44).describe('SPL token mint address in Base58 format, not a ticker symbol.');
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const textResult = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] });
const errorResult = (error: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }) }],
  isError: true,
});
const tokenPrograms = [
  new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
  new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'),
];

function percentOfSupply(amount: string, supply: string): number | null {
  try {
    const total = BigInt(supply);
    if (total <= 0n) return null;
    return Number((BigInt(amount) * 1_000_000n) / total) / 10_000;
  } catch { return null; }
}

async function readMint(connection: Connection, mint: string) {
  const key = new PublicKey(mint);
  const [account, largest] = await Promise.all([
    connection.getParsedAccountInfo(key),
    connection.getTokenLargestAccounts(key),
  ]);
  const data: any = account.value?.data;
  if (!data?.parsed || data.parsed.type !== 'mint') throw new Error('Address is not an SPL token mint on this network.');
  const info = data.parsed.info;
  const supply = String(info.supply);
  const topAccounts = largest.value.slice(0, 10).map((item) => ({
    tokenAccount: item.address.toBase58(),
    amountRaw: item.amount,
    amount: item.uiAmountString,
    shareOfSupplyPct: percentOfSupply(item.amount, supply),
  }));
  return {
    mint: key.toBase58(),
    decimals: Number(info.decimals),
    supplyRaw: supply,
    mintAuthority: info.mintAuthority ?? null,
    freezeAuthority: info.freezeAuthority ?? null,
    topTokenAccounts: topAccounts,
    top10TokenAccountSharePct: Number(topAccounts.reduce((sum, item) => sum + (item.shareOfSupplyPct || 0), 0).toFixed(4)),
  };
}

function topPair(pairs: any[]) {
  return [...pairs].sort((a, b) => Number(b.liquidity?.usd || 0) - Number(a.liquidity?.usd || 0))[0];
}

function priceForMint(pair: any, mint: string): number | null {
  if (!pair?.priceUsd || !pair.baseToken || !pair.quoteToken) return null;
  const basePrice = Number(pair.priceUsd);
  if (!Number.isFinite(basePrice)) return null;
  if (pair.baseToken.address === mint) return basePrice;
  if (pair.quoteToken.address === mint) {
    const basePerQuote = Number(pair.priceNative);
    return basePerQuote > 0 ? basePrice / basePerQuote : null;
  }
  return null;
}

export function registerIntelligenceTools(server: McpToolHost, deps: ToolDeps) {
  const { getConnection } = deps;
  const countRpc = () => deps.onRpcCall?.();

  server.tool('get_wallet_snapshot',
    'Build a compact wallet snapshot from SOL balance, SPL and Token-2022 holdings, and recent activity. Returns one current snapshot, not an investment recommendation. Cost: 1 credit (0.0022 SOL). Example: {"wallet":"Brpc8HoPo1d3Uiyo7kbERnjMqwLJJmbWxtwxHxzar6DU","network":"mainnet-beta"}',
    { wallet: WALLET, network: NETWORK }, READ_ONLY,
    async ({ wallet, network }: { wallet: string; network: string }) => {
      countRpc();
      try {
        const owner = new PublicKey(wallet);
        const connection = getConnection(network);
        const [lamports, classic, token2022, activity] = await Promise.all([
          connection.getBalance(owner),
          connection.getParsedTokenAccountsByOwner(owner, { programId: tokenPrograms[0] }),
          connection.getParsedTokenAccountsByOwner(owner, { programId: tokenPrograms[1] }).catch(() => ({ value: [] as any[] })),
          connection.getSignaturesForAddress(owner, { limit: 5 }),
        ]);
        const tokens = [...classic.value, ...token2022.value].map((item: any) => {
          const parsed = item.account.data.parsed.info;
          return {
            tokenAccount: item.pubkey.toBase58(),
            mint: parsed.mint,
            amount: parsed.tokenAmount.uiAmountString,
            decimals: parsed.tokenAmount.decimals,
          };
        });
        const latest = activity[0];
        return textResult({
          wallet: owner.toBase58(), network,
          summary: `${lamports / 1e9} SOL and ${tokens.length} token accounts; ${activity.length} recent signature(s) checked.`,
          sol: { lamports, balance: lamports / 1e9 },
          tokenAccountCount: tokens.length,
          tokens,
          recentActivity: {
            checked: activity.length,
            latestSignature: latest?.signature ?? null,
            latestBlockTime: latest?.blockTime ?? null,
            latestSucceeded: latest ? latest.err === null : null,
          },
          observedAt: new Date().toISOString(),
          caveat: 'A snapshot of current RPC data. Token accounts are not deduplicated into unique token issuers or wallet owners.',
        });
      } catch (error) { return errorResult(error); }
    });

  server.tool('summarize_wallet_activity',
    'Summarize a wallet’s recent confirmed signature activity with success and failure counts and the newest signature. This does not decode transaction instructions. Cost: 1 credit (0.0022 SOL) after the 27-call trial. Example: {"wallet":"Brpc8HoPo1d3Uiyo7kbERnjMqwLJJmbWxtwxHxzar6DU","limit":20}',
    { wallet: WALLET, limit: z.number().int().min(1).max(100).optional().default(20).describe('Number of newest signatures to examine, from 1 to 100 (default 20).'), network: NETWORK }, READ_ONLY,
    async ({ wallet, limit, network }: { wallet: string; limit: number; network: string }) => {
      countRpc();
      try {
        const address = new PublicKey(wallet);
        const signatures = await getConnection(network).getSignaturesForAddress(address, { limit });
        const successful = signatures.filter((item) => item.err === null).length;
        const latest = signatures[0];
        return textResult({
          wallet: address.toBase58(), network, examined: signatures.length,
          successful, failed: signatures.length - successful,
          latest: latest ? { signature: latest.signature, slot: latest.slot, blockTime: latest.blockTime, succeeded: latest.err === null } : null,
          signatures: signatures.slice(0, 10).map((item) => ({ signature: item.signature, slot: item.slot, blockTime: item.blockTime, succeeded: item.err === null })),
          note: `Counts cover only the newest ${signatures.length} signatures returned, not the wallet's full history.`,
        });
      } catch (error) { return errorResult(error); }
    });

  server.tool('resolve_token_symbol',
    'Find Solana token pairs matching a ticker or name and return candidates ranked by reported liquidity. Use the mint address from a result to disambiguate duplicate tickers. Results come from DexScreener and can be incomplete. Cost: 1 credit (0.0022 SOL) after the 27-call trial. Example: {"query":"BONK"}',
    { query: z.string().min(1).max(80).describe('Token ticker, project name, or mint text to search for (for example, BONK).') }, READ_ONLY,
    async ({ query }: { query: string }) => {
      try {
        const response = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(query)}`, { signal: AbortSignal.timeout(7000) });
        if (!response.ok) throw new Error(`Token search provider returned HTTP ${response.status}.`);
        const body: any = await response.json();
        const pairs = (body.pairs || []).filter((pair: any) => pair.chainId === 'solana' && pair.baseToken?.address);
        const unique = new Map<string, any>();
        for (const pair of pairs) {
          const key = pair.baseToken.address;
          const current = unique.get(key);
          const liquidity = Number(pair.liquidity?.usd || 0);
          if (!current || liquidity > current.liquidityUsd) unique.set(key, {
            mint: key, symbol: pair.baseToken.symbol, name: pair.baseToken.name,
            priceUsd: pair.priceUsd ? Number(pair.priceUsd) : null,
            liquidityUsd: liquidity,
            volume24hUsd: Number(pair.volume?.h24 || 0),
            dex: pair.dexId, pairAddress: pair.pairAddress, pairUrl: pair.url,
          });
        }
        const candidates = [...unique.values()].sort((a, b) => b.liquidityUsd - a.liquidityUsd).slice(0, 5);
        return textResult({ query, candidates, observedAt: new Date().toISOString(), source: 'DexScreener', note: 'Ticker matches are ambiguous. Verify the mint before using a candidate.' });
      } catch (error) { return errorResult(error); }
    });

  server.tool('get_token_market_snapshot',
    'Return a live DEX market snapshot for a Solana mint: the most liquid pair, price, liquidity, 24-hour volume, and pair link. Market data is third-party and can be delayed; it is not a price guarantee. Cost: 1 credit (0.0022 SOL). Example: {"mint":"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"}',
    { mint: MINT }, READ_ONLY,
    async ({ mint }: { mint: string }) => {
      try {
        const key = new PublicKey(mint).toBase58();
        const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(7000) });
        if (!response.ok) throw new Error(`Market data provider returned HTTP ${response.status}.`);
        const body: any = await response.json();
        const pairs = (body.pairs || []).filter((pair: any) => pair.chainId === 'solana');
        const pair = topPair(pairs);
        if (!pair) return textResult({ mint: key, found: false, source: 'DexScreener', observedAt: new Date().toISOString() });
        return textResult({
          mint: key, found: true,
          token: pair.baseToken?.address === key ? pair.baseToken : pair.quoteToken,
          pair: { dex: pair.dexId, address: pair.pairAddress, url: pair.url },
          priceUsd: priceForMint(pair, key),
          liquidityUsd: Number(pair.liquidity?.usd || 0),
          volume24hUsd: Number(pair.volume?.h24 || 0),
          priceChangePct24h: pair.priceChange?.h24 == null ? null : Number(pair.priceChange.h24),
          observedAt: new Date().toISOString(), source: 'DexScreener',
          note: 'The most liquid matching pair was selected; this is market data, not an endorsement or execution quote.',
        });
      } catch (error) { return errorResult(error); }
    });

  server.tool('analyze_token_concentration',
    'Measure the combined supply share held by the ten largest SPL token accounts and report mint authorities. Accounts are not necessarily unique people or wallets. Cost: 1 credit (0.0022 SOL). Example: {"mint":"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"}',
    { mint: MINT, network: NETWORK }, READ_ONLY,
    async ({ mint, network }: { mint: string; network: string }) => {
      countRpc();
      try {
        const analysis = await readMint(getConnection(network), mint);
        return textResult({ ...analysis, network, observedAt: new Date().toISOString(), interpretation: 'Top-account concentration is a screening signal only. Custodial, exchange, pool, or program accounts can dominate these figures.' });
      } catch (error) { return errorResult(error); }
    });

  server.tool('compare_tokens',
    'Compare two SPL mints using decimals, supply, mint and freeze authorities, and top-ten token-account concentration. It reports chain facts side by side and does not rank tokens as investments. Cost: 1 credit (0.0022 SOL). Example: {"mintA":"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v","mintB":"So11111111111111111111111111111111111111112"}',
    { mintA: MINT.describe('First SPL token mint address in Base58 format.'), mintB: MINT.describe('Second SPL token mint address in Base58 format.'), network: NETWORK }, READ_ONLY,
    async ({ mintA, mintB, network }: { mintA: string; mintB: string; network: string }) => {
      countRpc();
      try {
        const connection = getConnection(network);
        const [a, b] = await Promise.all([readMint(connection, mintA), readMint(connection, mintB)]);
        return textResult({ network, comparedAt: new Date().toISOString(), tokens: [a, b], note: 'Supply share uses token accounts, not deduplicated beneficial owners. Different decimals and token mechanics can make raw supply values incomparable.' });
      } catch (error) { return errorResult(error); }
    });

  server.tool('inspect_address',
    'Classify an on-chain address using account owner, executable flag, parsed token data, and lamport balance. It distinguishes common system wallets, programs, mints, and token accounts when RPC data allows. Cost: 1 credit (0.0022 SOL) after the 27-call trial. Example: {"address":"11111111111111111111111111111111"}',
    { address: z.string().min(32).max(44).describe('Any Solana address in Base58 format: wallet, program, mint, or token account.'), network: NETWORK }, READ_ONLY,
    async ({ address, network }: { address: string; network: string }) => {
      countRpc();
      try {
        const key = new PublicKey(address);
        const connection = getConnection(network);
        const account = await connection.getAccountInfo(key);
        if (!account) return textResult({ address: key.toBase58(), network, exists: false, classification: 'not_found' });
        const owner = account.owner.toBase58();
        const parsed: any = await connection.getParsedAccountInfo(key).then((result) => result.value?.data).catch(() => null);
        let classification = account.executable ? 'program' : 'program_owned_account';
        if (!account.executable && owner === '11111111111111111111111111111111' && account.data.length === 0) classification = 'system_owned_wallet_or_account';
        if (parsed?.parsed?.type === 'mint') classification = 'token_mint';
        if (parsed?.parsed?.type === 'account') classification = 'token_account';
        const parsedInfo = parsed?.parsed?.info;
        return textResult({
          address: key.toBase58(), network, exists: true, classification,
          ownerProgram: owner, executable: account.executable,
          lamports: account.lamports, dataBytes: account.data.length,
          token: parsedInfo ? {
            mint: parsedInfo.mint,
            tokenOwner: parsedInfo.owner,
            amount: parsedInfo.tokenAmount?.uiAmountString,
            decimals: parsedInfo.tokenAmount?.decimals,
            mintAuthority: parsedInfo.mintAuthority,
            freezeAuthority: parsedInfo.freezeAuthority,
          } : null,
          observedAt: new Date().toISOString(),
          note: 'Classification is based on current account data and may be inconclusive for custom program accounts.',
        });
      } catch (error) { return errorResult(error); }
    });

  server.tool('explain_transaction_effects',
    'Explain the observed effects of a confirmed transaction: status, fee, SOL balance changes, token balance changes, and named programs touched. This saves callers from joining pre/post balance arrays themselves. It does not claim to decode every instruction. Cost: 1 credit (0.0022 SOL). Example: {"signature":"<confirmed transaction signature>"}',
    { signature: z.string().min(80).max(90).describe('Base58 signature of a confirmed Solana transaction, usually 88 characters.'), network: NETWORK }, READ_ONLY,
    async ({ signature, network }: { signature: string; network: string }) => {
      countRpc();
      try {
        const tx = await getConnection(network).getTransaction(signature, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' });
        if (!tx) throw new Error('Transaction was not found or is not confirmed.');
        const message: any = tx.transaction.message;
        const staticKeys = message.staticAccountKeys.map((key: PublicKey) => key.toBase58());
        const loaded = tx.meta?.loadedAddresses;
        const keys = [...staticKeys, ...(loaded?.writable || []).map((key) => key.toBase58()), ...(loaded?.readonly || []).map((key) => key.toBase58())];
        const programNames: Record<string, string> = {
          '11111111111111111111111111111111': 'System Program',
          TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA: 'SPL Token Program',
          TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb: 'Token-2022 Program',
          ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsximo9g: 'Associated Token Program',
          ComputeBudget111111111111111111111111111111: 'Compute Budget Program',
          MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr: 'Memo Program',
        };
        const programs = [...new Set(message.compiledInstructions.map((instruction: any) => keys[instruction.programIdIndex]).filter(Boolean))]
          .map((programId) => ({ programId: String(programId), name: programNames[String(programId)] || 'Unknown or custom program' }));
        const solChanges = (tx.meta?.preBalances || []).map((before, index) => {
          const after = tx.meta?.postBalances?.[index] ?? before;
          const deltaLamports = after - before;
          return { address: keys[index] || `unresolved-index-${index}`, deltaLamports, deltaSol: deltaLamports / 1e9 };
        }).filter((change) => change.deltaLamports !== 0);
        const preTokens = tx.meta?.preTokenBalances || [];
        const postTokens = tx.meta?.postTokenBalances || [];
        const tokenKeys = new Set([...preTokens, ...postTokens].map((token: any) => `${token.accountIndex}:${token.mint}:${token.owner || ''}`));
        const tokenChanges = [...tokenKeys].map((key) => {
          const [accountIndex, mint, owner] = key.split(':');
          const before = preTokens.find((token: any) => `${token.accountIndex}:${token.mint}:${token.owner || ''}` === key);
          const after = postTokens.find((token: any) => `${token.accountIndex}:${token.mint}:${token.owner || ''}` === key);
          const decimals = Number(after?.uiTokenAmount?.decimals ?? before?.uiTokenAmount?.decimals ?? 0);
          const rawDelta = BigInt(after?.uiTokenAmount?.amount || '0') - BigInt(before?.uiTokenAmount?.amount || '0');
          return {
            tokenAccount: keys[Number(accountIndex)] || null,
            owner: owner || after?.owner || before?.owner || null,
            mint,
            decimals,
            deltaRaw: rawDelta.toString(),
            delta: Number(rawDelta) / Math.pow(10, decimals),
          };
        }).filter((change) => change.deltaRaw !== '0');
        return textResult({
          signature, network, slot: tx.slot, succeeded: tx.meta?.err === null,
          feeLamports: tx.meta?.fee ?? null,
          summary: `${solChanges.length} SOL balance change(s), ${tokenChanges.length} token balance change(s), ${programs.length} program(s) touched.`,
          solChanges, tokenChanges, programs,
          note: 'Effects are derived from RPC pre/post balances. Program labels cover common Solana programs; custom instructions are not fully decoded.',
        });
      } catch (error) { return errorResult(error); }
    });

  server.tool('analyze_wallet_portfolio',
    'Estimate a wallet’s current SOL and token value in USD by joining on-chain balances with DEX prices for up to ten token mints. Returns priced and unpriced holdings separately and marks the total as partial when prices are missing. Prices are volatile estimates, not an execution quote. Cost: 1 credit (0.0022 SOL). Example: {"wallet":"Brpc8HoPo1d3Uiyo7kbERnjMqwLJJmbWxtwxHxzar6DU","network":"mainnet-beta"}',
    { wallet: WALLET, network: NETWORK }, READ_ONLY,
    async ({ wallet, network }: { wallet: string; network: string }) => {
      countRpc();
      try {
        const owner = new PublicKey(wallet);
        const connection = getConnection(network);
        const [lamports, classic, token2022] = await Promise.all([
          connection.getBalance(owner),
          connection.getParsedTokenAccountsByOwner(owner, { programId: tokenPrograms[0] }),
          connection.getParsedTokenAccountsByOwner(owner, { programId: tokenPrograms[1] }).catch(() => ({ value: [] as any[] })),
        ]);
        const byMint = new Map<string, { amount: number; decimals: number; tokenAccounts: number }>();
        for (const item of [...classic.value, ...token2022.value] as any[]) {
          const info = item.account.data.parsed.info;
          const mint = info.mint;
          const entry = byMint.get(mint) || { amount: 0, decimals: Number(info.tokenAmount.decimals), tokenAccounts: 0 };
          entry.amount += Number(info.tokenAmount.uiAmountString || 0);
          entry.tokenAccounts++;
          byMint.set(mint, entry);
        }
        const holdings = [...byMint.entries()].filter(([, value]) => value.amount > 0).slice(0, 10);
        const priced = await Promise.all(holdings.map(async ([mint, value]) => {
          try {
            const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(mint)}`, { signal: AbortSignal.timeout(7000) });
            if (!response.ok) return { mint, ...value, priceUsd: null, estimatedValueUsd: null };
            const body: any = await response.json();
            const pair = topPair((body.pairs || []).filter((candidate: any) => candidate.chainId === 'solana'));
            const priceUsd = priceForMint(pair, mint);
            return { mint, ...value, priceUsd, estimatedValueUsd: priceUsd == null ? null : Number((priceUsd * value.amount).toFixed(2)) };
          } catch { return { mint, ...value, priceUsd: null, estimatedValueUsd: null }; }
        }));
        const sol = lamports / 1e9;
        let solPriceUsd: number | null = null;
        try {
          const response = await fetch('https://api.dexscreener.com/latest/dex/tokens/So11111111111111111111111111111111111111112', { signal: AbortSignal.timeout(7000) });
          if (response.ok) {
            const body: any = await response.json();
            const pair = topPair((body.pairs || []).filter((candidate: any) => candidate.chainId === 'solana'));
            solPriceUsd = pair?.priceUsd ? Number(pair.priceUsd) : null;
          }
        } catch { /* Return the chain balance even if market data is unavailable. */ }
        const solValueUsd = solPriceUsd == null ? null : Number((sol * solPriceUsd).toFixed(2));
        const tokenValueUsd = priced.reduce((sum, item) => sum + (item.estimatedValueUsd || 0), 0);
        const missingPrices = priced.filter((item) => item.estimatedValueUsd == null).length + (solValueUsd == null ? 1 : 0);
        return textResult({
          wallet: owner.toBase58(), network, sol: { balance: sol, priceUsd: solPriceUsd, estimatedValueUsd: solValueUsd },
          tokens: priced, tokenMintCount: byMint.size, tokenMintsPriced: priced.length - priced.filter((item) => item.estimatedValueUsd == null).length,
          estimatedPricedValueUsd: Number(((solValueUsd || 0) + tokenValueUsd).toFixed(2)),
          partial: missingPrices > 0 || byMint.size > priced.length,
          unpricedCount: missingPrices + Math.max(0, byMint.size - priced.length),
          observedAt: new Date().toISOString(), marketSource: 'DexScreener',
          note: 'Estimate uses reported DEX prices and the first ten token mints returned. Illiquid, unlisted, or missing-price assets are excluded; this is not an execution value.',
        });
      } catch (error) { return errorResult(error); }
    });

  server.tool('estimate_transaction_cost',
    'Estimate a transaction’s base and priority fee from its signer count and Compute Budget instructions, then simulate it to report consumed compute units and execution errors. It never broadcasts or signs. Priority cost is only calculable when both a compute-unit limit and price are present. Cost: 1 credit (0.0022 SOL). Example: {"transaction":"<base64 serialized VersionedTransaction>","network":"devnet"}',
    { transaction: z.string().min(1).describe('Base64-encoded serialized VersionedTransaction. Legacy transaction serialization is not accepted.'), network: NETWORK }, READ_ONLY,
    async ({ transaction, network }: { transaction: string; network: string }) => {
      countRpc();
      try {
        const tx = VersionedTransaction.deserialize(Buffer.from(transaction, 'base64'));
        const message: any = tx.message;
        const keys = message.staticAccountKeys.map((key: PublicKey) => key.toBase58());
        const computeBudgetId = 'ComputeBudget111111111111111111111111111111';
        let computeUnitLimit: number | null = null;
        let microLamportsPerComputeUnit: string | null = null;
        for (const instruction of message.compiledInstructions) {
          if (keys[instruction.programIdIndex] !== computeBudgetId) continue;
          const data: Uint8Array = instruction.data;
          if (data[0] === 2 && data.length >= 5) {
            computeUnitLimit = data[1] + data[2] * 256 + data[3] * 65536 + data[4] * 16777216;
          } else if (data[0] === 3 && data.length >= 9) {
            let price = 0n;
            for (let index = 8; index >= 1; index--) price = (price << 8n) + BigInt(data[index]);
            microLamportsPerComputeUnit = price.toString();
          }
        }
        const baseFeeLamports = Number(message.header.numRequiredSignatures || 1) * 5000;
        const priorityFeeLamports = computeUnitLimit != null && microLamportsPerComputeUnit != null
          ? Number((BigInt(computeUnitLimit) * BigInt(microLamportsPerComputeUnit) + 999_999n) / 1_000_000n)
          : null;
        const simulation = await getConnection(network).simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true });
        return textResult({
          network, baseFeeLamports,
          computeUnitLimit, microLamportsPerComputeUnit,
          priorityFeeLamports,
          estimatedTotalFeeLamports: priorityFeeLamports == null ? null : baseFeeLamports + priorityFeeLamports,
          unitsConsumed: simulation.value.unitsConsumed ?? null,
          simulationSucceeded: simulation.value.err === null,
          simulationError: simulation.value.err,
          logs: simulation.value.logs,
          caveat: priorityFeeLamports == null ? 'Add both a compute-unit limit and compute-unit price to estimate the priority fee. The base fee is an estimate; actual fees depend on the final signed transaction.' : 'Fee estimate is based on the declared compute-unit limit and price; actual fees depend on the final signed transaction.',
        });
      } catch (error) { return errorResult(error); }
    });
}
