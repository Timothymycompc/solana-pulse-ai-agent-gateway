// tx_matches for a swap: what the sender gives, what comes back and who gets it. A routed swap moves money through
// pools inside other programs, so its steps don't say where the output lands. The dry run does, so every check here
// reads the simulated balances.
import { PublicKey, type Connection } from "@solana/web3.js";
import { feeBreakdown, simulateWithChanges, type LoadedTransaction } from "./decode";
import { explainError } from "./errors";
import { assertAddress, formatUnits, NATIVE_MINT, parseUnits } from "./lib";
import { permissionCheck } from "./permissions";
import { ToolError } from "./types";

export type SwapRequest = { action: "swap"; sell: string; amount: string; buy: string; from?: string };

const mintOf = (token: string, field: string) => (token.trim().toUpperCase() === "SOL" ? NATIVE_MINT : assertAddress(token, field));
const nameOf = (mint: string) => (mint === NATIVE_MINT ? "SOL" : mint);

async function decimalsOf(conn: Connection, mint: string, field: string) {
  if (mint === NATIVE_MINT) return 9;
  const info = await conn.getParsedAccountInfo(new PublicKey(mint), "confirmed");
  const parsed: any = (info.value?.data as any)?.parsed;
  if (parsed?.type !== "mint") throw new ToolError(422, `${mint} is not a token address.`, `${field} must be "SOL" or a token address (find_token).`);
  return Number(parsed.info.decimals);
}

type Simulated = Awaited<ReturnType<typeof simulateWithChanges>>;

// A wallet's net change in one token. For SOL that is the wallet's own SOL plus every SOL its token accounts hold:
// wrapped SOL, and the deposit that opens one. Both stay the wallet's, and closing the account hands them back, which
// is how a swap unwraps SOL.
function netChange(sim: Simulated, wallet: string, mint: string) {
  if (mint !== NATIVE_MINT) return sim.changes.filter((c) => c.wallet === wallet && c.asset === mint).reduce((sum, c) => sum + BigInt(c.changeRaw), 0n);
  const own = sim.changes.filter((c) => c.wallet === wallet && c.asset === "SOL").reduce((sum, c) => sum + BigInt(c.changeRaw), 0n);
  return [...sim.tokenAccounts].filter(([, t]) => t.owner === wallet).reduce((sum, [address]) => sum + (sim.lamportDeltas.get(address) ?? 0n), own);
}

export async function matchSwap(conn: Connection, loaded: LoadedTransaction, expected: SwapRequest, symbols: (mints: string[]) => Promise<Map<string, string>>) {
  const sellMint = mintOf(expected.sell, "expected.sell");
  const buyMint = mintOf(expected.buy, "expected.buy");
  if (sellMint === buyMint) throw new ToolError(422, "expected.sell and expected.buy are the same token.", "A swap trades one token for another.");
  const sender = expected.from ? assertAddress(expected.from, "expected.from") : loaded.feePayer;
  const [sellDecimals, buyDecimals] = [await decimalsOf(conn, sellMint, "expected.sell"), await decimalsOf(conn, buyMint, "expected.buy")];
  const amountBase = parseUnits(expected.amount, sellDecimals);
  const sim = await simulateWithChanges(conn, loaded, symbols);
  const signers = new Set(loaded.signers);

  // The fee is SOL the sender spends without it going into the swap.
  const fee = sender === loaded.feePayer ? BigInt(feeBreakdown(loaded).totalLamports) : 0n;
  const change = (mint: string) => netChange(sim, sender, mint) + (mint === NATIVE_MINT ? fee : 0n);
  const sold = -change(sellMint);
  const received = change(buyMint);
  const othersGetting = [...new Set(sim.changes.map((c) => c.wallet))].filter((w) => w !== sender)
    .map((wallet) => ({ wallet, raw: netChange(sim, wallet, buyMint) })).filter((o) => o.raw > 0n);
  const allWatched = sim.totalWritable <= sim.watchedAccounts;

  // Tips and app fees paid in the token sold, on top of the swap: up to 1% more than the amount is shown as extra_spent,
  // the same line as for fees in the bought token. In the everyday test one swap tipped 0.005% more; a trading bot's
  // 1.54% fee stays a mismatch.
  const extra = sold - amountBase;
  const extraSpent = !sim.error && extra > 0n && extra * 100n <= amountBase
    ? { token: nameOf(sellMint), amount: formatUnits(extra, sellDecimals), raw_amount: extra.toString(), share: `${(Number((extra * 100_000n) / amountBase) / 1000).toFixed(3)}% of the amount sold` }
    : null;
  const compared = [
    { what: "amount", expected: `sells ${expected.amount} ${nameOf(sellMint)} (${amountBase} raw)`, actual: sim.error ? "unknown (the dry run failed)" : `sells ${formatUnits(sold, sellDecimals)} (${sold} raw)${extraSpent ? `: the amount plus ${extraSpent.amount} in tips or fees` : ""}`, ok: !sim.error && (sold === amountBase || extraSpent !== null) },
    {
      what: "to", expected: `${nameOf(buyMint)} arrives in ${sender}`,
      actual: sim.error ? "unknown (the dry run failed)" : received > 0n ? `${formatUnits(received, buyDecimals)} ${nameOf(buyMint)} arrives in ${sender}`
        : othersGetting.length ? `${othersGetting[0].wallet} gets ${formatUnits(othersGetting[0].raw, buyDecimals)} ${nameOf(buyMint)} instead` : `no ${nameOf(buyMint)} arrives anywhere`,
      ok: !sim.error && received > 0n,
    },
    { what: "from", expected: `${sender} signs`, actual: signers.has(sender) ? `${sender} signs` : `${sender} is not a signer`, ok: signers.has(sender) },
    {
      what: "simulation", expected: "succeeds, with every account it writes watched",
      actual: sim.error ? `fails: ${explainError(sim.error).matches[0]?.name ?? JSON.stringify(sim.error)}` : allWatched ? "succeeds" : `succeeds, but only ${sim.watchedAccounts} of ${sim.totalWritable} accounts it writes were watched, so where the rest of the money goes is unknown`,
      ok: !sim.error && allWatched,
    },
  ];

  // Steps a swap never needs: handing control of an account to someone else, or opening an account for another wallet.
  const unexpected: string[] = [];
  const fees: { wallet: string; token: string; amount: string; raw_amount: string; share: string }[] = [];
  for (const ix of loaded.instructions) {
    const permission = permissionCheck(ix, signers);
    if (permission) unexpected.push(permission.detail);
    else if (ix.type.startsWith("create_token_account") && ix.info.owner !== sender) unexpected.push(`Step ${ix.index} opens a ${ix.info.mint} account for ${ix.info.owner}, a wallet that isn't the sender.`);
  }
  if (!sim.error) {
    // The dry run's ground truth: the sender gives up only the sold token, and only the sender receives the bought one.
    for (const c of sim.changes) {
      if (c.wallet !== sender || !c.changeRaw.startsWith("-") || [sellMint, buyMint, NATIVE_MINT, "SOL"].includes(c.asset)) continue;
      unexpected.push(`Dry run: the sender loses ${c.change.slice(1)} ${c.symbol ?? c.asset}, which this swap doesn't sell.`);
    }
    // When SOL is neither side of the swap, the sender may spend only the fee.
    const solLost = -change(NATIVE_MINT);
    if (sellMint !== NATIVE_MINT && buyMint !== NATIVE_MINT && solLost > 0n) {
      unexpected.push(`Dry run: the sender loses ${formatUnits(solLost, 9)} SOL beyond the fee.`);
    }
    // Exchanges and apps take a small cut of the bought token. In the everyday test (200 real transactions, Oct 2026), 9
    // of 24 ordinary swaps paid 0.47-0.77% of the output to fee wallets, the same few again and again. A redirected
    // swap sends away nearly everything (benchmark case 07), so up to 1% of what the sender gets is shown as a fee;
    // more than that is unexpected.
    const toOthers = othersGetting.reduce((sum, o) => sum + o.raw, 0n);
    const small = received > 0n && toOthers * 100n <= received;
    for (const o of othersGetting) {
      const share = received > 0n ? `${(Number((o.raw * 100_000n) / received) / 1000).toFixed(2)}% of what you get` : "and you get none";
      if (small) fees.push({ wallet: o.wallet, token: nameOf(buyMint), amount: formatUnits(o.raw, buyDecimals), raw_amount: o.raw.toString(), share });
      else unexpected.push(`Dry run: ${o.wallet} also gets ${formatUnits(o.raw, buyDecimals)} ${nameOf(buyMint)} from this swap (${share}). More than a normal fee; the request didn't ask for it.`);
    }
  }

  const verdict = compared.every((c) => c.ok) && !unexpected.length ? "MATCH" : "MISMATCH";
  const firstBad = compared.find((c) => !c.ok);
  const summary = verdict === "MATCH"
    ? `The transaction sells exactly ${expected.amount} ${nameOf(sellMint)} from ${sender} and pays ${formatUnits(received, buyDecimals)} ${nameOf(buyMint)} back to ${sender}${fees.length ? `, less ${fees.map((f) => `a fee of ${f.amount} to ${f.wallet} (${f.share})`).join(" and ")}` : ""}, and nothing else. It doesn't judge the price: compare received with your quote.`
    : firstBad ? `Wrong ${firstBad.what}: expected ${firstBad.expected}, transaction ${firstBad.actual}.` : `Unexpected: ${unexpected[0]}`;
  return {
    verdict, summary,
    expected: { action: "swap", sell_token: sellMint, raw_amount: amountBase.toString(), decimals: sellDecimals, buy_token: buyMint, from: sender },
    compared,
    received: sim.error ? null : { token: nameOf(buyMint), amount: formatUnits(received, buyDecimals), raw_amount: received.toString(), decimals: buyDecimals },
    unexpected, fees, extra_spent: extraSpent,
  };
}
