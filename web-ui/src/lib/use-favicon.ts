import { useEffect } from "react";

import { isPhotoUrl } from "~/lib/illustrations.ts";

/** What the tab shows on any page that isn't about a bird: the site's mark. */
export const DEFAULT_FAVICON = "/songbook.svg";

/** What a bird page shows when it has no painted bird to put in the tab. */
export const NEST_FAVICON = "/illustrations/nest.webp";

/**
 * The icon for `href`: a reference photo is never a favicon, so it, like no
 * bird at all, gets the fallback.
 */
export function faviconHref(
	href: string | null,
	fallback: string = DEFAULT_FAVICON,
): string {
	return href && !isPhotoUrl(href) ? href : fallback;
}

/**
 * Points the tab icon at `href` while the calling component is mounted, and
 * puts the default back on the way out.
 *
 * This mutates the single <link rel="icon"> the root route renders rather than
 * appending a second one, which matters more than it looks: a document gets one
 * icon, and browsers do not reliably re-pick it when a competing link appears
 * next to the one they already chose. Two links is why the tab used to keep the
 * first bird it saw while the page moved on to another.
 *
 * The same reasoning rules out declaring the icon in a route's `head`, even
 * though that would server-render it -- the root's link is already in the
 * document, so a route-level one only ever arrives as the second.
 */
export function useFavicon(
	href: string | null,
	fallback: string = DEFAULT_FAVICON,
) {
	useEffect(() => {
		const link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
		if (!link) return;

		link.setAttribute("href", faviconHref(href, fallback));
		return () => link.setAttribute("href", DEFAULT_FAVICON);
	}, [href, fallback]);
}

/** A bird page's tab: its bird's painting, or the nest when it has none. */
export function useBirdFavicon(href: string | null) {
	useFavicon(href, NEST_FAVICON);
}
