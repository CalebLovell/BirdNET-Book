import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
	attemptUnlock,
	readUnlockStatus,
	rotateSessionNonce,
} from "./auth.server.ts";
import {
	AuthConfigError,
	changePassword,
	MIN_PASSWORD_LENGTH,
	readAuthFile,
	verifyPassword,
} from "./auth-file.server.ts";

async function useFixtureAuthFile() {
	const file = path.join(
		await mkdtemp(path.join(tmpdir(), "birdnet-auth-svc-")),
		"web-ui-auth.conf",
	);
	process.env.BIRDNET_AUTH_CONF = file;
	return file;
}

test("setting a password on an unset station makes it ready", async () => {
	const file = await useFixtureAuthFile();
	assert.equal(await readAuthFile(file), null);

	await changePassword("swifts-over-the-creek");

	const after = await readAuthFile(file);
	assert.ok(after);
	assert.equal(verifyPassword("swifts-over-the-creek", after.hash), true);
});

test("changing the password rotates the nonce", async () => {
	const file = await useFixtureAuthFile();
	await changePassword("swifts-over-the-creek");
	const before = await readAuthFile(file);

	await changePassword("herons-at-the-weir");

	const after = await readAuthFile(file);
	assert.ok(before && after);
	assert.notEqual(after.nonce, before.nonce);
});

test("rejects a password under the minimum length", async () => {
	await useFixtureAuthFile();
	await assert.rejects(
		() => changePassword("a".repeat(MIN_PASSWORD_LENGTH - 1)),
		/at least 12/,
	);
});

test("rotating the nonce leaves the password alone", async () => {
	const file = await useFixtureAuthFile();
	await changePassword("swifts-over-the-creek");
	const before = await readAuthFile(file);

	await rotateSessionNonce();

	const after = await readAuthFile(file);
	assert.ok(before && after);
	assert.notEqual(after.nonce, before.nonce);
	assert.equal(after.hash, before.hash);
});

test("a password can be set over a corrupt file, since that is when it is needed", async () => {
	const file = await useFixtureAuthFile();
	await writeFile(file, "WEB_UI_PWD_HASH=garbage\n", "utf8");
	await assert.rejects(() => readAuthFile(file), AuthConfigError);

	await changePassword("swifts-over-the-creek");

	const after = await readAuthFile(file);
	assert.ok(after);
	assert.equal(verifyPassword("swifts-over-the-creek", after.hash), true);
});

// Neither state needs a live request: both answer before any cookie or client
// address is read.
test("an unset station is locked and says so, for status and for unlock", async () => {
	await useFixtureAuthFile();
	assert.deepEqual(await readUnlockStatus(), {
		unlocked: false,
		state: "not-set-up",
	});
	assert.deepEqual(await attemptUnlock("birdnet"), {
		ok: false,
		reason: "not-set-up",
	});
});

test("a corrupt password file is locked and reported as misconfigured", async () => {
	const file = await useFixtureAuthFile();
	await writeFile(file, "WEB_UI_PWD_HASH=garbage\n", "utf8");
	assert.deepEqual(await readUnlockStatus(), {
		unlocked: false,
		state: "misconfigured",
	});
	assert.deepEqual(await attemptUnlock("swifts-over-the-creek"), {
		ok: false,
		reason: "misconfigured",
	});
});
