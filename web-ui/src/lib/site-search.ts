import Fuse from "fuse.js";

/** One species the station has heard, as the sidebar search knows it. */
export type SearchSpecies = { comName: string; sciName: string; count: number };

/** A nav destination search can jump to. `to` is the route path. */
export type SearchPage = { label: string; to: string };

export type SiteSearchResults<P extends SearchPage = SearchPage> = {
	species: SearchSpecies[];
	pages: P[];
};

const MAX_SPECIES = 6;

/**
 * What the sidebar's search shows for a query. Pure, so the matching can be
 * tested without a station behind it.
 *
 * Species use the same Fuse settings as the Species page and the detections
 * filter, so a name found here is one those pages will find too. Pages are a
 * short fixed list, so a plain prefix-of-any-word match is enough and never
 * surprises: "set" finds Settings, "s" finds Species and Settings.
 */
export function searchSite<P extends SearchPage>(
	query: string,
	species: readonly SearchSpecies[],
	pages: readonly P[],
): SiteSearchResults<P> {
	const needle = query.trim().toLowerCase();
	if (needle === "") return { species: [], pages: [] };

	const fuse = new Fuse(species, {
		keys: ["comName", "sciName"],
		threshold: 0.2,
		ignoreLocation: true,
	});

	return {
		species: fuse
			.search(needle, { limit: MAX_SPECIES })
			.map((result) => result.item),
		pages: pages.filter((page) =>
			page.label
				.toLowerCase()
				.split(/\s+/)
				.some((word) => word.startsWith(needle)),
		),
	};
}
