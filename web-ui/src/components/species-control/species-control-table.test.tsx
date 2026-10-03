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
import {
	SpeciesControlTable,
	type SpeciesControlViewRow,
	sortSpeciesControlRows,
} from "./species-control-table.tsx";

function row(
	comName: string,
	sciName: string,
	status: SpeciesControlViewRow["status"],
	detections = 0,
): SpeciesControlViewRow {
	return {
		comName,
		sciName,
		status,
		custom: status === "custom",
		excluded: status === "never",
		whitelisted: status === "always",
		history: {
			detections,
			maxConfidence: null,
			lastSeen: null,
			recordings: 0,
		},
	};
}

const rows = [
	row("Coyote", "Canis latrans", "automatic", 4),
	row("Gray squirrel", "Sciurus carolinensis", "custom"),
	row("Raccoon", "Procyon lotor", "always"),
	row("Opossum", "Didelphis virginiana", "never"),
];

async function renderTable(
	props: Partial<React.ComponentProps<typeof SpeciesControlTable>> = {},
) {
	const rootRoute = createRootRoute();
	const indexRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/",
		component: () => (
			<SpeciesControlTable
				rows={rows}
				page={1}
				pageCount={1}
				selected={new Set()}
				sort="species"
				direction="asc"
				onSortChange={() => {}}
				onSelectedChange={() => {}}
				onPageChange={() => {}}
				{...props}
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

test("renders Installed species as the detections table's grid", async () => {
	const markup = await renderTable();
	const table = markup.match(/<table[\s\S]*<\/table>/)?.[0] ?? "";

	// One table at every width -- no separate small-screen list.
	assert.doesNotMatch(markup, /data-slot="species-control-list"/);
	assert.doesNotMatch(markup, /lg:hidden|lg:block/);
	assert.match(table, /role="table"[^>]*style="--cols-sm:/);
	assert.match(table, /grid-cols-\(--cols-sm\)/);

	for (const heading of ["Species", "Scientific name", "Count", "Status"]) {
		assert.match(table, new RegExp(`<button[^>]*>${heading}<svg`));
	}
	assert.match(table, /aria-sort="ascending"[^>]*><button[^>]*>Species/);
	assert.match(table, /aria-sort="none"[^>]*><button[^>]*>Status/);
	assert.match(table, /opacity-35/);

	// Row numbers, the species link, and every status badge.
	assert.match(table, /<span class="min-w-0 truncate">4<\/span>/);
	assert.match(
		table,
		/<a href="\/birds\/coyote" class="font-medium no-underline hover:underline">Coyote<\/a>/,
	);
	for (const status of [
		"Automatic",
		"Custom",
		"Always detect",
		"Never detect",
	]) {
		assert.match(table, new RegExp(`>${status}<`));
	}
	assert.match(table, /var\(--sage\)/);
	assert.match(table, /var\(--sand\)/);
	assert.match(table, /var\(--clay\)/);
});

test("narrow, headings give way to one sort menu and two columns sit out", async () => {
	const markup = await renderTable();

	assert.match(markup, /<select aria-label="Sort species by"/);
	assert.match(markup, /aria-label="Sort descending"/);
	assert.match(
		markup,
		/class="[^"]*hidden @min-\[54rem\]:block"[^>]*><em[^>]*>Canis latrans/,
	);
	assert.match(markup, /class="[^"]*hidden @min-\[36rem\]:block[^"]*"[^>]*>4</);
	// The select-all checkbox stays at every width.
	assert.match(
		markup,
		/<th[^>]*class="(?![^"]*hidden)[^"]*"[^>]*><input aria-label="Select all species on this page"/,
	);
});

test("marks selected rows and pages with the shared stepper", async () => {
	const markup = await renderTable({
		selected: new Set(["Canis latrans"]),
		page: 2,
		pageCount: 3,
	});

	assert.match(markup, /data-state="selected"/);
	assert.match(markup, /bg-\[var\(--row-selected\)\]/);
	assert.match(markup, /aria-label="Species pages"/);
	assert.doesNotMatch(markup, /Showing/);
	// Numbers count on across pages.
	assert.match(markup, />51<\/span>/);
});

test("says so when the search matches nothing", async () => {
	const markup = await renderTable({ rows: [] });
	assert.match(markup, /No installed species match that search\./);
	assert.doesNotMatch(markup, /<table/);
});

test("sorts scientific names and statuses in their natural orders", () => {
	assert.deepEqual(
		sortSpeciesControlRows(rows, "scientific", "asc").map(
			(item) => item.sciName,
		),
		[
			"Canis latrans",
			"Didelphis virginiana",
			"Procyon lotor",
			"Sciurus carolinensis",
		],
	);
	assert.deepEqual(
		sortSpeciesControlRows(rows, "scientific", "desc").map(
			(item) => item.sciName,
		),
		[
			"Sciurus carolinensis",
			"Procyon lotor",
			"Didelphis virginiana",
			"Canis latrans",
		],
	);
	assert.deepEqual(
		sortSpeciesControlRows(rows, "status", "asc").map((item) => item.status),
		["automatic", "custom", "always", "never"],
	);
});
