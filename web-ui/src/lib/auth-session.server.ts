import "@tanstack/react-start/server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import type { AuthFile } from "./auth-file.server.ts";
import { SESSION_IDLE_DAYS } from "./auth-limits.ts";

export const UNLOCK_COOKIE_NAME = "birdnet_unlock";

/** Thirty days without a visit signs a browser out. Every verified request
 *  re-issues the token with a fresh timestamp, so a device in regular use never
 *  falls out -- only a forgotten one does. Revocation before then is by password
 *  change or nonce rotation. */
const SESSION_IDLE_MS = SESSION_IDLE_DAYS * 24 * 60 * 60 * 1000;
export const COOKIE_MAX_AGE_SECONDS = SESSION_IDLE_MS / 1000;

const TOKEN_VERSION = "1";

/** Derived rather than stored: the key is a function of the password hash and
 *  the nonce, so changing either one silently invalidates every cookie in
 *  existence. That is the whole revocation mechanism. */
function signingKey(auth: AuthFile) {
	return createHash("sha256")
		.update(`${auth.hash}\u0000${auth.nonce}`)
		.digest();
}

function sign(auth: AuthFile, payload: string) {
	return createHmac("sha256", signingKey(auth))
		.update(payload)
		.digest("base64url");
}

export function signSessionToken(auth: AuthFile, issuedAt = Date.now()) {
	const payload = `${TOKEN_VERSION}.${issuedAt}`;
	return `${payload}.${sign(auth, payload)}`;
}

export function verifySessionToken(
	auth: AuthFile,
	token: string | undefined,
	now = Date.now(),
) {
	if (!token) return false;

	const parts = token.split(".");
	if (parts.length !== 3) return false;

	const [version, issuedAt, signature] = parts;
	if (version !== TOKEN_VERSION || !/^\d+$/.test(issuedAt)) return false;
	// The cookie's own expiry is the browser's promise, not ours: a copied
	// token would outlive it. The timestamp is signed, so this is the check
	// that actually holds.
	if (now - Number(issuedAt) > SESSION_IDLE_MS) return false;

	const expected = Buffer.from(sign(auth, `${version}.${issuedAt}`), "utf8");
	const actual = Buffer.from(signature, "utf8");
	// timingSafeEqual throws on a length mismatch, which is itself a rejection.
	return expected.length === actual.length && timingSafeEqual(expected, actual);
}
