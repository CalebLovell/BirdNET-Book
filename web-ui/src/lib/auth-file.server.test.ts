import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
	AuthConfigError,
	changePassword,
	hashPassword,
	readAuthFile,
	resolveAuthPath,
	verifyPassword,
	writeAuthFile,
} from "./auth-file.server.ts";

async function fixtureDir() {
	return mkdtemp(path.join(tmpdir(), "birdnet-auth-"));
}

test("hashes are salted, so the same password never yields the same string", () => {
	assert.notEqual(
		hashPassword("swifts-over-the-creek"),
		hashPassword("swifts-over-the-creek"),
	);
});

test("verifies a correct password and rejects a wrong one", () => {
	const stored = hashPassword("swifts-over-the-creek");
	assert.equal(verifyPassword("swifts-over-the-creek", stored), true);
	assert.equal(verifyPassword("swifts-over-the-creeK", stored), false);
	assert.equal(verifyPassword("", stored), false);
});

test("rejects rather than throws on a malformed stored hash", () => {
	assert.equal(verifyPassword("anything", "not-a-hash"), false);
	assert.equal(
		verifyPassword("anything", "scrypt$16384$8$1$onlyfourfields"),
		false,
	);
});

test("a missing file means no password is set, and reading writes nothing", async () => {
	const dir = await fixtureDir();
	const file = path.join(dir, "web-ui-auth.conf");

	assert.equal(await readAuthFile(file), null);
	assert.deepEqual(await readdir(dir), []);
});

test("a file left by the old shipped default reads as no password set", async () => {
	const file = path.join(await fixtureDir(), "web-ui-auth.conf");
	await writeFile(
		file,
		[
			`WEB_UI_PWD_HASH=${hashPassword("birdnet")}`,
			"WEB_UI_PWD_IS_DEFAULT=1",
			`WEB_UI_SESSION_NONCE=${"a".repeat(32)}`,
			"",
		].join("\n"),
		"utf8",
	);

	assert.equal(await readAuthFile(file), null);
});

test("an unreadable file is a config error, not an unset password", async () => {
	// A directory where the file should be: readFile fails with EISDIR, the
	// same branch a permissions error takes.
	const file = await fixtureDir();
	await assert.rejects(() => readAuthFile(file), AuthConfigError);
});

test("a written password file is owner-read/write only", {
	skip: process.platform === "win32",
}, async () => {
	const file = path.join(await fixtureDir(), "web-ui-auth.conf");
	await changePassword("swifts-over-the-creek", file);
	const mode = (await stat(file)).mode & 0o777;
	assert.equal(mode, 0o600);
});

test("reads an existing file without rewriting it", async () => {
	const file = path.join(await fixtureDir(), "web-ui-auth.conf");
	await writeAuthFile(
		{ hash: hashPassword("a-real-long-password"), nonce: "a".repeat(32) },
		file,
	);
	const before = await readFile(file, "utf8");

	const auth = await readAuthFile(file);
	assert.ok(auth);
	assert.equal(auth.nonce, "a".repeat(32));
	assert.equal(verifyPassword("a-real-long-password", auth.hash), true);
	assert.equal(await readFile(file, "utf8"), before);
});

test("a malformed file locks rather than failing open", async () => {
	const file = path.join(await fixtureDir(), "web-ui-auth.conf");
	await writeFile(file, "WEB_UI_PWD_HASH=garbage\n", "utf8");
	await assert.rejects(() => readAuthFile(file), AuthConfigError);
});

test("uses BIRDNET_AUTH_CONF before the production path", () => {
	const previous = process.env.BIRDNET_AUTH_CONF;
	process.env.BIRDNET_AUTH_CONF = "C:\\fixture\\web-ui-auth.conf";
	try {
		assert.equal(resolveAuthPath(), "C:\\fixture\\web-ui-auth.conf");
	} finally {
		if (previous === undefined) delete process.env.BIRDNET_AUTH_CONF;
		else process.env.BIRDNET_AUTH_CONF = previous;
	}
	assert.equal(resolveAuthPath(), "/etc/birdnet/web-ui/auth.conf");
});
