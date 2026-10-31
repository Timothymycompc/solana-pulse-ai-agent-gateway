// The "4K.GAME" casino platform (found through luckmax777.com). Checked 2026-10-28 from a phone capture and what the
// sites serve every visitor. Raw evidence: phone Download/SolanaPulse/investigations/4kgame-luckmax777-*.
// Left out on purpose: a card purchase we could not confirm was a deposit here.
import type { Report } from "./types";

const DOMAINS = [
  "01k.cc", "89p.online", "95b.online", "4k.game", "aay.lol", "hzphx.icu", "kzphx.icu", "fasix.click", "xingten.click", "huasix4.click",
  "49q.top", "4xslots.xbten3.click", "c49.top", "q49.top", "22u.vip", "juwa9.com", "4xslots.com", "69f.shop", "777funcy.cc", "777funcy.com",
  "777star.cc", "7kspin.vip", "funcy.cc", "hapyy777.cc", "hapyy777.com", "juwa9.cc", "7zspin.cc", "7zspin.com", "4kslots.vip", "77fire.vip",
  "7joker.vip", "7magic.vip", "7rush.cc", "7samba.vip", "7wild.cc", "7wild.vip", "777slotsmax.com", "fire777.cc", "slots77.win",
  "luckmax777.com", "4kslot.us", "4xslots.io", "buffalo777.us", "d6p.icu", "g2t.icu",
];

export const fourkgame: Report = {
  name: "4kgame",
  kind: "scam",
  published: { at: "2026-10-31", told: "A warning for players. Not yet reported to its registrars or hosts" },
  project: "4K.GAME casino platform (luckmax777.com and 44 more domains)",
  site: "luckmax777.com",
  summary: "One casino codebase serving 34 brands on 45 domains. Its own text tells players to \"Deposit to Unlock Withdrawals\", and its English and Spanish pages disagree on how fast withdrawals are paid.",
  status: "Whether withdrawals ever pay out is untested: no account, no deposit.",
  findings: [
    {
      title: "Withdrawals are unlocked by depositing",
      severity: "trap",
      what: "Quoted from the site's script: \"Deposit to Unlock Withdrawals\" (next to \"Withdrawals processed in 10 seconds.\"), \"Enable withdrawal function\", \"Choose a tier and deposit to unlock withdrawals\", and \"When the remaining wager is 0, the withdrawable amount will equal your cash balance\" (bonus money carries a betting requirement). It also has offers shown to players who lost their balance (\"bankruptcy goods\"), a recharge wheel and invite rewards.",
      where: ["luckmax777.com main script"],
      fix: "Don't deposit to unlock a withdrawal. If a site holds your winnings until you pay more, you won't see the winnings.",
    },
    {
      title: "English and Spanish promises disagree",
      severity: "warning sign",
      what: "In English, withdrawals are \"processed in 10 seconds\" or \"as fast as 30 seconds\". In Spanish: \"¡Completaremos el retiro en 2 horas!\" (we'll complete the withdrawal in 2 hours), plus a daily withdrawal limit (\"Límite de retiro diario\") the English text doesn't mention. The \"audited RNG\" claim names no auditor.",
      where: ["luckmax777.com main script"],
    },
    {
      title: "34 brands on 45 domains, one codebase",
      severity: "info",
      what: "The site's own script has a brand table of 34 \"channels\", each a casino brand with its domains; luckmax777.com shares its setup with 7wild.vip, 7wild.cc and 7samba.vip. The domains were registered in batches (9 on 2026-03-18, 8 on 2026-04-21), 34 of them at Gname. On 2026-10-28, 38 of 45 were up and 33 served the identical page. The game and API server is game.7kspin.vip, and pictures come from an Amazon S3 bucket (phecda-4k). Code comments in Chinese show who built it.",
      where: DOMAINS,
    },
    {
      title: "Tracks deposits, withdrawals and devices",
      severity: "info",
      what: "The script loads Adjust (with deposit and withdraw tracking events), fingerprint.com (device fingerprinting), ipinfo.io and my-ip.io (location checks), Google Tag Manager and Facebook.",
      where: ["luckmax777.com main script"],
    },
  ],
  facts: [
    { label: "luckmax777.com registered", value: "2026-08-29 at NameSilo", source: "RDAP (rdap.org)", checkedAt: "2026-10-28" },
    { label: "Domains up", value: "38 of 45; 33 serve the identical 4K.GAME page", source: "A request to each domain", checkedAt: "2026-10-28" },
    { label: "Withdrawals", value: "Unknown: not tested, nothing was deposited", source: "Not tested", checkedAt: "2026-10-28" },
  ],
  proof: [],
  watched: [],
};
