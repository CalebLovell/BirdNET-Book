import assert from "node:assert/strict";
import test from "node:test";
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { renderToStaticMarkup } from "react-dom/server";

import type { SpeciesControlPageData } from "~/lib/species-control-data.ts";
import {
	SpeciesControlPage,
	SpeciesSelectionBar,
} from "./species-control-page.tsx";

const data: SpeciesControlPageData = {
	revision: "fixture-revision",
	customMode: false,
	listFiles: { custom: true, excluded: true, whitelisted: true },
	unresolved: {
		custom: [],
		excluded: ["Old species_Old name"],
		whitelisted: [],
	},
	rows: [
		{
			sciName: "Canis latrans",
			comName: "Coyote",
			custom: false,
			excluded: false,
			whitelisted: true,
			history: {
				detections: 4,
				maxConfidence: 0.91,
				lastSeen: "2026-07-30T23:00",
				recordings: 3,
			},
		},
		{
			sciName: "Sciurus carolinensis",
			comName: "Eastern Gray Squirrel",
			custom: false,
			excluded: true,
			whitelisted: false,
			history: {
				detections: 0,
				maxConfidence: null,
				lastSeen: null,
				recordings: 0,
			},
		},
	],
};

async function renderPage() {
	const rootRoute = createRootRoute();
	const indexRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/",
		component: () => (
			<SpeciesControlPage
				initialData={data}
				search={{ page: 1, sort: "species", direction: "asc" }}
				onSearchChange={() => {}}
			/>
		),
	});
	const router = createRouter({
		routeTree: rootRoute.addChildren([indexRoute]),
		history: createMemoryHistory({ initialEntries: ["/"] }),
	});
	await router.load();
	return renderToStaticMarkup(<RouterProvider router={router} />);
}

test("renders the complete species policy workspace", async () => {
	const markup = await renderPage();
	assert.match(markup, />Species Control</);
	assert.doesNotMatch(markup, /Detection mode/);
	assert.match(markup, /aria-label="Search installed species"/);
	for (const heading of ["Species", "Scientific name", "Count", "Status"]) {
		assert.match(markup, new RegExp(`>${heading}<`));
	}
	assert.match(markup, />Import lists</);
	assert.match(markup, />Export lists</);
	assert.match(markup, />Reset lists</);
	assert.match(markup, /Old species_Old name/);
});

test("keeps page tools outside the table and drops the card's own header", async () => {
	const markup = await renderPage();
	const toolbarStart = markup.indexOf('data-layout="species-control-toolbar"');
	const installedStart = markup.indexOf('aria-label="Installed species"');
	assert.ok(toolbarStart >= 0, "expected the exterior Species control toolbar");
	assert.ok(installedStart > toolbarStart, "expected toolbar before the card");

	const toolbar = markup.slice(toolbarStart, installedStart);
	let previousIndex = -1;
	for (const label of [
		'aria-label="Search installed species"',
		">Import lists<",
		">Export lists<",
		">Reset lists<",
	]) {
		const index = toolbar.indexOf(label);
		assert.ok(index > previousIndex, `expected ${label} in toolbar order`);
		previousIndex = index;
	}
	assert.equal(toolbar.match(/data-size="default"/g)?.length, 3);
	assert.equal(toolbar.match(/h-9/g)?.length, 4);

	const installed = markup.slice(installedStart);
	assert.doesNotMatch(installed, /data-layout="installed-species-header"/);
	assert.doesNotMatch(installed, /island-kicker">Installed species</);
	assert.equal(installed.match(/<select/g)?.length, 1);
	assert.match(installed, /<select[^>]*aria-label="Sort species by"/);
	assert.doesNotMatch(installed, />Import lists</);
	assert.doesNotMatch(installed, />Export lists</);
	assert.doesNotMatch(installed, />Reset lists</);
	assert.doesNotMatch(installed, /border-\[var\(--line\)\] border-y py-2/);
});

test("status is the only verdict the table states", async () => {
	const markup = await renderPage();
	assert.match(markup, />Always detect</);
	assert.match(markup, />Never detect</);
	assert.doesNotMatch(markup, />Policy</);
	assert.doesNotMatch(markup, />Effective</);
	// The summary cards are gone; their captions are the cheapest proof.
	for (const caption of [
		"restricted scope",
		"never detect",
		"ignore range",
		"unmatched entries",
		"not saved",
	]) {
		assert.doesNotMatch(markup, new RegExp(caption));
	}
});

test("bulk status waits in the footer until species are picked", async () => {
	const markup = await renderPage();
	assert.doesNotMatch(markup, /aria-label="Set selected species to /);
	// The statuses' explanation comes and goes with the buttons it explains.
	assert.doesNotMatch(markup, /aria-label="About Species statuses"/);
	assert.doesNotMatch(markup, /Select species for bulk changes/);
});

test("the selection bar offers the count, a clear and four statuses", () => {
	const markup = renderToStaticMarkup(
		<SpeciesSelectionBar count={3} onClear={() => {}} onStatus={() => {}} />,
	);
	assert.match(markup, />3<\/span><span[^>]*>selected</);
	assert.match(markup, /aria-label="Clear selection"/);
	let previous = -1;
	for (const status of [
		"Automatic",
		"Custom",
		"Always detect",
		"Never detect",
	]) {
		const index = markup.indexOf(
			`aria-label="Set selected species to ${status}"`,
		);
		assert.ok(index > previous, `expected the ${status} action in order`);
		previous = index;
	}
	assert.doesNotMatch(markup, /disabled=""/);
});

test("detection history is no longer deletable from this page", async () => {
	const markup = await renderPage();
	assert.doesNotMatch(markup, />Delete history</);
	assert.doesNotMatch(markup, />History</);
	assert.doesNotMatch(markup, />Manage</);
});

test("does not render staged save controls", async () => {
	const markup = await renderPage();
	assert.doesNotMatch(markup, />Review and save</);
	assert.doesNotMatch(markup, /pending change/);
	assert.doesNotMatch(markup, /role="alertdialog"/);
});
