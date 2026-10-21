import assert from "node:assert/strict";
import { test } from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

import { SpeciesImage } from "~/components/species-image.tsx";

const render = (imageUrl: string | null, cropToPainting = false) =>
	renderToStaticMarkup(
		<SpeciesImage
			imageUrl={imageUrl}
			alt="Robin"
			glyphClassName="size-5"
			cropToPainting={cropToPainting}
		/>,
	);

test("a painting renders as an img that is not cropped to fill", () => {
	const html = render("/illustrations-new/x.webp");
	assert.match(html, /<img /);
	assert.doesNotMatch(html, /object-cover/);
});

test("a photo URL renders a square-cropped, referrer-free img", () => {
	const html = render("https://upload.wikimedia.org/x.jpg");
	assert.match(html, /<img /);
	assert.match(html, /object-cover/);
	assert.match(html, /rounded-md/);
	assert.match(html, /referrerpolicy="no-referrer"/i);
});

test("a photo ignores cropToPainting", () => {
	const html = render("https://upload.wikimedia.org/x.jpg", true);
	assert.match(html, /<img /);
	assert.doesNotMatch(html, /<svg/);
});

test("no image renders the glyph svg", () => {
	const html = render(null);
	assert.match(html, /<svg/);
	assert.doesNotMatch(html, /<img /);
});
