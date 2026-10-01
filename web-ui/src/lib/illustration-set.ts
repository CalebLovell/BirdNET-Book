import { useSyncExternalStore } from "react";

/**
 * A side-by-side switch between the bundled illustrations and the new set
 * being painted with tools/illustrate, kept per browser. The loaders always
 * hand out the bundled URL; `SpeciesImage` swaps it at render time for a
 * species the new set already has, so no data path needs to know.
 */
export type IllustrationSet = "old" | "new";

// Species whose new pair (perched + flight) is in public/illustrations-new/.
const NEW_SLUGS = new Set([
	"cardinalis-cardinalis",
	"cyanocitta-cristata",
	"haemorhous-mexicanus",
	"spinus-tristis",
]);

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

/** `url` in the chosen set: the new file where one exists, else unchanged. */
export function inIllustrationSet(
	url: string | null,
	set: IllustrationSet,
): string | null {
	if (set === "old" || !url) return url;
	const match = BUNDLED.exec(url);
	if (!match || !NEW_SLUGS.has(match[1])) return url;
	return `/illustrations-new/${match[1]}${match[2] ?? ""}.png`;
}
