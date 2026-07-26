import "server-only";

/**
 * Flare likelihood for today.
 *
 * The number is derived from the person's OWN history, not a population
 * model: how often a sharp pressure fall has actually been followed by a
 * worse report for them, scaled by how hard the pressure is falling today
 * and nudged by how the last few days have gone.
 *
 * `basis` and `sampleSize` travel with the number on purpose. A percentage
 * with no denominator is the part that misleads — "68%" off two data points
 * reads identically to "68%" off two hundred, so the caller always has the
 * denominator available to show.
 */

export type FlareRisk = {
  /** 0-100. */
  percent: number;
  band: "low" | "moderate" | "elevated" | "high";
  /** How many prior pressure falls the personal rate is computed from. */
  sampleSize: number;
  /** Plain-English account of what produced the number. */
  basis: string;
  /** True when there was not enough personal history and a default was used. */
  usedDefault: boolean;
};

/**
 * Fallback hit rate before someone has enough personal history. Set at the
 * midpoint deliberately: with no evidence either way, the honest prior is
 * "could go either way", not a number that implies knowledge.
 */
const DEFAULT_RATE = 0.5;
const MIN_SAMPLE = 2;

export function computeFlareRisk(input: {
  /** 24h barometric change in hPa; negative is falling. */
  pressureDelta24h: number | null;
  /** Prior sharp falls seen for this person. */
  pressureDrops: number;
  /** How many of those were followed by a worse report. */
  worseAfterDrop: number;
  /** Pain levels reported in the last few days, most recent last. */
  recentPain: number[];
}): FlareRisk {
  const { pressureDelta24h, pressureDrops, worseAfterDrop, recentPain } = input;

  const hasHistory = pressureDrops >= MIN_SAMPLE;
  const personalRate = hasHistory ? worseAfterDrop / pressureDrops : DEFAULT_RATE;

  // Nothing to go on at all.
  if (pressureDelta24h === null) {
    return {
      percent: Math.round(personalRate * 40),
      band: "low",
      sampleSize: pressureDrops,
      basis: "No pressure reading for today, so this reflects your usual pattern only.",
      usedDefault: !hasHistory,
    };
  }

  // How hard is it falling? -3 hPa is the floor of "worth mentioning",
  // -12 and beyond is as strong as this scale goes.
  const fall = Math.max(0, -pressureDelta24h);
  const severity = fall <= 3 ? fall / 12 : Math.min(1, 0.25 + ((fall - 3) / 9) * 0.75);

  // Recent days already sore raise the floor — a body mid-flare is likelier
  // to stay there than one that has been quiet all week.
  const recentHigh = recentPain.filter((p) => p >= 4).length;
  const recentLift = Math.min(0.2, recentHigh * 0.07);

  const raw = personalRate * severity + recentLift;
  const percent = Math.round(Math.max(0.02, Math.min(0.95, raw)) * 100);

  const band: FlareRisk["band"] =
    percent >= 65 ? "high" : percent >= 45 ? "elevated" : percent >= 25 ? "moderate" : "low";

  const pieces: string[] = [];
  if (fall > 0) {
    pieces.push(`pressure is down ${fall.toFixed(1)} hPa over 24 hours`);
  } else {
    pieces.push("pressure is steady or rising");
  }
  pieces.push(
    hasHistory
      ? `${worseAfterDrop} of your last ${pressureDrops} sharp falls were followed by a worse day`
      : "not enough of your own history yet, so a neutral starting point is used",
  );
  if (recentHigh > 0) {
    pieces.push(`${recentHigh} rough ${recentHigh === 1 ? "day" : "days"} recently`);
  }

  return {
    percent,
    band,
    sampleSize: pressureDrops,
    basis: pieces.join("; ") + ".",
    usedDefault: !hasHistory,
  };
}
