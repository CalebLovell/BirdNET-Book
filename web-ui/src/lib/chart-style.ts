/**
 * How long a series takes to redraw, shared by every recharts chart. Well under
 * recharts' 1500ms default: stepping a year selector is a repeated action, and
 * at the default the chart was still settling when you pressed again.
 */
export const CHART_ANIMATION_MS = 500;

/**
 * The plot runs to the card's padding on every side. Recharts' default 5px
 * margin sat inside that padding, so each chart looked inset from its card.
 * The top keeps just enough room for half of the top y-axis label, which is
 * centred on the top gridline and would otherwise be clipped.
 */
export const CHART_MARGIN = { top: 8, right: 0, bottom: 0, left: 0 };

/** Tall enough for one line of 12px tick labels. Recharts reserves 30px, which
 * left an empty strip under the labels. */
export const X_AXIS_HEIGHT = 22;
