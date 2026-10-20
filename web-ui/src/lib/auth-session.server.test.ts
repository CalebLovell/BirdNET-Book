import assert from "node:assert/strict";
import test from "node:test";

import type { AuthFile } from "./auth-file.server.ts";
import { hashPassword } from "./auth-file.server.ts";
import { signSessionToken, verifySessionToken } from "./auth-session.server.ts";

const auth: AuthFile = {
	hash: hashPassword("swifts-over-the-creek"),
	nonce: "0".repeat(32),
};

test("a freshly signed token verifies", () => {
	assert.equal(verifySessionToken(auth, signSessionToken(auth)), true);
});

test("missing, empty, and shapeless tokens are rejected", () => {
	assert.equal(verifySessionToken(auth, undefined), false);
	assert.equal(verifySessionToken(auth, ""), false);
	assert.equal(verifySessionToken(auth, "garbage"), false);
	assert.equal(verifySessionToken(auth, "1.123.badsig"), false);
});

test("a tampered payload is rejected", () => {
	const [version, issuedAt, signature] = signSessionToken(auth).split(".");
	assert.equal(
		verifySessionToken(auth, `${version}.${Number(issuedAt) + 1}.${signature}`),
		false,
	);
});

test("changing the password invalidates existing tokens", () => {
	const token = signSessionToken(auth);
	const changed = { ...auth, hash: hashPassword("a-completely-different-one") };
	assert.equal(verifySessionToken(changed, token), false);
});

test("rotating the nonce invalidates existing tokens", () => {
	const token = signSessionToken(auth);
	assert.equal(
		verifySessionToken({ ...auth, nonce: "f".repeat(32) }, token),
		false,
	);
});

test("the token carries no secret material", () => {
	const token = signSessionToken(auth);
	assert.equal(token.includes(auth.hash), false);
	assert.equal(token.includes(auth.nonce), false);
});
