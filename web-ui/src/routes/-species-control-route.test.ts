import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("species control route loads data, adapts mutations, and invalidates commits", async () => {
	const source = await readFile(
		new URL("./species-control.tsx", import.meta.url),
		"utf8",
	);
	assert.match(source, /createFileRoute\("\/species-control"\)/);
	// A locked visitor is sent to /account before the loader runs, so the
	// loader only ever loads.
	assert.match(source, /requireUnlocked\(context\.auth, location\)/);
	// Deferred, so the page renders before the species arrive.
	assert.match(
		source,
		/loader:\s*\(\)\s*=>\s*\(\{\s*page:\s*getSpeciesControlPage\(\)\s*\}\)/,
	);
	assert.match(
		source,
		/validateSearch:\s*normalizeSpeciesControlWorkspaceSearch/,
	);
	assert.match(source, /Route\.useSearch\(\)/);
	assert.match(source, /Route\.useNavigate\(\)/);
	assert.match(source, /search=\{search\}/);
	assert.match(source, /replace:\s*true/);
	assert.match(source, /<SpeciesControlPage/);
	assert.match(source, /useServerFn\(saveSpeciesControl\)/);
	assert.match(source, /router\.invalidate\(\)/);
	assert.match(source, /Species control is unavailable/);
});

test("navigation puts Species Control in the Station foot group", async () => {
	const source = await readFile(
		new URL("../components/sidebar/sidebar-nav.tsx", import.meta.url),
		"utf8",
	);
	// Manage holds Detections, then Review; the Station group at the foot runs
	// Account, Species Control, then Settings, after everything else.
	const explore = source.indexOf(">Explore<");
	const manage = source.indexOf(">Manage<");
	const station = source.indexOf(">Station<");
	const review = source.indexOf('to="/review"');
	const control = source.indexOf('to="/species-control"');
	const settings = source.indexOf('to="/settings"');
	const species = source.indexOf('to="/birds"');
	const detections = source.indexOf('to="/detections"');
	const account = source.indexOf('to="/account"');

	assert.ok(explore >= 0 && manage > explore, "both group labels are present");
	assert.ok(
		species > explore && species < manage,
		"the browsing pages stay in the first group",
	);
	assert.ok(
		detections > manage && review > detections && station > review,
		"Manage runs Detections, then Review",
	);
	assert.ok(
		account > station && control > account && settings > control,
		"Station runs Account, Species Control, then Settings",
	);
	assert.match(source, />\s*Species Control\s*</);
	// A visitor never sees the gated group: it renders only once unlocked.
	assert.match(source.slice(explore, manage), /auth\.unlocked \?/);
	assert.doesNotMatch(source, /\{lock\}/);
});
