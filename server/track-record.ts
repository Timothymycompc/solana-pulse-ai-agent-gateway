// The public track record behind /track-record: what token_safety said against what really happened. Two sources,
// both measured, never assumed (PRINCIPLES.md):
//   - The accuracy test (accuracy.ts): young tokens checked once and followed up a week later; known-good tokens.
//   - The token watch (watch.ts): young tokens re-read every few hours for a week.
// Only aggregates and public token addresses leave here: no callers, inputs or keys.
import { accuracyReport, FOLLOW_UP_DAYS, MIN_LIQUIDITY_USD, SAMPLE_COHORT, SAMPLE_GOAL, YOUNG_DAYS } from "./accuracy";
import { NEW_PER_DAY, SNAP_EVERY_HOURS, WATCH_DAYS, watchRecord } from "./watch";

export async function trackRecord() {
  const [accuracy, watch] = await Promise.all([accuracyReport(), watchRecord()]);
  const young = accuracy.cohorts[SAMPLE_COHORT] ?? null;
  // The known-good answer comes from the hand-added cohort with the most known-good tokens (the 500-token rerun).
  const goodCohort = Object.entries(accuracy.cohorts).filter(([name]) => name !== SAMPLE_COHORT)
    .sort(([, a]: any, [, b]: any) => (b["4_knownGood"]?.tokens ?? 0) - (a["4_knownGood"]?.tokens ?? 0))[0];
  return {
    updatedAt: new Date().toISOString(),
    youngTokens: young && {
      about: `${SAMPLE_GOAL} tokens under ${YOUNG_DAYS} days old with at least $${MIN_LIQUIDITY_USD.toLocaleString("en-US")} of liquidity, taken from Jupiter's lists of what people are buying, checked once and looked at again ${FOLLOW_UP_DAYS} days later. "Lost most" means the price or the liquidity fell 90% or more, or RugCheck marks it rugged. Tokens with no answer from any source are left out.`,
      checked: young.checked, verdicts: young.verdicts, followedUp: young.followedUp, outcomeKnown: young.outcomeKnown,
      lostMostByVerdict: young["1_lostMostByVerdict"], ofTokensThatLostMost: young["2_ofTokensThatLostMost"], howTheyLostIt: young.howTheyLostIt,
    },
    knownGood: goodCohort && {
      about: "Established tokens: Jupiter-verified, not a stock, over $1M of liquidity and trading for 90+ days. They should come out SAFE; AVOID here is a false alarm.",
      cohort: goodCohort[0], ...(goodCohort[1] as any)["4_knownGood"],
    },
    watch: {
      about: `Up to ${NEW_PER_DAY} new tokens a day from Jupiter's activity lists, plus young tokens people check with token_safety, re-read every ${SNAP_EVERY_HOURS} hours for ${WATCH_DAYS} days (liquidity, price, holders, top-10 share, mint and freeze authority). "Liquidity pulled" means it fell 90% or more, or Jupiter stopped listing the token. A rate counts only tokens watched for the whole period.`,
      ...watch,
    },
  };
}
