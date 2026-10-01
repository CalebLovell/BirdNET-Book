// Heat shading as a continuous ramp rather than a handful of steps: every
// count gets its own mix of moss over paper, from a pale wash at the smallest
// count up to full moss at the busiest. Shared by the timeline heat map, the
// species grid's bars, the hour rose and the species page's history, so they
// all read as one scale.

/** How much moss the smallest non-zero count gets, in percent. Well above the
    4% an empty heat-map cell wears, so a quiet hour never passes for an empty
    one. */
const RAMP_FLOOR = 12;

/** Past this much moss the ground is dark enough that only paper reads on it. */
const INK_FLIP = 55;

/**
 * Where `count` sits between the smallest count (0) and `maximum` (1), on a
 * log scale. The counts are heavy-tailed -- an all-time heat map runs from 1
 * to 1,000+ -- and a linear share squeezes everything under a tenth of the
 * busiest cell into the palest few shades. Logarithms space 1, 10, 100 and
 * 1,000 evenly instead, so 5 and 50 look different, while a bigger count is
 * still always darker. (Shading by rank was tried too, and read worse.)
 *
 * `maximum` is the busiest cell across the whole chart, never a row's own
 * peak: one shared scale, so a bird heard twice looks quieter than one heard
 * two hundred times. Scaling each row to itself made every species look about
 * as busy as every other.
 */
export function heatShare(count: number, maximum: number): number {
	if (count <= 0 || maximum <= 0) return 0;
	if (maximum <= 1) return 1;
	return Math.min(1, Math.log(count) / Math.log(maximum));
}

/** The ramp's colour `share` of the way from its floor to full moss. */
export function heatColorAt(share: number): string {
	if (share >= 1) return "var(--moss)";
	const moss = RAMP_FLOOR + (100 - RAMP_FLOOR) * Math.max(0, share);
	return `color-mix(in oklab, var(--moss) ${moss.toFixed(1)}%, var(--paper-raised))`;
}

/** The fill for `count` on a chart whose busiest cell is `maximum`. A zero is
    bare paper; callers that want a visible empty cell draw their own. */
export function heatColor(count: number, maximum: number): string {
	if (count <= 0 || maximum <= 0) return "var(--paper)";
	return heatColorAt(heatShare(count, maximum));
}

/** Ink for a number drawn on `heatColor(count, maximum)`. */
export function heatInk(count: number, maximum: number): string {
	if (count <= 0) return "var(--muted-foreground)";
	const moss = RAMP_FLOOR + (100 - RAMP_FLOOR) * heatShare(count, maximum);
	return moss >= INK_FLIP ? "var(--paper)" : "var(--foreground)";
}

/** The busiest single hour across every row -- the shared scale's top. */
export function heatMaximum(rows: { hourCounts: number[] }[]): number {
	return rows.reduce((top, row) => Math.max(top, ...row.hourCounts), 0);
}
