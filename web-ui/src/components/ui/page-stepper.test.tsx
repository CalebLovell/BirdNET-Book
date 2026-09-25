import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PageStepper, parsePageInput } from "~/components/ui/page-stepper.tsx";

test("parsePageInput clamps typed pages to the ones that exist", () => {
	assert.equal(parsePageInput("12", 40), 12);
	assert.equal(parsePageInput("1,234", 2000), 1234);
	assert.equal(parsePageInput(" 7 ", 40), 7);
	assert.equal(parsePageInput("9999", 40), 40);
	assert.equal(parsePageInput("0", 40), 1);
	assert.equal(parsePageInput("", 40), null);
	assert.equal(parsePageInput("3", 0), 1);
});

test("PageStepper disables the steps at either end", () => {
	const first = renderToStaticMarkup(
		<PageStepper page={1} pageCount={3} onPageChange={() => {}} />,
	);
	assert.match(first, /aria-label="Previous page"[^>]*disabled=""/);
	assert.doesNotMatch(first, /aria-label="Next page"[^>]*disabled=""/);

	const last = renderToStaticMarkup(
		<PageStepper page={3} pageCount={3} onPageChange={() => {}} />,
	);
	assert.match(last, /aria-label="Next page"[^>]*disabled=""/);
});

test("PageStepper groups the current page's digits like the total", () => {
	const markup = renderToStaticMarkup(
		<PageStepper page={1394} pageCount={1394} onPageChange={() => {}} />,
	);
	assert.match(markup, /value="1,394"/);
	assert.match(markup, /of 1,394/);
});
