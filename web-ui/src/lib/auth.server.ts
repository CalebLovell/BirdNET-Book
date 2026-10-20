import "@tanstack/react-start/server-only";

import {
	deleteCookie,
	getCookie,
	getRequestIP,
	getRequestProtocol,
	setCookie,
} from "@tanstack/react-start/server";

import {
	AuthConfigError,
	type AuthFile,
	newNonce,
	readAuthFile,
	resolveAuthPath,
	verifyPassword,
	writeAuthFile,
} from "./auth-file.server.ts";
import {
	COOKIE_MAX_AGE_SECONDS,
	signSessionToken,
	UNLOCK_COOKIE_NAME,
	verifySessionToken,
} from "./auth-session.server.ts";
import { UnlockThrottle } from "./auth-throttle.server.ts";

/**
 * - `ready`: a password is set; `unlocked` says whether this browser has it.
 * - `not-set-up`: no password yet, so nobody can sign in until the owner sets
 *   one on the Pi.
 * - `misconfigured`: the password file exists but can't be read or trusted.
 *   Locked, and the owner needs the service log to see why.
 */
export type StationAuthState = "ready" | "not-set-up" | "misconfigured";
export type UnlockStatus = { unlocked: boolean; state: StationAuthState };
export type UnlockResult =
	| { ok: true }
	| {
			ok: false;
			reason: "invalid" | "throttled" | "not-set-up" | "misconfigured";
			retryAfterMs?: number;
	  };

type LoadedAuth =
	| { state: "ready"; auth: AuthFile }
	| { state: "not-set-up" | "misconfigured" };

/** The one place a broken password file is logged, with the reason, so the
 *  page can say "see the log" and the log has something in it. */
async function loadAuth(): Promise<LoadedAuth> {
	try {
		const auth = await readAuthFile();
		return auth ? { state: "ready", auth } : { state: "not-set-up" };
	} catch (error) {
		if (!(error instanceof AuthConfigError)) throw error;
		console.error(`[auth] ${error.message}`);
		return { state: "misconfigured" };
	}
}

// Lazy so the throttle's state path is resolved on first use, not at module
// import time -- resolving eagerly at module scope would bake in whatever
// BIRDNET_AUTH_CONF happened to be set (or not) before tests or the
// password-setting CLI get a chance to set it.
let throttle: UnlockThrottle | undefined;
function getThrottle() {
	if (!throttle) {
		throttle = new UnlockThrottle({
			statePath: `${resolveAuthPath()}.throttle.json`,
		});
	}
	return throttle;
}

/**
 * Trusting `x-forwarded-for` unconditionally would let an attacker mint a fresh
 * address per attempt and walk straight through the throttle; ignoring it behind
 * a tunnel would collapse every client onto one address and let one attacker
 * lock the owner out. So it is honoured only when the deployment says so.
 */
function resolveClientIp() {
	return getRequestIP({
		xForwardedFor: Boolean(process.env.WEB_UI_TRUSTED_PROXY),
	});
}

/**
 * Every caller whose address cannot be determined shares this one throttle
 * bucket, and it is deliberately not a private address, so those callers are
 * also subject to the global ceiling. That is the safe direction -- an
 * unidentifiable client is treated as remote -- but it does mean that on a
 * deployment where the address is never available, one attacker's failures
 * throttle everyone. Setting `WEB_UI_TRUSTED_PROXY` correctly is what avoids
 * that.
 */
const UNKNOWN_CLIENT = "unknown";

function issueSession(auth: AuthFile) {
	setCookie(UNLOCK_COOKIE_NAME, signSessionToken(auth), {
		httpOnly: true,
		sameSite: "lax",
		path: "/",
		// Cannot be set over plain HTTP or the cookie is dropped outright, which
		// would break LAN use today. HTTPS is a deployment prerequisite before
		// exposing the station -- see the spec.
		secure: getRequestProtocol() === "https",
		maxAge: COOKIE_MAX_AGE_SECONDS,
	});
}

export async function readUnlockStatus(): Promise<UnlockStatus> {
	const loaded = await loadAuth();
	// Anything but a readable, set password is locked -- never open.
	if (loaded.state !== "ready") return { unlocked: false, state: loaded.state };
	const { auth } = loaded;
	const unlocked = verifySessionToken(auth, getCookie(UNLOCK_COOKIE_NAME));
	// Sliding renewal: every verified request pushes the expiry back out.
	if (unlocked) issueSession(auth);
	return { unlocked, state: "ready" };
}

export async function attemptUnlock(password: string): Promise<UnlockResult> {
	const loaded = await loadAuth();
	// Nothing to guess against, so these skip the throttle: a failure here
	// says nothing about the password.
	if (loaded.state !== "ready") return { ok: false, reason: loaded.state };
	const { auth } = loaded;
	const client = resolveClientIp() ?? UNKNOWN_CLIENT;
	const throttle = getThrottle();

	const gate = await throttle.check(client);
	if (!gate.allowed) {
		return { ok: false, reason: "throttled", retryAfterMs: gate.retryAfterMs };
	}

	if (!verifyPassword(password, auth.hash)) {
		await throttle.recordFailure(client);
		console.warn(`[auth] failed unlock from ${client}`);
		return { ok: false, reason: "invalid" };
	}

	await throttle.recordSuccess(client);
	issueSession(auth);
	return { ok: true };
}

export function clearSession() {
	deleteCookie(UNLOCK_COOKIE_NAME, { path: "/" });
}

/** Only reachable signed in (`requireUnlocked`), so a password is set. */
export async function rotateSessionNonce() {
	const auth = await readAuthFile();
	if (!auth) throw new AuthConfigError("No password is set.");
	await writeAuthFile({ ...auth, nonce: newNonce() });
}

// `changePassword` lives in `auth-file.server.ts`,
// alongside the file format it rewrites, so the password-setting CLI can use
// it without pulling in this module's request-scoped helpers.
