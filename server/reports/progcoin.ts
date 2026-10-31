// Prog Coin, a Telegram "play & earn" game (@progcoinbot). Checked 2026-10-22 from a phone capture, the game's public
// JavaScript, RDAP, crt.sh and public chain data. Raw evidence: phone Download/SolanaPulse/investigations/progcoin-*.txt.
// Left out on purpose: the two Telegram bot tokens the game ships in its own script.
import type { Report } from "./types";

export const progcoin: Report = {
  name: "progcoin",
  kind: "scam",
  published: { at: "2026-10-31", told: "A warning for players. Not yet reported to Telegram or the domain registrar" },
  project: "Prog Coin (Telegram @progcoinbot)",
  site: "t.me/progcoinbot",
  summary: "A Telegram \"play & earn\" game whose balance is a number kept on your own phone. It sells boosts for Telegram Stars or crypto paid into fixed wallets shared by every player. Three of those wallets held about $11,400 on 2026-10-22. No token, team or company stands behind it.",
  status: "Withdrawals untested: nothing was paid in.",
  findings: [
    {
      title: "The in-game balance isn't money",
      severity: "trap",
      what: "The GEMS balance lives only in the phone's browser storage (`localStorage`), and the code sets it directly, for example `setBalance(10*balance)`. The \"$999\" shown is a number the app writes, not money held anywhere.",
      where: ["torncrypto.com main.js"],
      fix: "Treat any balance in an earn game as a picture, not money, until it has actually reached your own wallet.",
    },
    {
      title: "Boosts are paid into fixed wallets shared by every player",
      severity: "trap",
      what: "Crypto payments (\"CRYPTO_DIRECT\") go to the same address for every player on 12+ chains, with minimum deposits. Nothing in the code shows a payout address or any way to send money back out to a player. Not proven: that withdrawals are refused, since none was tried.",
      where: ["Solana Euxd1pSXmJHEsdVXwk2H8gaEKbbNyBmgB1Gt2NdqHsA9", "Tron TQVcax5B3fHtyVKafq9K6VZkWZSKd14SfY", "TON UQDl4k0rqIwvYxhP_fIx5y0SOZmdCLINVE1yQ2oTkillf7hC", "EVM 0x5b51500f0617ca816Bc66F311937798DA5E2fFCD", "Bitcoin bc1qhnh67rhe5vcc28q3sxkrjzwcapj8qlms078cve"],
      fix: "Don't buy boosts, don't deposit, don't connect a wallet, and don't recruit friends.",
    },
    {
      title: "No token, team or company",
      severity: "warning sign",
      what: "The bot says \"Play & Earn\", \"$PROG soon\" and claims 24,615 monthly users. The channel @progcoinofficial has 98.3K subscribers and two posts (\"Channel created\"; \"The official AirDrop of the game is soon\"). There is no website, team, whitepaper or token, and we found no outside reporting about it.",
      where: ["@progcoinbot", "@progcoinofficial"],
    },
    {
      title: "It blocks inspection and records sessions; one owner for both domains",
      severity: "info",
      what: "The game loads `disable-devtool` (blocks inspecting the page) and LogRocket (records sessions). It runs from progcoin.crypto-apps.center and torncrypto.com, both registered at GoDaddy with the same Cloudflare nameserver pair, so very likely one owner. crypto-apps.center's home page is an empty \"Launching Soon\" template.",
      where: ["torncrypto.com (2024-08-16)", "crypto-apps.center (2024-12-25)"],
    },
  ],
  facts: [
    { label: "Solana deposit wallet", value: "9.70 SOL + 207.30 USDT + 76.33 USDC held; 783 transactions from 2026-05-25 to 2026-10-22", source: "Solana mainnet", checkedAt: "2026-10-22" },
    { label: "Tron deposit wallet", value: "5,270 TRX + 3,271.83 USDT held; created 2026-05-26", source: "Tron mainnet", checkedAt: "2026-10-22" },
    { label: "TON deposit wallet", value: "3,902.64 TON held; has never sent anything out", source: "TON mainnet (tonapi.io)", checkedAt: "2026-10-22" },
    { label: "Held in those three", value: "About $11,400 (balances, not totals received); the other nine addresses were not checked", source: "CoinGecko prices of 2026-10-22: SOL $103.45, TRX $0.328, TON $1.31", checkedAt: "2026-10-22" },
  ],
  proof: [],
  watched: [
    { label: "Prog Coin deposit wallet (Solana), the same for every player", address: "Euxd1pSXmJHEsdVXwk2H8gaEKbbNyBmgB1Gt2NdqHsA9", kind: "wallet", source: "torncrypto.com main.js" },
  ],
};
