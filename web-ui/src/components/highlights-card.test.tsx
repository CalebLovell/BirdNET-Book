import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { DetectionsByHourRoseCard } from "~/components/detections-by-hour-rose-card.tsx";
import { HighlightsCard } from "~/components/highlights-card.tsx";

test("a quiet window gets an empty Highlights card, not a missing one", () => {
	const markup = renderToStaticMarkup(
		<HighlightsCard
			highlights={[]}
			emptyMessage="No detections recorded for Thu, Sep 24, 2026."
		/>,
	);
	assert.match(markup, /Highlights/);
	assert.match(markup, /No detections recorded for Thu, Sep 24, 2026\./);
	assert.doesNotMatch(markup, /NaN|Busiest|Down/);
});

test("each highlight reads as one sentence", () => {
	const markup = renderToStaticMarkup(
		<HighlightsCard
			emptyMessage=""
			highlights={[
				{
					kind: "activity",
					direction: "up",
					percent: 42,
					baselineLabel: "the four weeks before",
					detections: 1812,
					perDay: false,
					speciesDelta: -3,
				},
				{ kind: "busiest-hour", hour: 6 },
				{
					kind: "returned",
					total: 2,
					birds: [
						{ comName: "Wood Thrush", note: "23 days" },
						{ comName: "Veery", note: "16 days" },
					],
				},
				{
					kind: "routine",
					total: 7,
					birds: [{ comName: "Carolina Wren", note: "silent 3 days" }],
				},
			]}
		/>,
	);
	const text = markup.replace(/<[^>]+>/g, "");
	assert.match(
		text,
		/Up 42% on the four weeks before: 1,812 detections, 3 fewer species\./,
	);
	assert.match(text, /Busiest at 6 AM\./);
	assert.match(
		text,
		/2 back after time away: Wood Thrush \(23 days\) and Veery \(16 days\)\./,
	);
	assert.match(
		text,
		/7 regulars gone quiet: Carolina Wren \(silent 3 days\) and 6 more\./,
	);
});

test("a window still running gives its pace so far", () => {
	const markup = renderToStaticMarkup(
		<HighlightsCard
			emptyMessage=""
			highlights={[
				{
					kind: "activity",
					direction: "down",
					percent: 35,
					baselineLabel: "the four weeks before",
					detections: 58,
					perDay: true,
					speciesDelta: null,
				},
			]}
		/>,
	);
	assert.match(
		markup.replace(/<[^>]+>/g, ""),
		/Down 35% on the four weeks before, at 58 detections a day so far\./,
	);
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

test("the Vocal line says the birds were heard more often than usual", () => {
	const markup = renderToStaticMarkup(
		<HighlightsCard
			emptyMessage=""
			highlights={[
				{
					kind: "vocal",
					total: 2,
					birds: [
						{ comName: "Rose-breasted Grosbeak", note: "3.4×" },
						{ comName: "Swainson's Thrush", note: "2.8×" },
					],
				},
			]}
		/>,
	);
	assert.match(
		markup.replace(/<[^>]+>/g, ""),
		/2 heard more often than usual: Rose-breasted Grosbeak \(3\.4×\) and Swainson(&#x27;|')s Thrush \(2\.8×\)\./,
	);
});
