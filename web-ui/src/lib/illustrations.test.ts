import assert from "node:assert/strict";
import test from "node:test";

import { illustrationUrlFor, isPhotoUrl } from "./illustrations.ts";

const PHOTO = "https://inaturalist-open-data.s3.amazonaws.com/x.jpg";

test("painting wins over photo", () => {
	const photos = { "cardinalis-cardinalis": PHOTO };
	assert.equal(
		illustrationUrlFor("Cardinalis cardinalis", "perched", photos),
		"/illustrations-new/cardinalis-cardinalis.png",
	);
});

test("unpainted species falls back to photo", () => {
	const photos = { "turdus-nonexistens": PHOTO };
	assert.equal(
		illustrationUrlFor("Turdus nonexistens", "perched", photos),
		PHOTO,
	);
	assert.equal(
		illustrationUrlFor("Turdus nonexistens", "flight", photos),
		PHOTO,
	);
});

test("unknown species is null", () => {
	assert.equal(illustrationUrlFor("Turdus nonexistens", "perched", {}), null);
});

test("isPhotoUrl tells photos from paintings", () => {
	assert.equal(isPhotoUrl(PHOTO), true);
	assert.equal(isPhotoUrl("/illustrations-new/x.png"), false);
});
