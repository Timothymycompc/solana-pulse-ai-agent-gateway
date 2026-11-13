// Records a real wallet run (the x402 test payer: SOL + USDC) so tests/wallet.test.ts replays it offline, including with
// Jupiter down. Run: SOLANA_MAINNET_RPC_URL=... npx tsx tests/record-wallet.ts [wallet]
// Read-only: nothing is signed or sent.
import { clusterApiUrl } from "@solana/web3.js";
import { walletSnapshot } from "../server/tools/wallet";
import { recordingContext, saveFixture } from "./helpers/replay";

const RPC = process.env.SOLANA_MAINNET_RPC_URL || clusterApiUrl("mainnet-beta");
const [wallet = "2QG95BvyBicw9WCf1eD4caTpN2VTdHbJPnwfmnLfoAtN"] = process.argv.slice(2);

const args = { wallet, network: "mainnet-beta" };
const { ctx, recording } = recordingContext(RPC);
const answer: any = await walletSnapshot.run(args, ctx);
saveFixture({ name: "wallet-usdc", recordedAt: new Date().toISOString(), args, recording });
console.log(JSON.stringify({ ...answer, top_tokens: answer.top_tokens.map((t: any) => [t.symbol, t.verified, t.usd_value]) }, null, 1));
