// Boomwins (BOOMWIN / TOGOO / LOOSESLOT). Checked 2026-10-22 from a phone capture and what the sites serve every visitor.
// Raw evidence: phone Download/SolanaPulse/investigations/boomwins-investigation-2026-10-22.txt.
// Left out on purpose: the invite code the app was installed with (it belongs to whoever shared the link).
import type { Report } from "./types";

export const boomwins: Report = {
  name: "boomwins",
  kind: "scam",
  published: { at: "2026-10-31", told: "A warning for players. Not yet reported to its registrars or hosts" },
  project: "Boomwins (BOOMWIN, TOGOO, LOOSESLOT)",
  site: "boomwins.cc",
  summary: "A casino web app on a Chinese-built platform that runs several casino brands from one server. Its landing page hides from visitors the platform chooses to block, and its slot games come from domains made to look like real game studios.",
  status: "Whether it pays out is unknown: no money was deposited.",
  findings: [
    {
      title: "Slot games come from lookalike game-studio domains",
      severity: "warning sign",
      what: "In a capture of the web app on a phone (2026-10-22), all 3 MB of game data came from pp.pragmaticsplaygames.com. Pragmatic Play's real domain is pragmaticplay.net. Another server, api-usa.pgf-games.com, looks like PG Soft. Both domains were registered at Gname on the same day (2025-10-08) and changed on the same day (2026-08-22). Games served from lookalike domains are run by the operator, not the studio.",
      where: ["pp.pragmaticsplaygames.com", "api-usa.pgf-games.com"],
      fix: "Don't deposit. A casino that serves \"Pragmatic Play\" games from a domain Pragmatic Play doesn't own controls the results itself.",
    },
    {
      title: "The landing page hides itself from reviewers",
      severity: "warning sign",
      what: "Before showing anything, the landing page's `site-center-gate.js` hides the page and asks the central server about the visitor's ad channel. If the answer is code 40003, it sends the visitor to a different page (`/lp/atlas/`). The start page (`check.html`) also detects Chrome's desktop device emulation, the tool ad reviewers and researchers use to look at mobile pages. This is how ads get past ad review.",
      where: ["site-center-gate.js", "check.html"],
    },
    {
      title: "One open server runs several casino brands",
      severity: "info",
      what: "`game.bigfoxes.com/slot-center/api/site/center` answers any visitor with the whole setup for an ad channel: game server, accounts, an operator console, payments and live code updates. The app shells for BOOMWIN, TOGOO and LOOSESLOT all get their settings from `game.togoo777.com`, which builds an app for any brand name it is given. boomwins.cc, looseslot.cc and togoo777.com share a registrar (NameSilo) and nameservers (DNSOwl).",
      where: ["game.bigfoxes.com", "game.togoo777.com", "boomwins.cc", "looseslot.cc", "togoo777.com", "togoo.cc"],
    },
    {
      title: "Ads, tracking and a push into Chrome",
      severity: "info",
      what: "The landing page loads a Meta (Facebook) pixel and a Bigo Ads pixel whose IDs come from each ad link, and the game uses FingerprintJS (device fingerprinting). A hidden pop-up (in Chinese) says the site asks to open Chrome \"for a better experience\": a way to move people out of Facebook's or TikTok's in-app browser into Chrome, where the web app can be installed. Pages are marked `zh-Hans` with Chinese code comments.",
      where: ["the landing page", "the game page"],
    },
  ],
  facts: [
    { label: "boomwins.cc registered", value: "2026-06-01 at NameSilo (DNSOwl nameservers)", source: "RDAP (rdap.org)", checkedAt: "2026-10-22" },
    { label: "togoo777.com registered", value: "2025-09-10 at NameSilo; certificates since 2025-09-11", source: "RDAP; crt.sh", checkedAt: "2026-10-22" },
    { label: "bigfoxes.com (the central server) registered", value: "2026-08-14 at Cloudflare Registrar", source: "RDAP", checkedAt: "2026-10-22" },
    { label: "Withdrawals", value: "Unknown: not tested, nothing was deposited", source: "Not tested", checkedAt: "2026-10-22" },
  ],
  proof: [],
  watched: [],
};
