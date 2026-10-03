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
	assert.match(source, /loader:\s*\(\)\s*=>\s*getSpeciesControlPage\(\)/);
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

test("navigation puts Species Control under Manage", async () => {
	const source = await readFile(
		new URL("../components/sidebar/sidebar-nav.tsx", import.meta.url),
		"utf8",
	);
	// Manage holds Detections, Review, then Species Control; Account and
	// Settings sit together at the foot, after everything else.
	const explore = source.indexOf(">Explore<");
	const manage = source.indexOf(">Manage<");
	const review = source.indexOf('to="/review"');
	const control = source.indexOf('to="/species-control"');
	const settings = source.indexOf('to="/settings"');
	const species = source.indexOf('to="/birds"');
	const detections = source.indexOf('to="/detections"');

	assert.ok(explore >= 0 && manage > explore, "both group labels are present");
	assert.ok(
		species > explore && species < manage,
		"the browsing pages stay in the first group",
	);
	assert.ok(
		detections > manage && detections < review,
		"Detections leads the second group",
	);
	const account = source.indexOf('to="/account"');
	assert.ok(
		review > manage && control > review && account > control,
		"Manage runs Detections, Review, Species Control",
	);
	assert.ok(settings > account, "the foot runs Account, then Settings");
	assert.match(source, />\s*Species Control\s*</);
	// A visitor never sees the gated group: it renders only once unlocked.
	assert.match(source.slice(explore, manage), /auth\.unlocked \?/);
	assert.doesNotMatch(source, /\{lock\}/);
});
