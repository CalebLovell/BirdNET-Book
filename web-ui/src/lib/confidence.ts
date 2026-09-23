import type { CSSProperties } from "react";

export function formatConfidence(confidence: number | null): string {
	return confidence != null ? `${Math.round(confidence * 100)}%` : "—";
}

/**
 * The floor of the "trust it" tier below. Shared with the review queue, so the
 * page holds exactly the detections whose pills do *not* already read as
 * confident -- and so there is one number to move if that judgement changes.
 */
export const CONFIDENT_MIN = 0.9;

/** The floor of the middle tier: below this is "worth listening to yourself". */
const PROBABLE_MIN = 0.75;

// Three tiers rather than a gradient, so a glance down a column of pills sorts
// detections into "trust it", "probably", and "worth listening to yourself".
export function confidenceStyle(confidence: number): CSSProperties {
	if (confidence >= CONFIDENT_MIN) {
		return {
			backgroundColor: "var(--confidence-high)",
			color: "var(--moss)",
		};
	}

	if (confidence >= PROBABLE_MIN) {
		return {
			backgroundColor: "var(--confidence-mid)",
			color: "var(--bark)",
		};
	}

	return {
		backgroundColor: "var(--confidence-low)",
		color: "var(--ink)",
	};
}
