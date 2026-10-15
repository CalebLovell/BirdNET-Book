import assert from "node:assert/strict";
import test from "node:test";

import {
	type ClipEvent,
	type ClipStatus,
	clipShowsPlayhead,
	clipTransition,
	INITIAL_CLIP_STATE,
} from "~/lib/clip-player-machine.ts";

/** Runs events from the start and returns the status after each one. */
function walk(...types: ClipEvent["type"][]): ClipStatus[] {
	let state = INITIAL_CLIP_STATE;
	return types.map((type) => {
		state = clipTransition(state, { type } as ClipEvent);
		return state.status;
	});
}

test("pressing play loads the clip, then plays it", () => {
	assert.deepEqual(walk("toggle", "loaded"), ["loading", "playing"]);
});

test("a second press while loading means don't play after all", () => {
	assert.deepEqual(walk("toggle", "toggle", "loaded"), [
		"loading",
		"loading",
		"paused",
	]);
});

test("play, pause, play", () => {
	assert.deepEqual(walk("toggle", "loaded", "toggle", "toggle"), [
		"loading",
		"playing",
		"paused",
		"playing",
	]);
});

test("dragging while playing pauses for the drag and resumes on release", () => {
	assert.deepEqual(
		walk("toggle", "loaded", "scrubStart", "mediaPaused", "scrubEnd"),
		["loading", "playing", "scrubbing", "scrubbing", "playing"],
	);
});

test("dragging while paused stays paused on release", () => {
	assert.deepEqual(
		walk("toggle", "loaded", "toggle", "scrubStart", "scrubEnd", "toggle"),
		["loading", "playing", "paused", "scrubbing", "paused", "playing"],
	);
});

test("dragging before anything has loaded loads, then lands paused", () => {
	assert.deepEqual(walk("scrubStart", "loaded", "scrubEnd"), [
		"loading",
		"scrubbing",
		"paused",
	]);
	assert.deepEqual(walk("scrubStart", "scrubEnd", "loaded"), [
		"loading",
		"loading",
		"paused",
	]);
});

test("dragging to the end mid-drag doesn't end the clip", () => {
	assert.deepEqual(
		walk("toggle", "loaded", "scrubStart", "mediaEnded", "scrubEnd"),
		["loading", "playing", "scrubbing", "scrubbing", "playing"],
	);
});

test("a clip that runs out ends, and play starts it again", () => {
	assert.deepEqual(walk("toggle", "loaded", "mediaEnded", "toggle"), [
		"loading",
		"playing",
		"ended",
		"playing",
	]);
});

test("another clip starting elsewhere pauses this one", () => {
	assert.deepEqual(walk("toggle", "loaded", "mediaPaused"), [
		"loading",
		"playing",
		"paused",
	]);
});

test("a failed load can be retried", () => {
	assert.deepEqual(walk("toggle", "loadFailed", "toggle", "loaded"), [
		"loading",
		"error",
		"loading",
		"playing",
	]);
});

test("the playhead shows once there's a position to show", () => {
	let state = INITIAL_CLIP_STATE;
	assert.equal(clipShowsPlayhead(state), false);
	state = clipTransition(state, { type: "scrubStart" });
	assert.equal(clipShowsPlayhead(state), true);
	state = clipTransition(state, { type: "loaded" });
	state = clipTransition(state, { type: "scrubEnd" });
	assert.equal(clipShowsPlayhead(state), true);
	state = clipTransition(state, { type: "toggle" });
	state = clipTransition(state, { type: "mediaEnded" });
	assert.equal(clipShowsPlayhead(state), false);
});
