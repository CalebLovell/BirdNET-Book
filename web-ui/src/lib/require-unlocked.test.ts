import assert from "node:assert/strict";
import { test } from "node:test";
import { isRedirect, type ParsedLocation } from "@tanstack/react-router";

import { requireUnlocked, safeNext } from "~/lib/require-unlocked.ts";

const location = { href: "/settings#storage" } as ParsedLocation;

test("requireUnlocked lets an unlocked visitor through", () => {
	assert.equal(requireUnlocked({ unlocked: true }, location), undefined);
});

test("requireUnlocked sends a locked visitor to /account with where they were going", () => {
	try {
		requireUnlocked({ unlocked: false }, location);
		assert.fail("expected a redirect");
	} catch (thrown) {
		assert.ok(isRedirect(thrown));
		assert.equal(thrown.options.to, "/account");
		assert.deepEqual(thrown.options.search, { next: "/settings#storage" });
	}
});

test("safeNext keeps paths on this site and drops everything else", () => {
	assert.equal(safeNext("/review?page=2"), "/review?page=2");
	assert.equal(safeNext("/settings#station"), "/settings#station");
	for (const unsafe of [
		"https://example.com/",
		"//example.com/",
		"/\\example.com",
		"javascript:alert(1)",
		"settings",
		"",
		42,
		undefined,
	]) {
		assert.equal(safeNext(unsafe), undefined, String(unsafe));
	}
});
