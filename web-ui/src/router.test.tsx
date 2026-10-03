import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (file: string) => readFile(new URL(file, import.meta.url), "utf8");

/**
 * The rule this file guards: a search value that is a string stays a string in
 * the address bar.
 *
 * The router's default stringifier takes JSON.parse as a second argument and
 * uses it to detect strings whose text is itself valid JSON, quoting those so
 * they survive the round trip as strings. A year anchor is exactly that case,
 * and it went out as `?date=%222026%22` -- a URL nobody would type or share.
 */

test("search strings are not quoted in the URL", async () => {
	// Comments stripped first: the one above this option names the default it
	// is replacing, and that mention would trip the assertion below.
	const source = (await read("./router.tsx")).replace(/^\s*\/\/.*$/gm, "");

	assert.match(
		source,
		/stringifySearch: stringifySearchWith\(JSON\.stringify\)/,
	);
	assert.doesNotMatch(
		source,
		/stringifySearchWith\(JSON\.stringify,\s*JSON\.parse\)/,
		"passing the parser is what re-introduces the quoting",
	);
	// Parsing stays JSON, so numbers, booleans and objects still round-trip.
	assert.match(source, /parseSearch: parseSearchWith\(JSON\.parse\)/);
});

/**
 * The other half of that trade: an unquoted "2026" parses back as a number, so
 * every schema that can receive a numeric-looking string has to accept one.
 */
test("schemas that take free text tolerate a numeric value", async () => {
	const timeline = await read("./routes/timeline.tsx");
	assert.match(timeline, /date: z\.coerce\.string\(\)/);

	const species = await read("./routes/birds.index.tsx");
	assert.match(species, /q: z\.coerce\.string\(\)/);

	// These two hand-roll the same tolerance rather than using zod.
	const detections = await read("./lib/detection-workspace.ts");
	assert.match(detections, /typeof input\.species === "number"/);

	const control = await read("./lib/species-control-workspace.ts");
	assert.match(control, /String\(input\.query\)/);
});
