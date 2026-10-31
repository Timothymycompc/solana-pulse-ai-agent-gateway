// luckquexa.com and its 44 sister casinos. Checked 2026-10-21, re-checked 2026-10-23.
// Raw evidence: phone Download/SolanaPulse/investigations/luckquexa-investigation-2026-10-21.txt (+ reviews JSON).
// Left out on purpose: the test account's deposit addresses, and a Tron wallet we could not tie to the site.
import type { Report } from "./types";

const SISTERS = [
  "eagleplay.casino", "eagleplay.win", "eaglestrike.bet", "crimsonvaultcasino.com", "goldentidecasino.com", "noirwheel.com", "reelquake.com",
  "spinmelo.com", "spinolix.com", "betglimera.com", "betnesta.com", "casizonix.com", "reelquaka.com", "spinolya.com", "spinolyx.com",
  "betglimmex.com", "betnestix.com", "casizonex.com", "jacknestix.com", "luckquexa.com", "reelflara.com", "reelquakka.com", "spinolyra.com",
  "spinorixa.com", "spinquexa.com", "betglora.com", "betnestya.com", "betolyra.com", "betquexa.com", "betzenx.com", "jackglimm.com",
  "jackolyra.com", "jackquexa.com", "jackspina.com", "luckblaza.com", "luckflara.com", "lucknestix.com", "reelcozyx.com", "reelnestix.com",
  "reelquexa.com", "reelzyx.com", "spinhavex.com", "spinmira.com", "spinorayx.com", "spinquelx.com",
];

export const luckquexa: Report = {
  name: "luckquexa",
  kind: "scam",
  published: { at: "2026-10-31", told: "Reported on 2026-10-21 to Dynadot, Cloudflare, NiceNIC, Spaceship, IQWeb, StormWall, Heleket, Google Safe Browsing, the FBI's IC3 and the FTC" },
  project: "luckquexa.com and 44 sister casinos",
  site: "luckquexa.com",
  summary: "A template crypto casino, one of 45 near-identical sites listed in its own code. The code holds a scripted chain of payments demanded before any withdrawal, fake reviews that coach players to pay that \"deposit\", a copied license claim, and links to lookalikes of a real payment company's site.",
  status: "All 45 sites were still up on 2026-10-23, two days after the reports. No takedown seen.",
  findings: [
    {
      title: "Withdrawals are blocked behind a scripted chain of payments",
      severity: "trap",
      what: "The site's own `/api/error-steps` answer is a numbered list of \"steps\", each with an amount to pay, shown when a player tries to withdraw. The FAQ explains them in advance as \"KYC, security confirmation, AML compliance review, tax compliance checks, and payment processor clearance\". A `promoRequired` amount is kept next to the balance, and the withdraw page asks for a \"Required deposit amount\".\n\nOn withdrawal it also asks for a card number and cardholder name, after collecting government ID, proof of address and a selfie.",
      where: ["luckquexa.com/api/error-steps", "the site's FAQ", "the withdraw page's script"],
      fix: "Don't pay anything to unlock a withdrawal. A real casino pays out from your balance; it never asks for a new payment first.",
    },
    {
      title: "Fake reviews coach players to pay the withdrawal \"deposit\"",
      severity: "trap",
      what: "`/api/reviews` returns 38 \"customer reviews\". 30 still contain the unfilled placeholder `{brand}`. Every timestamp ends in the same seconds and milliseconds (:41.075), so the dates are made up when the page loads, and reviews say \"Player since 2024\" on a site registered 2026-09-13.\n\nFour exist to make the pay-to-withdraw step look normal, for example: \"Yes, you do have to make a deposit to unlock your withdrawal, but don't let that scare you off...\". The same 38 reviews, same names, appear on betquexa.com, goldentidecasino.com, crimsonvaultcasino.com and eagleplay.casino. The site's \"reviews\" link goes to trustpillot.io (two L's), a Trustpilot lookalike.",
      where: ["luckquexa.com/api/reviews", "trustpillot.io"],
    },
    {
      title: "A \"wallet bonus\" sends wallets holding $200 or more to a lookalike payment page",
      severity: "trap",
      what: "\"Connect your crypto wallet, we'll calculate a personal bonus for your activity on other casinos.\" If the wallet holds less: \"You need at least $200 USDT on your wallet to qualify for the bonus.\" The Claim Bonus button opens heleket-payment.cfd, and the deposit page's \"Pay with Heleket\" button opens heleket-payment.club. Both were registered in 2026 and sit behind a bot-blocking page. The real Heleket is heleket.com, on different servers.\n\nWe did not go past the block, so what these pages do to a connected wallet is not proven.",
      where: ["heleket-payment.cfd (NiceNIC, 2026-09-09)", "heleket-payment.club (Dynadot, 2026-06-09)"],
      fix: "Never connect a wallet to claim a casino bonus.",
    },
    {
      title: "The slot games come from throwaway domains, not game studios",
      severity: "warning sign",
      what: "In a network capture of the site on a phone (2026-10-21, no login, no deposit), 28 of 30 MB came from pp.gmmm.click, registered 2026-10-01. The other game servers were play.global2api.org, pp.zcpvnfkadooapd.co.in and play.gmbl.org.uk, on DDoS-protection hosts in Dubai and Slovakia. Games served from the operator's own domains are run by the operator, not by a known studio.",
      where: ["pp.gmmm.click", "play.global2api.org", "pp.zcpvnfkadooapd.co.in", "play.gmbl.org.uk"],
    },
    {
      title: "A copied license claim and an unfinished template",
      severity: "warning sign",
      what: "It claims New Era B.V., Curaçao company 157707, license OGL/2024/181/01. The same company and number appear on eaglequest.vip, which LCB.org rated unsafe with no valid license, and the \"license\" link goes only to the general Curaçao register page, which doesn't mention New Era, 157707 or luckquexa.\n\nThe brand shows as \"Casino Casino\", the contact emails are placeholders (support@casino.com), the Telegram link is just t.me, and the About page is the same `{brand}` template on every site: no team, no address, no company.",
      where: ["luckquexa.com footer and About page", "cga.cw register page", "LCB.org review of eaglequest.vip"],
    },
    {
      title: "One operator runs all 45 sites, and the app follows it to new domains",
      severity: "info",
      what: "luckquexa's own `/api/domains/siblings` lists 45 sister casinos, all at Dynadot behind Cloudflare, registered in batches from 2026-05-25 to 2026-09-30. Their public `/api/site-config` files are identical apart from the name and domain, down to the same Facebook and TikTok ad pixel IDs, so the same ad accounts run all of them. The installed app keeps this list, so players follow it when a domain is shut down.",
      where: SISTERS,
    },
    {
      title: "It finds players through Facebook and TikTok ads",
      severity: "info",
      what: "`/api/site-config` lists 5 Facebook pixel IDs and 4 TikTok pixel IDs (the same on all 45 sites), and the code also loads Reddit, Pinterest, X and Google ad trackers. These IDs are what Meta and TikTok need to find the ad accounts.",
      where: ["Facebook 947543307877053", "Facebook 3495227700659111", "Facebook 1486415666644303", "Facebook 2378337426033000", "Facebook 1148417647539184", "TikTok DB6COQBC77UDJT302D70", "TikTok DB806L3C77UD150JCCPG", "TikTok DBAVLMRC77U1UMSUN870", "TikTok DBBLSHJC77U4SEFNDIVG"],
    },
  ],
  facts: [
    { label: "luckquexa.com registered", value: "2026-09-13 at Dynadot, behind Cloudflare", source: "RDAP (rdap.org)", checkedAt: "2026-10-21" },
    { label: "Minimum deposit and withdrawal", value: "$45 deposit; $20 crypto / $50 card withdrawal", source: "luckquexa.com/api/site-config", checkedAt: "2026-10-21" },
    { label: "Where deposits go", value: "Unknown. Deposit addresses are made fresh per player and per coin after login, and none of the 45 sites has a wallet address in its public code, so the total taken can't be counted yet", source: "/api/deposit/generate-address; public code of all 45 sites", checkedAt: "2026-10-21" },
    { label: "Sister sites still up", value: "45 of 45 answered /api/site-config, all with the same 5 Facebook pixel IDs", source: "Each site's /api/site-config", checkedAt: "2026-10-23" },
  ],
  proof: [],
  watched: [],
};
