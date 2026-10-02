import assert from "node:assert/strict";
import test from "node:test";
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { DetectionsByHourCard } from "~/components/detections-by-hour-card.tsx";
import { HighlightsCard } from "~/components/highlights-card.tsx";

/** The card names birds as species links, so it renders inside a router. */
async function renderCard(props: ComponentProps<typeof HighlightsCard>) {
	const rootRoute = createRootRoute();
	const indexRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/",
		component: () => <HighlightsCard {...props} />,
	});
	const router = createRouter({
		routeTree: rootRoute.addChildren([indexRoute]),
		history: createMemoryHistory({ initialEntries: ["/"] }),
	});
	await router.load();
	return renderToStaticMarkup(<RouterProvider router={router} />);
}

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

test("each highlight reads as one sentence", async () => {
	const markup = await renderCard({
		emptyMessage: "",
		highlights: [
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
		],
	});
	const text = markup.replace(/<[^>]+>/g, "");
	assert.match(
		text,
		/Up 42% on the four weeks before: 1,812 detections, 3 fewer species\./,
	);
	assert.match(text, /Busiest at 6 AM\./);
	assert.match(
		text,
		/2 species back after time away: Wood Thrush \(23 days\) and Veery \(16 days\)\./,
	);
	assert.match(
		text,
		/7 regulars gone quiet: Carolina Wren \(silent 3 days\) and 6 more\./,
	);
	assert.match(
		markup,
		/<a[^>]*href="\/species\/wood-thrush"[^>]*>Wood Thrush<\/a>/,
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

test("an all-zero day gets the hour card's own empty note", () => {
	const activity = Array.from({ length: 24 }, (_, hour) => ({
		hour,
		count: 0,
	}));
	const markup = renderToStaticMarkup(
		<DetectionsByHourCard
			activity={activity}
			emptyMessage="No detections recorded for Thu, Sep 24, 2026."
		/>,
	);
	assert.match(markup, /Detections by hour/);
	assert.match(markup, /No detections recorded for Thu, Sep 24, 2026\./);
	assert.doesNotMatch(markup, /<svg/);
});

test("the Vocal line says what the birds were heard far more than", async () => {
	const markup = await renderCard({
		emptyMessage: "",
		highlights: [
			{
				kind: "vocal",
				total: 2,
				birds: [
					{ comName: "Rose-breasted Grosbeak", note: "41, usually about 12" },
					{ comName: "Swainson's Thrush", note: "30, usually about 9" },
				],
				comparedWith: "the four weeks before",
			},
		],
	});
	assert.match(
		markup.replace(/<[^>]+>/g, ""),
		/2 species heard far more than the four weeks before: Rose-breasted Grosbeak \(41, usually about 12\) and Swainson(&#x27;|')s Thrush \(30, usually about 9\)\./,
	);
});
