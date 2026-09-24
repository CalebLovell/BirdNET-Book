import assert from "node:assert/strict";
import test from "node:test";
import { Bird } from "lucide-react";
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

test("a page-level empty carries a card, an icon and a headline", () => {
	const markup = renderToStaticMarkup(
		<EmptyState icon={Bird} title="Nothing recorded yet">
			The station has not heard anything so far.
		</EmptyState>,
	);

	assert.match(markup, /feature-card/);
	assert.match(markup, /<svg/);
	assert.match(markup, /aria-hidden="true"/);
	assert.match(markup, /<p class="font-semibold">Nothing recorded yet<\/p>/);
	assert.match(markup, /The station has not heard anything so far\./);
});

test("the supporting line is optional", () => {
	const markup = renderToStaticMarkup(
		<EmptyState icon={Bird} title="Nothing recorded yet" />,
	);

	assert.match(markup, /Nothing recorded yet/);
	assert.doesNotMatch(markup, /text-muted-foreground text-sm/);
});
