// Lucky Vaults (luckyvaults.vip), a "fish games" credit reseller. Checked 2026-10-25 from a player's phone capture and
// read-only requests. Raw evidence: phone Download/SolanaPulse/investigations/luckyvaults-2026-10-25.txt.
// Left out on purpose: the player's own payment details, the personal Chime tag, and a business we could not tie to it.
import type { Report } from "./types";

export const luckyvaults: Report = {
  name: "luckyvaults",
  kind: "scam",
  published: { at: "2026-10-31", told: "A record of what we measured, not a verdict. Not yet reported to its host" },
  project: "Lucky Vaults (luckyvaults.vip)",
  site: "luckyvaults.vip",
  summary: "A reseller of credits for \"fish game\" apps (Orion Stars, Fire Kirin, Juwa, Vblink). Deposits are checked by hand from screenshots and cashouts are paid by hand. A player was told the cashout server was down; our capture from that moment shows the server answering.",
  status: "Unknown whether it pays out. Not a verdict: these are the facts we measured.",
  findings: [
    {
      title: "\"Server is down\" while the server was answering",
      severity: "warning sign",
      what: "A player asking for a cashout on 2026-10-25 was told the server was down. A capture from the player's phone at that moment (10:49:50-10:50:10 UTC) shows 2 encrypted connections to luckyvaults.vip that both completed, with data flowing both ways for about 20 seconds, 0 resets and 0 TLS errors. At 11:06 UTC the cashout address `/lv/api/cashout` answered at once.\n\nThe capture can't show what the server said (it's encrypted), so it doesn't prove the cashout itself worked, only that it wasn't a network outage. Stalling cashouts (\"server down\", \"system update\", \"pay a fee to unlock\") is the common complaint about fish-game resellers.",
      where: ["luckyvaults.vip (199.188.201.173)", "/lv/api/cashout"],
      fix: "Keep screenshots of every deposit and cashout request, and never pay a fee to unlock a cashout.",
    },
    {
      title: "Deposits by screenshot, charged under other names",
      severity: "warning sign",
      what: "\"Send the exact amount and upload the payment screenshot. Coins are loaded after our team checks the payment.\" Cash App, Apple Pay and Google Pay go to a checkout at novapay.luckyvaults.vip (\"CyberNet - Pay\"); Chime goes to a personal Chime tag. A $4.99 deposit on 2026-10-24 was charged under a merchant name unrelated to Lucky Vaults, NovaPay or CyberNet, so a bank statement doesn't show where the money went.",
      where: ["the site's built-in settings (window.LV)", "novapay.luckyvaults.vip"],
    },
    {
      title: "No terms, no company, one payout shown",
      severity: "warning sign",
      what: "`/terms` is a 404; there is no company name, address or email anywhere, and privacy questions go to the chat. The site's own \"recently paid\" list shows one payout ($20 on 2026-10-24) and no total.",
      where: ["luckyvaults.vip/terms", "the site's built-in settings (window.LV)"],
    },
    {
      title: "The same operator runs a second storefront",
      severity: "info",
      what: "playdesk.luckyvaults.vip (\"PlayDesk\") is a second fish-games storefront that uses the same Google sign-in app as Lucky Vaults (client 648503318097-ckids6o4…), so one operator runs both.",
      where: ["playdesk.luckyvaults.vip"],
    },
  ],
  facts: [
    { label: "luckyvaults.vip registered", value: "2026-05-07 at Namecheap; shared hosting", source: "RDAP (rdap.org)", checkedAt: "2026-10-25" },
    { label: "Cashout rules", value: "$20 to $500, one request at a time, \"Paid within 1-2 hours\" claimed", source: "luckyvaults.vip/how-to/cash-out", checkedAt: "2026-10-25" },
    { label: "Certificates", value: "First issued 2026-05-19 for luckyvaults.vip, novapay., play. and playdesk.", source: "crt.sh", checkedAt: "2026-10-25" },
    { label: "Public reviews or complaints", value: "None found", source: "Web search; urlscan.io", checkedAt: "2026-10-25" },
  ],
  proof: [],
  watched: [],
};
