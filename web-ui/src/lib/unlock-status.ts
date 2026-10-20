import type { AnyRouter } from "@tanstack/react-router";

import { getUnlockStatusFn } from "~/lib/auth.ts";

export type UnlockStatus = Awaited<ReturnType<typeof getUnlockStatusFn>>;

/**
 * The unlock status the root route hands every page, without making a click
 * wait on the server.
 *
 * The router waits for every route's `beforeLoad` before it switches pages.
 * Asking the server there meant every click sat behind whatever the server
 * was busy with -- and a slow query holds the whole server, since SQLite is
 * synchronous -- so a link could take a second to respond. Instead the
 * browser keeps the last answer: a click uses it at once, and a fresh one is
 * fetched behind it, re-running the routes only if it changed (a password
 * rotated from another device, a renamed station).
 *
 * This only decides what to *render*. The server still checks the session on
 * every gated call (`requireUnlocked`), so a stale "unlocked" can never fetch
 * anything it shouldn't.
 */

let router: AnyRouter | null = null;
let known: UnlockStatus | null = null;
let inFlight: Promise<UnlockStatus> | null = null;

/** Called once from getRouter, so a changed status can re-run the routes. */
export function registerUnlockStatusRouter(next: AnyRouter) {
	router = next;
}

function fetchStatus(): Promise<UnlockStatus> {
	inFlight ??= getUnlockStatusFn()
		.then((status) => {
			known = status;
			return status;
		})
		.finally(() => {
			inFlight = null;
		});
	return inFlight;
}

const sameStatus = (a: UnlockStatus, b: UnlockStatus) =>
	a.unlocked === b.unlocked && a.state === b.state && a.siteName === b.siteName;

export async function unlockStatusForNavigation(): Promise<UnlockStatus> {
	// On the server there is no "last answer" to keep: a module-level cache
	// would be shared by every visitor. Each render asks for its own.
	if (typeof window === "undefined") return getUnlockStatusFn();

	// The first navigation in this tab has nothing to go on yet.
	if (!known) return fetchStatus();

	const shown = known;
	fetchStatus().then(
		(fresh) => {
			if (!sameStatus(fresh, shown)) void router?.invalidate();
		},
		// Unreachable for now; the next click tries again.
		() => {},
	);
	return shown;
}

/**
 * Drops the kept answer, so the next navigation waits for a fresh one. For
 * the controls that change it -- unlock, lock, sign out everywhere -- which
 * then invalidate the router: the page they land on has to know at once.
 */
export function forgetUnlockStatus() {
	known = null;
}
