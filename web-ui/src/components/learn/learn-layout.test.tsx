import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { LearnPoolSelector } from "./learn-layout.tsx";

test("left-aligns the recording-pool selector", () => {
	const markup = renderToStaticMarkup(
		<LearnPoolSelector pool="today" onPoolChange={() => {}} />,
	);

	assert.match(markup, /class="[^"]*justify-start/);
});

test("offers the pools as a dropdown on phones and joined tabs from 640px", () => {
	const markup = renderToStaticMarkup(
		<LearnPoolSelector pool="week" onPoolChange={() => {}} />,
	);

	assert.match(markup, /<div class="[^"]*sm:hidden[^"]*"><svg[^>]*>.*<select/);
	assert.match(markup, /<option value="week" selected="">This Week<\/option>/);
	assert.match(markup, /class="hidden sm:block"/);
});
