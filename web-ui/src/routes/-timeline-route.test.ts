import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (file: string) => readFile(new URL(file, import.meta.url), "utf8");

/**
 * The rule this file guards: time is a control on one page, not four pages.
 * Today, Timeline, Stats and the day review each fixed a scope and grew their
 * own way of moving through it; `/timeline` has a single period control, and
 * every scope-specific card hangs off that one switch.
 */

test("one loader serves every period", async () => {
	const source = await read("./timeline.tsx");
	assert.match(source, /createFileRoute\("\/timeline"\)/);
	assert.match(
		source,
		/loader: \(\{ deps \}\) => getTimelinePage\(\{ data: deps \}\)/,
	);
	// Period and window both live in the URL, so any scope is a link someone
	// can keep -- which is what makes the redirects below able to carry the old
	// pages' parameters across.
	assert.match(source, /period: z\s*\n?\s*\.enum\(TIMELINE_PERIODS\)/);
	assert.match(source, /date: z\.coerce\.string\(\)\.optional\(\)/);
	// Daily is the default: a bare /timeline shows today, and the middleware
	// strips the param so only non-default periods carry ?period= (alongside any
	// other defaulted params, like the view, that ride the same call).
	assert.match(source, /const DEFAULT_PERIOD: TimelinePeriod = "day"/);
	assert.match(source, /stripSearchParams\(\{ period: DEFAULT_PERIOD[,}]/);
});

test("every period draws the same body", async () => {
	const source = await read("../lib/timeline-page.ts");
	// One rows path for every period; the Daily range check is the only branch.
	assert.match(source, /kind: "rows";\s+rows: TimelineRow\[\];/);
	assert.match(source, /kind: "day-out-of-range"/);
	assert.doesNotMatch(source, /loadAllTimeStats/);
	assert.doesNotMatch(source, /getMonthlyTrend/);

	const route = await read("./timeline.tsx");
	assert.match(route, /<SpeciesByHourCard/);
	assert.match(route, /<SpeciesGrid/);
	// The detections-by-hour card was dropped from every period's body.
	assert.doesNotMatch(route, /<DetectionsByHourCard/);
	assert.doesNotMatch(route, /AllTimeCards/);
});

test("the day period keeps the range check rather than a bare format check", async () => {
	const source = await read("../lib/timeline-page.ts");
	// The Daily anchor is classified, not merely format-checked, so a future or
	// pre-station date still gets its own message.
	assert.match(source, /classifyDay\(anchor/);

	const route = await read("./timeline.tsx");
	assert.match(route, /case "future"/);
	assert.match(route, /case "before-station"/);
	assert.match(route, /<StatusPage/);
});

// `/timeline` is not in this list: it kept its own address, so every link
// already written against the old page's period and date parameters opens the
// same window on the new one without a redirect at all.
test("the pages this replaced redirect rather than 404", async () => {
	const today = await read("./today.tsx");
	assert.match(today, /redirect\(\{ to: "\/live", replace: true \}\)/);

	// ?year= chose a year for the by-month chart; the timeline page has a
	// period for exactly that, so it becomes the window.
	const stats = await read("./stats.tsx");
	assert.match(stats, /to: "\/timeline"/);
	assert.match(stats, /period: "year" as const, date: String\(search\.year\)/);
	assert.match(stats, /period: "all" as const/);

	const day = await read("./day.$date.tsx");
	assert.match(day, /period: "day" as const, date: params\.date/);
});

test("the nav lists one entry per scope, not one per period", async () => {
	const source = await read("../components/sidebar/sidebar-nav.tsx");
	assert.match(source, /to="\/live"/);
	assert.match(source, /to="\/timeline"/);
	assert.doesNotMatch(source, /to="\/today"/);
	assert.doesNotMatch(source, /to="\/stats"/);
	// The period switch rewrites the search, so an active link that matched on
	// it would stop reading as active the moment you changed window.
	assert.match(
		source.slice(source.indexOf('to="/timeline"')),
		/activeOptions=\{\{ includeSearch: false \}\}/,
	);
});

test("a date drilled into from a table lands on a window it can zoom out from", async () => {
	for (const file of [
		"../components/detections/detections-table.tsx",
		"./species.$comName.tsx",
	]) {
		const source = await read(file);
		assert.doesNotMatch(
			source,
			/to="\/day\/\$date"/,
			`${file} should link into the timeline page's day period`,
		);
		assert.match(source, /search=\{\{ period: "day", date: /, `${file}`);
	}
});
