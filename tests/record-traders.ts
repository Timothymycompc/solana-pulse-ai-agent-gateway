// Records a real token_traders run (a coin the trading desk saw on 2026-11-02) so tests/traders.test.ts replays it offline.
// Run: SOLANA_MAINNET_RPC_URL=... npx tsx tests/record-traders.ts [mint] [pool] [hours] [max_trades]
// Read-only: nothing is signed or sent.
import { clusterApiUrl } from "@solana/web3.js";
import { tokenTraders } from "../server/tools/traders";
import { recordingContext, saveFixture } from "./helpers/replay";

const RPC = process.env.SOLANA_MAINNET_RPC_URL || clusterApiUrl("mainnet-beta");
const [mint = "GAv6gs9AtQtf1xcHtq3V6HQ3daj42H4iDyzC4STWYMdw", pool = "2WcyV5ipNb2B35U3n1FtTCu3ttSm25TXkgojkcgr3Bkf", hours = "0.5", max = "15"] = process.argv.slice(2);

const args = { token: mint, pool, hours: Number(hours), max_trades: Number(max), how_many: 25, network: "mainnet-beta" };
const { ctx, recording } = recordingContext(RPC);
const answer = await tokenTraders.run(args, ctx);
saveFixture({ name: "traders-hamster", recordedAt: new Date().toISOString(), args, recording });
console.log(JSON.stringify({ ...answer, wallets: (answer.wallets as unknown[]).slice(0, 5) }, null, 1));
