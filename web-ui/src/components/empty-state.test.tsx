import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { EmptyNote, EmptyState } from "~/components/empty-state.tsx";

test("a section-level empty is a quiet line, not a card", () => {
	const markup = renderToStaticMarkup(
		<EmptyNote>No detections match these filters.</EmptyNote>,
	);

	assert.match(
		markup,
		/^<p class="mt-\(--page-gap\) text-muted-foreground text-sm">/,
	);
	assert.doesNotMatch(markup, /feature-card/);
	assert.doesNotMatch(markup, /<svg/);
});

test("a page-level empty is a card under the standard header band", () => {
	const markup = renderToStaticMarkup(
		<EmptyState title="Timeline">
			The station has not heard anything so far.
		</EmptyState>,
	);

	assert.match(
		markup,
		/^<section aria-label="Timeline" class="feature-card rounded-md p-4">/,
	);
	assert.match(
		markup,
		/min-h-\[45px\][^>]*><div class="island-kicker m-0 shrink-0">Timeline<\/div>/,
	);
	assert.match(markup, /The station has not heard anything so far\./);
	assert.doesNotMatch(markup, /<svg/);
});

test("it adds no top margin of its own; the page spaces it", () => {
	const markup = renderToStaticMarkup(
		<EmptyState title="Timeline">Nothing yet.</EmptyState>,
	);

	assert.doesNotMatch(markup, /^<section[^>]*mt-/);
});
