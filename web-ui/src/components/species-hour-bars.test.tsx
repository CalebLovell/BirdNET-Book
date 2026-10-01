import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { SpeciesHourBars } from "~/components/species-hour-bars.tsx";

// Midnight-first 24-count fixture with an unambiguous peak at 07:00 and a
// couple of quiet-but-nonzero hours, so scaling and the min-sliver both show.
const counts = Array(24).fill(0);
counts[7] = 40; // peak
counts[8] = 20; // half of peak
counts[18] = 2; // quiet but present

function render(
	hourCounts: number[],
	comName = "European Robin",
	heatMax = Math.max(...hourCounts),
) {
	return renderToStaticMarkup(
		<SpeciesHourBars
			comName={comName}
			hourCounts={hourCounts}
			heatMax={heatMax}
		/>,
	);
}

test("renders one bar per hour of the day", () => {
	const markup = render(counts);
	assert.equal((markup.match(/data-hour-bar/g) ?? []).length, 24);
});

test("the busiest hour fills the chart height", () => {
	const markup = render(counts);
	// Peak hour (index 7) is the full-height bar.
	assert.match(markup, /height:100%/);
	// And it is drawn in moss, not the zero-stub line colour.
	assert.match(markup, /background-color:var\(--moss\)/);
});

test("a non-zero hour scales to its share of the peak", () => {
	const markup = render(counts);
	// index 8 = 20/40 = 50%.
	assert.match(markup, /height:50%/);
});

test("colour follows the shared scale, not the bird's own peak", () => {
	// Next to a bird whose busiest hour is 400, this one's 40 is a pale bar at
	// full height rather than a moss one.
	const markup = render(counts, "European Robin", 400);
	assert.match(markup, /height:100%/);
	assert.doesNotMatch(markup, /background-color:var\(--moss\)/);
});

test("a zero hour renders a faint baseline stub, not a moss bar", () => {
	const markup = render(counts);
	// Zero stub uses the line colour; there is at least one zero hour here.
	assert.match(markup, /background-color:var\(--line\)/);
});

test("renders eight hour ticks", () => {
	const markup = render(counts);
	assert.equal((markup.match(/data-hour-tick/g) ?? []).length, 8);
});

test("labels the chart with the bird and its busiest hour", () => {
	const markup = render(counts);
	assert.match(markup, /European Robin/);
	assert.match(markup, /7 AM/); // hourLabel(7)
});

test("renders nothing when every hour is zero", () => {
	assert.equal(render(Array(24).fill(0)), "");
});
