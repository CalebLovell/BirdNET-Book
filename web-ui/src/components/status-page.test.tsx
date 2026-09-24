import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { StatusPage } from "~/components/status-page.tsx";

test("the section masthead stays and owns the only h1", () => {
	const markup = renderToStaticMarkup(
		<StatusPage
			section="Species"
			sectionDescription="Every species ever recorded at this station."
			tone="missing"
			title="No such species"
		>
			Nothing matched.
		</StatusPage>,
	);

	assert.match(markup, /<h1[^>]*>Species<\/h1>/);
	assert.match(markup, /<h2[^>]*>No such species<\/h2>/);
	assert.equal(markup.match(/<h1/g)?.length, 1);
});

test("the page wrapper matches a locked page's", () => {
	const markup = renderToStaticMarkup(
		<StatusPage
			section="Day in review"
			sectionDescription="One day at this station, hour by hour."
			tone="missing"
			title="That day hasn't happened yet"
		>
			Nothing matched.
		</StatusPage>,
	);

	assert.match(markup, /class="page-wrap space-y-\(--page-gap\) py-4"/);
});
