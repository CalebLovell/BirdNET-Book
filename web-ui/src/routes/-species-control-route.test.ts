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

test("navigation groups Control with the other locked pages", async () => {
	const source = await readFile(
		new URL("../components/sidebar/sidebar-nav.tsx", import.meta.url),
		"utf8",
	);
	// Control sits in the second group, after every page a visitor can open,
	// and between Review and Settings -- the three that carry a lock.
	const explore = source.indexOf("Explore");
	const manage = source.indexOf("Manage");
	const review = source.indexOf('to="/review"');
	const control = source.indexOf('to="/species-control"');
	const settings = source.indexOf('to="/settings"');
	const species = source.indexOf('to="/species"');
	const detections = source.indexOf('to="/detections"');

	assert.ok(explore >= 0 && manage > explore, "both group labels are present");
	assert.ok(
		species > explore && detections > species && detections < manage,
		"the open pages stay in the first group",
	);
	assert.ok(
		review > manage && control > review && settings > control,
		"the locked pages run Review, Control, Settings",
	);
	// A visitor never sees the gated group: it renders only once unlocked.
	assert.match(source.slice(explore, manage), /auth\.unlocked \?/);
	assert.doesNotMatch(source, /\{lock\}/);
});
