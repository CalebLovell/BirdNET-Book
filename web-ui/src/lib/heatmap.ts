// Four steps of moss over paper, from a pale wash up to full moss at a row's
// busiest hour -- the same ink the species grid's bars use, so the heat map and
// the bars read as one scale.
export const HEAT_COLORS = [
	"var(--paper)",
	"color-mix(in oklab, var(--moss) 20%, var(--paper-raised))",
	"color-mix(in oklab, var(--moss) 40%, var(--paper-raised))",
	"color-mix(in oklab, var(--moss) 70%, var(--paper-raised))",
	"var(--moss)",
] as const;

export function heatLevel(count: number, maximum: number): number {
	if (count === 0 || maximum === 0) return 0;
	return Math.min(4, Math.max(1, Math.ceil((count / maximum) * 4)));
}
