import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
	attemptUnlock,
	clearSession,
	readUnlockStatus,
	type UnlockStatus,
} from "./auth.server.ts";
import { readSiteName } from "./settings-config.server.ts";

const UNAUTHORIZED_MESSAGE = "This page requires the station password.";

export class UnauthorizedError extends Error {
	override name = "UnauthorizedError";
	constructor() {
		super(UNAUTHORIZED_MESSAGE);
	}
}

/**
 * Whether `error` is the gate's refusal, as it reaches the browser. The class
 * does not survive the trip from a server function, so this goes by the
 * message.
 */
export function isUnauthorizedError(error: unknown): boolean {
	return error instanceof Error && error.message === UNAUTHORIZED_MESSAGE;
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
		// The station's name, for everyone: it heads the sidebar so a visitor
		// knows whose station they're looking at.
		return { ...status, siteName: await readSiteName() };
	},
);

export const unlockFn = createServerFn({ method: "POST" })
	.validator(z.object({ password: z.string().max(1024) }))
	.handler(({ data }) => attemptUnlock(data.password));

export const lockFn = createServerFn({ method: "POST" }).handler(() => {
	clearSession();
	return { ok: true as const };
});
