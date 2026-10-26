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

/** The reset a page that just unmounted has asked for, until the next page
    either claims the tab or lets it happen. */
let pendingReset: ReturnType<typeof setTimeout> | undefined;

/** The icon each history entry last showed, by the router's entry key. */
const iconByEntry = new Map<string, string>();

function entryKey(): string | undefined {
	return (history.state as { key?: string } | null)?.key;
}

function showIcon(link: HTMLLinkElement, href: string) {
	link.setAttribute("href", href);
	const key = entryKey();
	if (key) iconByEntry.set(key, href);
}

// Back and Forward: the browser puts back the icon it remembers for the entry
// straight away, then rereads the page's link -- which still names the page
// being left until React renders the one arrived at, so the tab flickered
// between the two. Pointing the link at the arriving entry's icon in the same
// moment means the page already agrees with the browser.
if (typeof window !== "undefined") {
	window.addEventListener("popstate", () => {
		const href = iconByEntry.get(entryKey() ?? "");
		const link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
		if (href && link) link.setAttribute("href", href);
	});
}

/**
 * Points the tab icon at `href` while the calling component is mounted, and
 * puts the default back once it's gone. `undefined` means the page doesn't know
 * its picture yet: the tab keeps whatever it shows rather than flashing a
 * stand-in while the data loads.
 *
 * The way back to the default waits a tick: a page that takes over the tab in
 * the same navigation cancels it, so going from one bird page to another never
 * shows the mark in between. A page that doesn't claim the tab lets it run.
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
	href: string | null | undefined,
	fallback: string = DEFAULT_FAVICON,
) {
	useEffect(() => {
		const link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
		if (!link) return;

		clearTimeout(pendingReset);
		if (href !== undefined) showIcon(link, faviconHref(href, fallback));
		return () => {
			pendingReset = setTimeout(() => showIcon(link, DEFAULT_FAVICON), 0);
		};
	}, [href, fallback]);
}

/** A bird page's tab: its bird's painting, or the nest when it has none. */
export function useBirdFavicon(href: string | null | undefined) {
	useFavicon(href, NEST_FAVICON);
}
