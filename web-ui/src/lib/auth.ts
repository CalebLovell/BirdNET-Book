import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
	attemptUnlock,
	clearSession,
	readUnlockStatus,
	rotateSessionNonce,
	type UnlockStatus,
} from "./auth.server.ts";
import { readSiteName } from "./settings-config.server.ts";

export class UnauthorizedError extends Error {
	override name = "UnauthorizedError";
	constructor() {
		super("This page requires the station password.");
	}
}

/**
 * The actual security boundary. Route-level checks decide what to *render*;
 * this decides what the server is willing to *do*, so bypassing the UI gets an
 * error rather than data.
 */
export const requireUnlocked = createMiddleware({ type: "function" }).server(
	async ({ next }) => {
		let unlocked: boolean;
		try {
			({ unlocked } = await readUnlockStatus());
		} catch {
			// readUnlockStatus already reads a missing or corrupt auth file as
			// locked; this catches anything unforeseen the same way. Failing open
			// here would hand out mutating endpoints.
			unlocked = false;
		}
		if (!unlocked) throw new UnauthorizedError();
		return next();
	},
);

export const getUnlockStatusFn = createServerFn({ method: "GET" }).handler(
	async () => {
		let status: UnlockStatus;
		try {
			status = await readUnlockStatus();
		} catch (error) {
			// Every page asks this, so an unforeseen failure reads as a broken
			// station -- locked, and said so -- rather than a crashed page.
			console.error("[auth] could not read the unlock status", error);
			status = { unlocked: false, state: "misconfigured" };
		}
		// The station's name rides along only once unlocked: it's the
		// account row's title, and a visitor has no business reading it.
		return {
			...status,
			siteName: status.unlocked ? await readSiteName() : "",
		};
	},
);

export const unlockFn = createServerFn({ method: "POST" })
	.validator(z.object({ password: z.string().max(1024) }))
	.handler(({ data }) => attemptUnlock(data.password));

export const lockFn = createServerFn({ method: "POST" }).handler(() => {
	clearSession();
	return { ok: true as const };
});

export const signOutAllDevicesFn = createServerFn({ method: "POST" })
	.middleware([requireUnlocked])
	.handler(async () => {
		await rotateSessionNonce();
		return { ok: true as const };
	});
