// URL-friendly identifier for a bird's detail page, built from the common name
// so the address bar reads like the page ("Black-capped Chickadee" ->
// "black-capped-chickadee"). Apostrophes and periods are dropped rather than
// turned into separators, so "Anna's Hummingbird" stays "annas-hummingbird";
// every other run of punctuation or whitespace collapses to a single hyphen.
//
// Kept separate from illustrations.ts's slug, which is built from the
// scientific name to match AvianVisitors' asset filenames.
export function comNameToSlug(comName: string): string {
	const slug = comName
		.trim()
		.toLowerCase()
		.replaceAll(/['’.]/g, "")
		.replaceAll(/[^a-z0-9]+/g, "-")
		.replace(/^-+/, "")
		.replace(/-+$/, "");
	if (typeof window !== "undefined") seenNames.set(slug, comName.trim());
	return slug;
}

// Every name the browser has turned into a link, by slug. A slug can't be
// reversed, but every link to a bird page is built here first, so by the time
// one is clicked its name is known -- which lets the page title itself on the
// click instead of after its data arrives. Never filled on the server.
const seenNames = new Map<string, string>();

/** The name behind a bird-page slug, if this browser has linked to it. */
export function comNameForSlug(slug: string): string | null {
	return seenNames.get(slug) ?? null;
}
