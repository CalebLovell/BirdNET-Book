import { useEffect } from "react";

import { isPhotoUrl } from "~/lib/illustrations.ts";

/** What the tab shows on any page that cannot name a bird of its own. */
export const DEFAULT_FAVICON = "/songbook.svg";

/** The icon for `href`: a reference photo is never a favicon, so it gets the default. */
export function faviconHref(href: string | null): string {
	return href && !isPhotoUrl(href) ? href : DEFAULT_FAVICON;
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
export function useFavicon(href: string | null) {
	useEffect(() => {
		const link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
		if (!link) return;

		link.setAttribute("href", faviconHref(href));
		return () => link.setAttribute("href", DEFAULT_FAVICON);
	}, [href]);
}
