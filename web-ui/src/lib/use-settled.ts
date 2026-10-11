import { useEffect, useState, useSyncExternalStore } from "react";

type Outcome = { ok: true; value: unknown } | { ok: false; error: unknown };

/**
 * Every promise this hook has seen, and how it settled. Keyed by the promise
 * itself, so a part that mounts after its data has already landed -- a
 * preloaded page, a card remounted by a new key -- reads it on its first
 * render instead of drawing its shell for a frame. Weak, so a promise and its
 * data are dropped with the last page that held them, and each request's
 * promises are its own: nothing is shared between visitors on the server.
 */
const outcomes = new WeakMap<Promise<unknown>, Outcome>();
const tracked = new WeakSet<Promise<unknown>>();

function track(promise: Promise<unknown>) {
	if (tracked.has(promise)) return;
	tracked.add(promise);
	promise.then(
		(value) => outcomes.set(promise, { ok: true, value }),
		(error: unknown) => outcomes.set(promise, { ok: false, error }),
	);
}

const noSubscription = () => () => {};

/** False on the server and through hydration, true for every client render
    after it -- React reads the server snapshot while hydrating. */
function useHydrated(): boolean {
	return useSyncExternalStore(
		noSubscription,
		() => true,
		() => false,
	);
}

/**
 * The value of the latest deferred loader promise to settle -- without
 * suspending. What every deferred part of a page reads its data through
 * (Deferred is built on it), and what keeps those parts steady while they
 * reload: they hold the last answer while a new one is on its way, rather
 * than vanishing into a shell every time their own click changes the URL.
 *
 * Not React's Suspense, on purpose. A full page load hands the browser
 * server-rendered HTML whose data promise is filled in by a script at the end
 * of that HTML -- and hydration can start before the script runs. A Suspense
 * boundary caught suspending mid-hydration fell back to its shell and, in
 * this setup, never came back. Waiting in state has no such race: the server
 * and the first client render both draw the shell, and the data replaces it
 * when it lands.
 *
 * `current` is false while that answer belongs to an earlier promise, so a
 * caller can hold back whatever would be wrong to act on in the meantime.
 * Null before the first answer (and always during SSR). A promise that fails
 * is rethrown during render, for the route's error component to catch.
 */
export function useSettled<T>(
	promise: Promise<T>,
): { value: T; current: boolean } | null {
	track(promise);
	const hydrated = useHydrated();
	const [settled, setSettled] = useState<{
		value: T;
		from: Promise<T>;
	} | null>(null);
	const [, rerender] = useState(0);

	useEffect(() => {
		let cancelled = false;
		promise.then(
			(value) => {
				if (!cancelled) setSettled({ value, from: promise });
			},
			// Recorded in `outcomes` (track's handler ran first); the render this
			// asks for rethrows it.
			() => {
				if (!cancelled) rerender((count) => count + 1);
			},
		);
		return () => {
			cancelled = true;
		};
	}, [promise]);

	const outcome = outcomes.get(promise);
	if (outcome && !outcome.ok) throw outcome.error;
	// Already settled when this render began: no need to wait for the effect.
	// Never while hydrating, though: the server drew the shell, so hydration
	// must too -- and it renders in slices, so a promise can settle between
	// one component and the next. The effect brings the data in right after.
	if (outcome && hydrated) {
		return { value: outcome.value as T, current: true };
	}
	if (!settled) return null;
	return { value: settled.value, current: settled.from === promise };
}
