import { useSyncExternalStore } from "react";

import { hasBundledIllustration } from "~/lib/illustrations.ts";
import { NEW_FLIGHT_SLUGS, NEW_SLUGS } from "~/lib/illustrations-new.ts";

/**
 * A side-by-side switch between the bundled illustrations and the new set
 * being painted with tools/illustrate, kept per browser. The loaders always
 * hand out the bundled URL; `SpeciesImage` swaps it at render time for a
 * species the new set already has, so no data path needs to know.
 */
export type IllustrationSet = "old" | "new";

const STORAGE_KEY = "birdnet:illustration-set";
const listeners = new Set<() => void>();
let current: IllustrationSet | null = null;

function read(): IllustrationSet {
	try {
		return localStorage.getItem(STORAGE_KEY) === "new" ? "new" : "old";
	} catch {
		return "old";
	}
}

export function setIllustrationSet(set: IllustrationSet) {
	try {
		localStorage.setItem(STORAGE_KEY, set);
	} catch {
		// Storage blocked (private window): the choice just won't outlive the tab.
	}
	current = set;
	for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

/** The server, and the first client render, always show the bundled set. */
export function useIllustrationSet(): IllustrationSet {
	return useSyncExternalStore(
		subscribe,
		() => {
			current ??= read();
			return current;
		},
		() => "old",
	);
}

const BUNDLED = /^\/illustrations\/([a-z-]+?)(-2)?\.png$/;

/**
 * `url` in the chosen set: the new file where the new set has the species
 * (its perched pose standing in for a flight pose not painted yet), the
 * bundled one otherwise, and none for a species only the other set has.
 */
export function inIllustrationSet(
	url: string | null,
	set: IllustrationSet,
): string | null {
	const match = url ? BUNDLED.exec(url) : null;
	if (!match) return url;
	const [, slug, flight] = match;
	if (set === "new" && NEW_SLUGS.has(slug)) {
		const pose = flight && NEW_FLIGHT_SLUGS.has(slug) ? "-2" : "";
		return `/illustrations-new/${slug}${pose}.png`;
	}
	return hasBundledIllustration(slug) ? url : null;
}
