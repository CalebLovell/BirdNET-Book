import Fuse from "fuse.js";

/** One species the station has heard, as the sidebar search knows it. */
export type SearchSpecies = { comName: string; sciName: string; count: number };

/** A nav destination search can jump to. `to` is the route path. */
export type SearchPage = { label: string; to: string };

/**
 * A Settings card: found by its title, the labels of its fields, or a few
 * extra words that no label says.
 */
export type SearchSetting = {
	title: string;
	fields: string[];
	keywords?: string[];
};

/** A matched card, and the field that matched when it was not the title. */
export type SettingMatch<S extends SearchSetting = SearchSetting> = {
	setting: S;
	field?: string;
};

export type SiteSearchResults<
	P extends SearchPage = SearchPage,
	S extends SearchSetting = SearchSetting,
> = {
	species: SearchSpecies[];
	pages: P[];
	settings: SettingMatch<S>[];
};

const MAX_SPECIES = 6;
const MAX_SETTINGS = 4;

/**
 * Every word of the query starts some word of `text`, so "min conf" finds
 * "Minimum confidence" and "full" finds "Disk-full action".
 */
function matchesWords(text: string, needles: string[]): boolean {
	const words = text.toLowerCase().split(/[\s-]+/);
	return needles.every((needle) =>
		words.some((word) => word.startsWith(needle)),
	);
}

/**
 * What the sidebar's search shows for a query. Pure, so the matching can be
 * tested without a station behind it.
 *
 * Species use the same Fuse settings as the Species page and the detections
 * filter, so a name found here is one those pages will find too. Pages and
 * settings are short fixed lists, so a plain word-prefix match is enough and
 * never surprises: "set" finds Settings, "s" finds Species and Settings.
 */
export function searchSite<P extends SearchPage, S extends SearchSetting>(
	query: string,
	species: readonly SearchSpecies[],
	pages: readonly P[],
	settings: readonly S[] = [],
): SiteSearchResults<P, S> {
	const needle = query.trim().toLowerCase();
	if (needle === "") return { species: [], pages: [], settings: [] };
	const needles = needle.split(/\s+/);

	const fuse = new Fuse(species, {
		keys: ["comName", "sciName"],
		threshold: 0.2,
		ignoreLocation: true,
	});

	const settingMatches: SettingMatch<S>[] = [];
	for (const setting of settings) {
		if (
			matchesWords(setting.title, needles) ||
			setting.keywords?.some((keyword) => matchesWords(keyword, needles))
		) {
			settingMatches.push({ setting });
			continue;
		}
		const field = setting.fields.find((label) => matchesWords(label, needles));
		if (field) settingMatches.push({ setting, field });
	}

	return {
		species: fuse
			.search(needle, { limit: MAX_SPECIES })
			.map((result) => result.item),
		pages: pages.filter((page) => matchesWords(page.label, needles)),
		settings: settingMatches.slice(0, MAX_SETTINGS),
	};
}
