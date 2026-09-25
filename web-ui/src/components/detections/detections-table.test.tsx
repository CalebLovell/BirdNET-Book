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
import { DetectionsTable } from "~/components/detections/detections-table.tsx";

const detection = {
	rowId: 17,
	Date: "2026-08-06",
	Time: "07:14:00",
	Sci_Name: "Cardinalis cardinalis",
	Com_Name: "Northern Cardinal",
	Confidence: 0.94,
	Lat: null,
	Lon: null,
	Cutoff: null,
	Week: null,
	Sens: null,
	Overlap: null,
	File_Name: "Northern_Cardinal-94.wav",
};

async function renderTableWithDetection(canDelete = true) {
	const rootRoute = createRootRoute();
	const indexRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/",
		component: () => (
			<DetectionsTable
				page={{ rows: [detection], total: 1 }}
				search={{
					page: 1,
					pageSize: 50,
					sort: "recorded",
					direction: "desc",
				}}
				rowSelection={{}}
				onSearchChange={() => {}}
				onRowSelectionChange={() => {}}
				onDeleteSelected={() => {}}
				canDelete={canDelete}
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

test("renders every detections column header semibold", () => {
	const markup = renderToStaticMarkup(
		<DetectionsTable
			page={{ rows: [], total: 0 }}
			search={{ page: 1, pageSize: 50, sort: "recorded", direction: "desc" }}
			rowSelection={{}}
			onSearchChange={() => {}}
			onRowSelectionChange={() => {}}
			onDeleteSelected={() => {}}
			canDelete
		/>,
	);

	const semiboldHeaders = markup.match(
		/<th[^>]*class="[^"]*font-semibold[^"]*"[^>]*>/g,
	);
	assert.equal(semiboldHeaders?.length, 6);
	for (const label of [
		"Recorded",
		"Species",
		"Scientific name",
		"Confidence",
		"Recording",
	]) {
		assert.match(markup, new RegExp(`>${label}(?:<|$)`));
	}
});

// The delete path behind these checkboxes is gated on the server, so a locked
// visitor selecting rows could only ever arrive at a refusal.
test("drops the selection checkboxes when the station is locked", async () => {
	const markup = await renderTableWithDetection(false);

	assert.doesNotMatch(markup, /type="checkbox"/);
	assert.doesNotMatch(markup, /Select all detections on this page/);
	assert.doesNotMatch(markup, /aria-label="Select /);
	// The rest of the table is untouched -- only the column comes off.
	assert.match(markup, />Species(?:<|$)/);
	assert.match(markup, />Recording(?:<|$)/);
});

test("keeps the selection checkboxes when the station is unlocked", async () => {
	const markup = await renderTableWithDetection();

	assert.match(markup, /Select all detections on this page/);
	assert.match(markup, /aria-label="Select /);
});

test("keeps the complete table for containers wide enough to fit it", () => {
	const markup = renderToStaticMarkup(
		<DetectionsTable
			page={{ rows: [], total: 0 }}
			search={{ page: 1, pageSize: 50, sort: "recorded", direction: "desc" }}
			rowSelection={{}}
			onSearchChange={() => {}}
			onRowSelectionChange={() => {}}
			onDeleteSelected={() => {}}
			canDelete
		/>,
	);
	// The narrow sort menu repeats the column names as its options; leave it
	// out so only the column headings are read.
	const desktopTable = (
		markup.match(/<table[\s\S]*<\/table>/)?.[0] ?? ""
	).replace(/<select[\s\S]*?<\/select>/g, "");

	const order = [
		...desktopTable.matchAll(
			/>(Species|Scientific name|Recorded|Confidence|Recording)(?:<|$)/g,
		),
	].map((match) => match[1]);
	assert.deepEqual(order, [
		"Species",
		"Scientific name",
		"Recorded",
		"Confidence",
		"Recording",
	]);

	// Narrow, the headings give way to the sort menu, and the scientific name
	// waits for the widest card; the checkbox heading never goes.
	const hiddenUntil = [
		...desktopTable.matchAll(/<th[^>]*class="([^"]*)"[^>]*>([\s\S]*?)<\/th>/g),
	]
		.filter((match) => /(?:^|\s)hidden(?:\s|$)/.test(match[1]))
		.map((match) => [
			match[2].match(
				/>(Species|Scientific name|Recorded|Confidence|Recording)</,
			)?.[1],
			match[1].match(/@min-\[(\d+)rem\]:block/)?.[1],
		]);
	assert.deepEqual(hiddenUntil, [
		["Species", "36"],
		["Scientific name", "54"],
		["Recorded", "36"],
		["Confidence", "36"],
		["Recording", "36"],
	]);
	assert.match(desktopTable, /<th[^>]*class="[^"]*@min-\[36rem\]:hidden/);

	// Only the two ends are pinned, by min-width so they hold when the table
	// overflows: the selection column, sized off the card's padding, and
	// Recording. The columns between divide up the rest, so none carries a
	// width, and the table itself is not `table-fixed`.
	const pinned = [
		...desktopTable.matchAll(/data-slot="table-head" class="([^"]*)"/g),
	]
		.map(
			(match) => match[1].match(/(?:^|\s)(?:@\S+:)?(min-w-\S+)/)?.[1] ?? null,
		)
		.filter(Boolean);
	assert.deepEqual(pinned, [
		"min-w-[calc(var(--page-gap)*1.5+0.875rem)]",
		"min-w-32",
	]);
	assert.doesNotMatch(desktopTable, /data-slot="table"[^>]*table-fixed/);
});

test("renders the one table at every width, with no separate small-screen list", async () => {
	const markup = await renderTableWithDetection();

	assert.doesNotMatch(markup, /data-slot="detections-list"/);
	// Narrow, the header band is a sort menu over every sortable column.
	assert.match(markup, /aria-label="Sort detections by"/);
	assert.doesNotMatch(
		markup,
		/data-slot="table-container" class="(?:[^"]*\s)?hidden[\s"]/,
	);
	assert.match(markup, /aria-label="Select Northern Cardinal"/);
	assert.match(markup, />Northern Cardinal</);
	assert.match(markup, />Cardinalis cardinalis</);
	assert.match(markup, />94%|>94</);
});

test("the footer offers Delete only once rows are selected", () => {
	const render = (rowSelection: Record<string, boolean>, canDelete = true) =>
		renderToStaticMarkup(
			<DetectionsTable
				page={{ rows: [], total: 3 }}
				search={{ page: 1, pageSize: 100, sort: "recorded", direction: "desc" }}
				rowSelection={rowSelection}
				onSearchChange={() => {}}
				onRowSelectionChange={() => {}}
				onDeleteSelected={() => {}}
				canDelete={canDelete}
			/>,
		);

	assert.doesNotMatch(render({}), /Delete/);
	const selected = render({ "17": true, "18": true, "19": false });
	assert.match(selected, />2<\/span><span[^>]*>selected</);
	assert.match(selected, /aria-label="Delete 2 selected detections"/);
	assert.doesNotMatch(render({ "17": true }, false), /Delete/);
});
