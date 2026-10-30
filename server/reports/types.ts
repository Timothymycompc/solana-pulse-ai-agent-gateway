// A private findings report for one trial-key holder. Only a live trial key whose name matches `name` can open it.
// Every number names where it came from and when it was checked; live numbers are re-read from the chain on open.

export type Finding = {
  title: string;
  severity: "breaks money" | "breaks accuracy" | "info";
  what: string; // plain words: what happens and to whom
  where: string[]; // file:line at the commit below
  fix: string;
};

export type Watched = {
  label: string; // their own name for it, e.g. "BUYBACK_TREASURY (project treasury)"
  address: string;
  kind: "wallet" | "token";
  source: string; // where we got the address (their code / README)
};

export type Fact = { label: string; value: string; source: string; checkedAt: string };

export type Report = {
  name: string; // the trial key's name, and the public page's address: /reports/<name>
  // Public (listed, searchable, indexed) only after the project has been told, e.g. its GitHub issue is posted.
  published: false | { at: string; told: string };
  project: string;
  repo: string;
  commit: string;
  summary: string;
  findings: Finding[];
  facts: Fact[]; // numbers measured once, with how and when
  proof: { signature: string; slot: number; withMaxVersion0: string; withMaxVersion1: string; checkedAt: string }[];
  watched: Watched[]; // re-checked live each time the page opens
};
