export const SITE_NAME = "BirdNET-Book";

/**
 * Document title for a route. The site name leads so a row of pinned tabs
 * still reads as this app once the page name is truncated away; routes pass
 * whatever they put at the top of the page so the tab and the masthead agree.
 * Deepest match wins, so a route that omits `head` falls back to the root's
 * bare site name.
 */
export function pageTitle(page?: string | null): string {
	return page ? `${SITE_NAME} – ${page}` : SITE_NAME;
}
