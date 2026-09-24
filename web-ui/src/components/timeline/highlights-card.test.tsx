import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { DetectionsByHourRoseCard } from "~/components/detections-by-hour-rose-card.tsx";
import { HighlightsCard } from "~/components/timeline/highlights-card.tsx";

test("a quiet window gets an empty Highlights card, not a missing one", () => {
	const markup = renderToStaticMarkup(
		<HighlightsCard
			rows={[]}
			period="day"
			previousTotals={{ detections: 120, species: 30 }}
			emptyMessage="No detections recorded for Thu, Sep 24, 2026."
		/>,
	);
	assert.match(markup, /Highlights/);
	assert.match(markup, /No detections recorded for Thu, Sep 24, 2026\./);
	// No notes drawn from zero detections: no "NaN%", no comparison.
	assert.doesNotMatch(markup, /NaN|after dark|Down/);
});

test("an all-zero day gets the rose card's own empty note", () => {
	const activity = Array.from({ length: 24 }, (_, hour) => ({
		hour,
		count: 0,
	}));
	const markup = renderToStaticMarkup(
		<DetectionsByHourRoseCard
			activity={activity}
			title="Detections by hour"
			emptyMessage="No detections recorded for Thu, Sep 24, 2026."
		/>,
	);
	assert.match(markup, /Detections by hour/);
	assert.match(markup, /No detections recorded for Thu, Sep 24, 2026\./);
	assert.doesNotMatch(markup, /<svg/);
});
