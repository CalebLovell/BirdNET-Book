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
				baselineLabel: "last week",
				detectionsDelta: 1812,
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
		/Up 42% from last week: 1,812 more detections, 3 fewer species\./,
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

test("an unchanged window reads as level", () => {
	const markup = renderToStaticMarkup(
		<HighlightsCard
			emptyMessage=""
			highlights={[
				{
					kind: "activity",
					direction: "level",
					percent: 0,
					baselineLabel: "yesterday",
					detectionsDelta: -1,
					speciesDelta: 0,
				},
			]}
		/>,
	);
	assert.match(
		markup.replace(/<[^>]+>/g, ""),
		/The same as yesterday: 1 fewer detection, the same number of species\./,
	);
});

test("the Regular line says what every day covers", async () => {
	const markup = await renderCard({
		emptyMessage: "",
		highlights: [
			{
				kind: "consistent",
				total: 1,
				birds: [{ comName: "Northern Cardinal", note: "4 weeks in a row" }],
				scope: "every day",
			},
		],
	});
	assert.match(
		markup.replace(/<[^>]+>/g, ""),
		/1 species heard every day: Northern Cardinal \(4 weeks in a row\)\./,
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
					{
						comName: "Rose-breasted Grosbeak",
						note: "41 this week, usually 12",
					},
					{ comName: "Swainson's Thrush", note: "30 this week, usually 9" },
				],
				comparedWith: "the past 3 weeks",
			},
		],
	});
	assert.match(
		markup.replace(/<[^>]+>/g, ""),
		/2 species heard far more than in the past 3 weeks: Rose-breasted Grosbeak \(41 this week, usually 12\) and Swainson(&#x27;|')s Thrush \(30 this week, usually 9\)\./,
	);
});
