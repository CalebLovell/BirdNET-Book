import assert from "node:assert/strict";
import test from "node:test";

import {
	messageForThrown,
	STATION_ERROR_MESSAGE,
	UNREACHABLE_MESSAGE,
} from "./unlock-messages.ts";

test("no response at all reads as unreachable", () => {
	assert.equal(
		messageForThrown(new TypeError("Failed to fetch")),
		UNREACHABLE_MESSAGE,
	);
});

test("an error the station sent back reads as a station error, not a network one", () => {
	assert.equal(
		messageForThrown(new Error("Internal Server Error")),
		STATION_ERROR_MESSAGE,
	);
	assert.equal(messageForThrown("weird"), STATION_ERROR_MESSAGE);
});
