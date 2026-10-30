import assert from "node:assert/strict";
import test from "node:test";

import {
	runCardSystemActions,
	type SettingsCommandRunner,
} from "./settings-system.server.ts";

function recordingRunner(calls: unknown[]): SettingsCommandRunner {
	return async (executable, args, stdin) => {
		calls.push({ executable, args: [...args], stdin });
	};
}

test("audio restarts only its three fixed services", async () => {
	const calls: unknown[] = [];
	const result = await runCardSystemActions(
		"audio",
		{},
		recordingRunner(calls),
	);
	assert.deepEqual(calls, [
		{
			executable: "sudo",
			args: [
				"systemctl",
				"restart",
				"birdnet_recording.service",
				"livestream.service",
			],
			stdin: undefined,
		},
	]);
	assert.deepEqual(result, { attempted: true, skipped: false });
});

test("each card can invoke only its allowlisted services", async () => {
	const expected = {
		station: ["birdnet_analysis.service"],
		detection: ["birdnet_analysis.service"],
		privacy: ["birdnet_analysis.service"],
		audio: ["birdnet_recording.service", "livestream.service"],
		recording: ["birdnet_recording.service", "birdnet_analysis.service"],
		storage: [],
		review: [],
	} as const;
	for (const [kind, services] of Object.entries(expected)) {
		const calls: { args: string[] }[] = [];
		await runCardSystemActions(
			kind as keyof typeof expected,
			{},
			async (_executable, args) => {
				calls.push({ args: [...args] });
			},
		);
		assert.deepEqual(
			calls,
			services.length ? [{ args: ["systemctl", "restart", ...services] }] : [],
			kind,
		);
	}
});

test("Station applies a changed timezone without constructing a shell command", async () => {
	const calls: unknown[] = [];
	await runCardSystemActions(
		"station",
		{
			previousTimezone: "America/Denver",
			timezone: "America/Chicago",
			timezoneFileExists: true,
		},
		recordingRunner(calls),
	);
	assert.deepEqual(calls, [
		{
			executable: "sudo",
			args: ["timedatectl", "set-timezone", "America/Chicago"],
			stdin: undefined,
		},
		{
			executable: "sudo",
			args: ["tee", "/etc/timezone"],
			stdin: "America/Chicago\n",
		},
		{
			executable: "sudo",
			args: ["systemctl", "restart", "birdnet_analysis.service"],
			stdin: undefined,
		},
	]);
});

test("Station skips timezone commands when it did not change", async () => {
	const calls: unknown[] = [];
	await runCardSystemActions(
		"station",
		{
			previousTimezone: "America/Chicago",
			timezone: "America/Chicago",
			timezoneFileExists: true,
		},
		recordingRunner(calls),
	);
	assert.deepEqual(calls, [
		{
			executable: "sudo",
			args: ["systemctl", "restart", "birdnet_analysis.service"],
			stdin: undefined,
		},
	]);
});

test("development can skip fixed system actions explicitly", async () => {
	const calls: unknown[] = [];
	const result = await runCardSystemActions(
		"recording",
		{ skipSystemActions: true },
		recordingRunner(calls),
	);
	assert.deepEqual(calls, []);
	assert.deepEqual(result, { attempted: false, skipped: true });
});
