// Wallet drains, told from the money's side: where it went and what that address is. The people who were drained are
// never named or linked; their own posts asked for help in public, but this page is about the addresses, not them.
// Traced with Pulse (whats_this, history, explain_tx) on 2026-10-26 and again on 2026-10-31; raw answers in
// phone Download/SolanaPulse/tool-runs/2026-10-31/ and the Oct 26 notes in Download/SolanaPulse/investigations/.
import type { Report } from "./types";

export const sweeper7lht: Report = {
  name: "drain-7lht",
  kind: "drain",
  published: { at: "2026-10-31", told: "The drained wallet's owner named this address publicly on 2026-08-26. Every fact below is public chain data" },
  project: "Sweeper wallet 7Lht…XGCX",
  summary: "On 2026-08-24 a wallet's PUMP, RAY and JTO were moved to 7LhtmP8q…XGCX within about 12 seconds, each transfer signed with the drained wallet's own key: an automated sweeper using a stolen key. The tokens were sold since; the wallet held 116.48 SOL on 2026-10-31 and was last active on 2026-10-18.",
  status: "Still active: last transaction 2026-10-18. Holds 116.48 SOL (2026-10-31).",
  findings: [
    {
      title: "Three transfers in 12 seconds, signed with the victim's own key",
      severity: "trap",
      what: "At 10:32:39 UTC 1,446,074.63 PUMP, and at 10:32:51 UTC 5,375.82 RAY, left the drained wallet for this address; the JTO went the same way. Each transfer was signed and paid for by the drained wallet itself, so whoever sent them had its private key. That speed points to an automated sweeper: a bot that empties a wallet the moment it holds something.\n\nA pre-sign check can't stop this: the thief doesn't need the owner to sign anything once the key is leaked.",
      where: ["HX34UqLGoqoZrPXDgzVSTVtd1jmiSp7FrUJY6v2iVt7MvNLMkF8JBe4zc1w5XDATK2eZZyxXrF27huw5Mgb7zt4", "4uX9QZKw33pJLZNQbvWa7wvx7hveXh4JPGSaR5u66J6Jxnr43CLe5QL6X6R3M1tJuor45cczJpkv4axm5JaUKury"],
      fix: "If your wallet was swept, treat its seed phrase as burned: move anything left to a brand-new wallet made from a new seed, and never type the old seed anywhere again.",
    },
    {
      title: "A lookalike of the drained wallet sent it dust in between",
      severity: "warning sign",
      what: "At 10:32:48 UTC, between the two drains, a different wallet whose address starts and ends like the drained one (HkxcH4jW…sEnp, against the real Hkxcf2Jz…sEnp) sent 0.0001 USDT to this address. Lookalike addresses are made to be copied by mistake from a transaction history (address poisoning). Why it was sent here, to the sweeper, is not proven.",
      where: ["ZGnDHY9RtAAYkC184ztaMsatA5qDfvfAgJQPCJxKaM5t86iyx1tcThL9nfS9RJ6xQetintjfAHptAByrVL5BDAP", "HkxcH4jW6LxcSQe183KLuLAoTECSANr3YQLkCZCQsEnp"],
      fix: "Never copy an address from your transaction history. Check every character, or use a saved contact.",
    },
    {
      title: "A live personal wallet, probably holding more than one victim's money",
      severity: "info",
      what: "Pulse's whats_this says it's a normal wallet that can sign (a person or bot holds its key), with 116.48 SOL on 2026-10-31. The stolen tokens are gone, so they were sold. Its history has activity on 2026-10-07 and 2026-10-18; a sweeper usually drains many wallets, so the SOL here is not all from this one drain (not proven).",
      where: ["Solana 7LhtmP8q9WLWoGN2WbLDjqQbFhdDr2hY3a17EnqaXGCX"],
      fix: "Exchanges and wallets can flag it: report the address and the transactions above to the wallet app you use and to any exchange it sends to.",
    },
  ],
  facts: [
    { label: "Balance", value: "116.484147381 SOL; can sign: yes (System Program wallet)", source: "Pulse whats_this", checkedAt: "2026-10-31" },
    { label: "Latest transaction", value: "2026-10-18 17:02:57 UTC (5v6WyPww…)", source: "Pulse history", checkedAt: "2026-10-31" },
    { label: "PUMP moved in", value: "1,446,074.625344 PUMP at 2026-08-24 10:32:39 UTC", source: "Pulse explain_tx HX34UqLG…", checkedAt: "2026-10-31" },
    { label: "RAY moved in", value: "5,375.8201 RAY at 2026-08-24 10:32:51 UTC", source: "Pulse explain_tx 4uX9QZKw…", checkedAt: "2026-10-31" },
  ],
  proof: [],
  watched: [{ label: "Sweeper wallet", address: "7LhtmP8q9WLWoGN2WbLDjqQbFhdDr2hY3a17EnqaXGCX", kind: "wallet", source: "Named by the drained wallet's owner; confirmed by explain_tx on the drain transactions" }],
};

export const bridge6tck: Report = {
  name: "drain-6tck",
  kind: "drain",
  published: { at: "2026-10-31", told: "The drained wallet's owner named this address publicly and asked for it to be flagged. Every fact below is public chain data" },
  project: "6tck…LoDQ: a bridge address, not a thief",
  summary: "After a drain on 2026-10-18, 6tckHFBp…LoDQ was named as the thief's wallet and people were asked to flag it. Pulse shows it can't sign: it's a program-derived address holding thousands of SOL and moving constantly, consistent with NEAR Intents bridge infrastructure. The money was bridged off Solana within seconds, so flagging this address aims at the bridge, not the thief.",
  status: "Bridge infrastructure, very likely NEAR Intents (not 100% proven). The thief is not here.",
  findings: [
    {
      title: "It can't sign: nobody holds a key to it",
      severity: "info",
      what: "whats_this: \"A program-derived address. Money sent here is controlled by a program, not a person.\" It held 13,085.67 SOL on 2026-10-31 (about 28,348 SOL on 2026-10-26) and moves every few seconds. A thief's wallet is a normal wallet that can sign.",
      where: ["Solana 6tckHFBpiJ8YgYN8FUskvtvTpXQZ55g5LHeo1kvELoDQ"],
      fix: "Before asking anyone to flag an address, check it with whats_this. If can_sign is false, it belongs to a program (a bridge, an exchange, a pool), and the report should go to whoever runs that program.",
    },
    {
      title: "The drained SOL passed through in 7 seconds and was bridged off Solana",
      severity: "trap",
      what: "About 2.03 SOL reached the drained wallet and was forwarded here 7 seconds later; the forwarding transaction's fee was paid by a third wallet through an unnamed program, the mark of an automated sweeper or relayer. The wallet that sent the SOL in was labelled \"Near Intents Refill\" in the owner's own screenshot. Together: the funds were bridged out through NEAR Intents, so the thief's wallet is on the other side of the bridge.",
      where: ["Pulse history and explain_tx on the drained wallet (2026-10-26)"],
      fix: "Report the transaction IDs to the bridge team (NEAR Intents) quickly, and treat the drained wallet's seed as burned.",
    },
  ],
  facts: [
    { label: "Balance", value: "13,085.668814586 SOL; can sign: no (program-derived address)", source: "Pulse whats_this", checkedAt: "2026-10-31" },
    { label: "Balance five days earlier", value: "About 28,348 SOL", source: "Pulse whats_this", checkedAt: "2026-10-26" },
  ],
  proof: [],
  watched: [{ label: "Bridge address (program-derived)", address: "6tckHFBpiJ8YgYN8FUskvtvTpXQZ55g5LHeo1kvELoDQ", kind: "wallet", source: "Named in the drained wallet owner's public post; checked with whats_this" }],
};
