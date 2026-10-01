import assert from "node:assert/strict";
import test from "node:test";

import { compactCount } from "~/lib/number-format.ts";

test("compactCount keeps three digits and shortens past them", () => {
	assert.equal(compactCount(0), "0");
	assert.equal(compactCount(999), "999");
	assert.equal(compactCount(1_000), "1k");
	assert.equal(compactCount(1_058), "1k");
	assert.equal(compactCount(1_250), "1.2k");
	assert.equal(compactCount(12_900), "12k");
	assert.equal(compactCount(300_000), "300k");
	assert.equal(compactCount(999_999), "999k");
	assert.equal(compactCount(1_000_000), "1m");
	assert.equal(compactCount(1_500_000), "1.5m");
});
