import assert from "node:assert/strict";
import test from "node:test";
import { Settings } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";

import { PageHeaderCard } from "~/components/page-header-card.tsx";
import type { StationHealth } from "~/lib/health-data.ts";
import { healthStats } from "./station-health.tsx";

const health: StationHealth = {
	metrics: [
		{ id: "disk", label: "Disk", value: "88.0%" },
		{ id: "database", label: "Database", value: "3.08 MB" },
		{ id: "last-detection", label: "Last detection", value: "None yet" },
	],
};

test("becomes ordinary masthead figures, icon and all", () => {
	const stats = healthStats(health);
	assert.equal(stats.length, 3);
	assert.deepEqual(
		stats.map((stat) => stat.label),
		["Disk", "Database", "Last detection"],
	);
	for (const stat of stats) {
		assert.ok(stat.icon, `${stat.label} needs an icon`);
	}
	// The value stands alone -- unit and all -- with no subtitle beside it.
	const disk = stats.find((stat) => stat.label === "Disk");
	assert.equal(disk?.value, "88.0%");
});

test("renders through the shared header rather than a panel of its own", () => {
	const markup = renderToStaticMarkup(
		<PageHeaderCard
			icon={Settings}
			title="Settings"
			description="Configure this station."
			stats={healthStats(health)}
		/>,
	);
	// The masthead's own furniture: a definition list of kicker + figure.
	assert.match(markup, /<dl/);
	assert.match(markup, /island-kicker/);
	// Three figures, laid out exactly as the Species masthead's three are.
	assert.match(markup, /lg:grid-cols-3/);
	for (const label of ["Disk", "Database", "Last detection"]) {
		assert.match(markup, new RegExp(`>${label}`));
	}
});
