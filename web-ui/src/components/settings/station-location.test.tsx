import assert from "node:assert/strict";
import test from "node:test";
import { MapPin } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";

import { StationLocation } from "./station-location.tsx";

const current = { latitude: 41.88, longitude: -87.63 };

test("offers the location control without opening anything or submitting the card", () => {
	const markup = renderToStaticMarkup(
		<StationLocation current={current} onApply={() => {}} />,
	);
	assert.match(markup, />Use my location</);
	// The control sits inside the Station card's form, so a bare button would
	// submit the card instead of asking the browser for a position.
	assert.match(markup, /<button[^>]*type="button"/);
	assert.doesNotMatch(markup, /role="dialog"/);
});

test("renders the station card with its location control in the header", async () => {
	const { SettingsCard } = await import("./settings-card.tsx");
	const markup = renderToStaticMarkup(
		<SettingsCard
			title="Station"
			description="Name the station."
			icon={MapPin}
			onSave={() => {}}
			action={<StationLocation current={current} onApply={() => {}} />}
		>
			<p>fields</p>
		</SettingsCard>,
	);
	// Ahead of the card's own Save, so the header control is not mistaken for it.
	assert.ok(markup.indexOf(">Use my location<") < markup.indexOf(">Save<"));
});
