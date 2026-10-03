import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
	attemptUnlock,
	clearSession,
	readUnlockStatus,
	rotateSessionNonce,
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
			// A missing or corrupt auth file must read as locked, never as a crash
			// and never as open. Failing open here would hand out mutating
			// endpoints to anyone who could corrupt the file.
			unlocked = false;
		}
		if (!unlocked) throw new UnauthorizedError();
		return next();
	},
);

export const getUnlockStatusFn = createServerFn({ method: "GET" }).handler(
	async () => {
		try {
			const status = await readUnlockStatus();
			// The station's name rides along only once unlocked: it's the
			// account row's title, and a visitor has no business reading it.
			return {
				...status,
				siteName: status.unlocked ? await readSiteName() : "",
			};
		} catch {
			// A missing or corrupt auth file must read as locked. Failing open here
			// would hand out Settings to anyone who could corrupt the file.
			return { unlocked: false, isDefaultPassword: false, siteName: "" };
		}
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
