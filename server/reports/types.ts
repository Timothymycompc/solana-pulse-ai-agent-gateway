// One findings report: a project's code we checked (kind "code"), a casino or earn app we checked for players (kind
// "scam"), a token Pulse checked and what happened to it (kind "token"), or a wallet drain told from the money's side
// (kind "drain").
// A trial-key holder whose key name matches `name` can also open it on /mine.
// Every number names where it came from and when it was checked; live numbers are re-read from the chain on open.

export type Finding = {
  title: string;
  severity: "breaks money" | "breaks accuracy" | "security" | "trap" | "warning sign" | "info";
  what: string; // plain words: what happens and to whom; `code` in backticks, paragraphs split by a blank line
  where: string[]; // file:line at the commit below, or for a site the domain, address or page the evidence came from
  example?: string; // a short reproduction, shown as code
  fix?: string; // what to change (code), or what a player should do (scam)
};

export type Watched = {
  label: string; // their own name for it, e.g. "BUYBACK_TREASURY (project treasury)"
  address: string;
  kind: "wallet" | "token";
  source: string; // where we got the address (their code / README / the site's own script)
};

export type Fact = { label: string; value: string; source: string; checkedAt: string };

export type Proof = { signature: string; slot: number; withMaxVersion0: string; withMaxVersion1: string; checkedAt: string };

export type Report = {
  name: string; // the trial key's name, and the public page's address: /reports/<name>
  kind: "code" | "scam" | "token" | "drain";
  // Public (listed, searchable, indexed) only once `told` is true: for code, the project has been told (its GitHub
  // issue is posted); for a scam check, every fact is from public sources and says what is and isn't proven.
  published: false | { at: string; told: string };
  project: string;
  repo?: string; // code
  commit?: string; // code: the commit the file:line references point at
  site?: string; // scam: the main address, shown as text and never linked
  summary: string;
  issue?: string; // where the project was told
  status?: string; // e.g. "Fixed: ..." or "Open: ..." or "Cashout outcome unknown"
  findings: Finding[];
  facts: Fact[]; // numbers measured once, with how and when
  proof: Proof[];
  watched: Watched[]; // Solana addresses re-checked live each time the page opens
};
