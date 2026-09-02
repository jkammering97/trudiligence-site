/**
 * Trust-score scale, mirrored exactly from extension/popup.js so the
 * dashboard reads/writes trust_score the same way the popup does — same
 * step values, same bucket thresholds, same priority-search cap. The
 * underlying stored value is always a 0..1 float either way; this only
 * controls which discrete notches the UI lets you pick and how a score is
 * labeled.
 *
 * The scale-mode *preference* (bucket vs. likert5) is extension-local
 * (chrome.storage.sync), so it can't be read from a web page — the
 * dashboard keeps its own copy of the same preference in localStorage
 * instead. Picking a different mode here has no effect on the extension's
 * own preference, or vice versa; it only changes how this page presents
 * the same numbers.
 */

const TRUST_SCALE_STEPS = {
  bucket: [
    { score: 0.2, text: "Low" },
    { score: 0.6, text: "Medium" },
    { score: 1.0, text: "High" }
  ],
  likert5: [0, 0.25, 0.5, 0.75, 1].map((score, i) => ({ score, text: `${i + 1}/5` }))
};
export { TRUST_SCALE_STEPS };

export const TRUST_SCALE_DEFAULT_SCORE = { bucket: 0.6, likert5: 0.5 };

// Priority-search star cap — matches PRIORITY_CAP in extension/popup.js.
export const PRIORITY_CAP = 5;

/** Fixed low/medium/high bucketing by raw score, mirroring
 * backend/stance.py's trust_label() thresholds exactly — used for color
 * (and for the "Trust Level" export column) regardless of which display
 * scale is currently selected. */
export function trustBucket(score) {
  if (score === null || score === undefined) return "unrated";
  if (score >= 0.8) return "high";
  if (score >= 0.4) return "medium";
  return "low";
}

export function nearestTrustStep(mode, score) {
  const steps = TRUST_SCALE_STEPS[mode] || TRUST_SCALE_STEPS.bucket;
  return steps.reduce((best, step) => (Math.abs(step.score - score) < Math.abs(best.score - score) ? step : best));
}

/** Human label for a stored score under the given scale, e.g. "Medium" or "4/5". */
export function trustScoreText(mode, score) {
  if (score === null || score === undefined) return "Unrated";
  return nearestTrustStep(mode, score).text;
}

const SCALE_MODE_KEY = "accordingto.trustScaleMode";

export function getTrustScaleMode() {
  const stored = localStorage.getItem(SCALE_MODE_KEY);
  return TRUST_SCALE_STEPS[stored] ? stored : "bucket";
}

export function setTrustScaleMode(mode) {
  if (TRUST_SCALE_STEPS[mode]) localStorage.setItem(SCALE_MODE_KEY, mode);
}
