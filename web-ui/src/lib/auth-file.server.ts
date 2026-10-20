import "@tanstack/react-start/server-only";

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { parseBirdnetConfig } from "~/lib/settings-config.server.ts";

export const MIN_PASSWORD_LENGTH = 12;

const SCRYPT = { N: 16384, r: 8, p: 1 } as const;
const KEY_LENGTH = 32;

export type AuthFile = { hash: string; nonce: string };

/** Thrown when the file exists but cannot be read or trusted. Callers must
 *  treat this as "locked", never as "no password configured". */
export class AuthConfigError extends Error {}

/**
 * In a directory of its own, owned by the account the web UI runs as, because
 * every write is a temp file renamed into place: the service has to be able to
 * create files *next to* the password file, and `/etc/birdnet` itself is
 * root's. `install_web_ui.sh` creates it.
 */
export function resolveAuthPath() {
	return process.env.BIRDNET_AUTH_CONF ?? "/etc/birdnet/web-ui/auth.conf";
}

export function hashPassword(password: string, salt = randomBytes(16)) {
	const derived = scryptSync(password, salt, KEY_LENGTH, SCRYPT);
	return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${derived.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string) {
	const parts = stored.split("$");
	if (parts.length !== 6 || parts[0] !== "scrypt") return false;

	const [, n, r, p, saltB64, expectedB64] = parts;
	const cost = { N: Number(n), r: Number(r), p: Number(p) };
	if (!Object.values(cost).every(Number.isSafeInteger)) return false;
	// Bounded rather than left to Node's `maxmem` to reject: a tampered file
	// naming a cost just under that limit would have us burn real CPU on a Pi
	// for every attempt. These are generous next to the values we write.
	if (cost.N > 1 << 20 || cost.r > 16 || cost.p > 4) return false;
	if (cost.N < 2 || cost.r < 1 || cost.p < 1) return false;

	const expected = Buffer.from(expectedB64, "base64");
	if (expected.length !== KEY_LENGTH) return false;

	// scrypt throws on absurd parameters from a tampered file -- a bad file is
	// a failed login, not a 500.
	try {
		const actual = scryptSync(
			password,
			Buffer.from(saltB64, "base64"),
			KEY_LENGTH,
			cost,
		);
		return timingSafeEqual(actual, expected);
	} catch {
		return false;
	}
}

function serialize(auth: AuthFile) {
	return [
		"# BirdNET-Pi web UI password. Do not edit by hand --",
		"# use scripts/set_web_ui_password.sh.",
		`WEB_UI_PWD_HASH=${auth.hash}`,
		`WEB_UI_SESSION_NONCE=${auth.nonce}`,
		"",
	].join("\n");
}

/** Same temp-file-then-rename dance as `writeSettingsCard`, so a crash mid-write
 *  can never leave a half-written file that locks the owner out. */
export async function writeAuthFile(
	next: AuthFile,
	authPath = resolveAuthPath(),
) {
	const temporaryPath = path.join(
		path.dirname(authPath),
		`.${path.basename(authPath)}.${process.pid}.tmp`,
	);
	// The password hash must never exist on disk world-readable, so the file is
	// created with restricted permissions rather than tightened afterwards.
	await writeFile(temporaryPath, serialize(next), {
		encoding: "utf8",
		mode: 0o600,
	});
	try {
		await rename(temporaryPath, authPath);
	} catch (error) {
		// A failed rename would otherwise leave the temp file behind on every
		// attempt. It is 0600 so nothing leaks, but they would accumulate
		// forever.
		await rm(temporaryPath, { force: true });
		throw error;
	}
}

export function newNonce() {
	return randomBytes(16).toString("hex");
}

/**
 * `null` means no password has been set, so nobody can sign in. There is no
 * shipped default: a password everyone knows can only be made safe by guessing
 * whether a visitor is at home, and that guess fails both ways -- a home
 * network on public IPv6 looks remote, and a tunnel to the internet makes
 * every visitor look local.
 *
 * Reading never writes. An unreadable file is an AuthConfigError rather than
 * `null`: "the station is broken" and "the station is not set up yet" need
 * different fixes, and the owner should be told which.
 */
export async function readAuthFile(
	authPath = resolveAuthPath(),
): Promise<AuthFile | null> {
	let text: string;
	try {
		text = await readFile(authPath, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
		throw new AuthConfigError(
			`Cannot read ${authPath}: ${(error as Error).message}`,
		);
	}

	const values = parseBirdnetConfig(text);
	// Written by versions that shipped the password `birdnet`. That password is
	// no longer accepted from anywhere, so such a station is simply unset.
	if (values.WEB_UI_PWD_IS_DEFAULT === "1") return null;

	const hash = values.WEB_UI_PWD_HASH ?? "";
	const nonce = values.WEB_UI_SESSION_NONCE ?? "";
	// A hash that verifies nothing would lock the owner out silently; a missing
	// nonce would make every cookie signature meaningless. Both are corruption.
	if (
		!/^scrypt\$\d+\$\d+\$\d+\$[^$]+\$[^$]+$/.test(hash) ||
		!/^[0-9a-f]{32}$/.test(nonce)
	) {
		throw new AuthConfigError(
			`${authPath} is malformed; the web UI stays locked.`,
		);
	}

	return { hash, nonce };
}

/**
 * The password mutation lives here rather than in `auth.server.ts` so the
 * command-line tool that sets the password can reach them without importing the
 * request and cookie helpers, which mean nothing outside a live HTTP request.
 *
 * It does not read the existing file first. It replaces it wholesale, and a
 * corrupt file is exactly when the owner most needs to be able to set a
 * password -- refusing to overwrite it would make the recovery tool useless in
 * the one situation it exists for.
 */
export async function changePassword(
	password: string,
	authPath = resolveAuthPath(),
) {
	if (password.length < MIN_PASSWORD_LENGTH) {
		throw new Error(
			`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
		);
	}
	await writeAuthFile(
		{ hash: hashPassword(password), nonce: newNonce() },
		authPath,
	);
}
