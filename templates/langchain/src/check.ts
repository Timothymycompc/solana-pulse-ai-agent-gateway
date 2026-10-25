// The safety path for real, without an AI model: builds a real transfer on mainnet and runs both Pulse checks.
// Nothing is signed or sent unless PULSE_SEND=1 and SOLANA_PRIVATE_KEY are set.
// Run: WALLET_ADDRESS=<your wallet> npm run check -- <recipient> <amount in SOL>
import { describe, sendSolChecked } from "./wallet";

const [to, amount = "0.001"] = process.argv.slice(2);
if (!to) throw new Error("Usage: npm run check -- <recipient address> [amount in SOL]");
const result = await sendSolChecked(to, amount);
console.log(describe(result));
process.exitCode = result.allowed ? 0 : 1;
