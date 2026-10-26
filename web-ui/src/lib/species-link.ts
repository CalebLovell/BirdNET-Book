import ebirdCodes from "~/lib/ebird-codes.json";
import inaturalistTaxa from "~/lib/inaturalist-taxa.json";

// Scientific name -> eBird's stable 6-char species code, lifted from
// BirdNET-Pi's own scripts/ebird.php lookup table (same source data the
// Twarner491/AvianVisitors fork uses for its atlas view's eBird links).
// eBird's species pages are public at https://ebird.org/species/<code>,
// unlike their search/list pages which redirect anonymous requests to a
// login wall -- so a direct code-based link sidesteps that entirely.
const EBIRD_CODES: Record<string, string> = {
	...ebirdCodes,
	// Birds the V2.4 model still names by a binomial eBird has since retired.
	"Amblyornis newtoniana": "golbow1",
	"Brachypodius melanocephalos": "blhbul1",
	"Leucolia violiceps": "vichum",
};

// The model's non-bird animals -- frogs, crickets, katydids, mammals -- have
// no eBird page, so they link to iNaturalist's taxon page instead. Scientific
// name -> iNaturalist taxon id, looked up once against its public API; the
// numeric id survives the renames a name-based URL wouldn't.
const INATURALIST_TAXA: Record<string, number> = inaturalistTaxa;

// The model's sound classes: labels for a noise rather than a species, with
// no page anywhere to link.
const SOUND_CLASSES = new Set([
	"Dog",
	"Engine",
	"Environmental",
	"Fireworks",
	"Gun",
	"Human",
	"Human non-vocal",
	"Human vocal",
	"Human whistle",
	"Noise",
	"Non-Bird",
	"Power tools",
	"Siren",
]);

export type SpeciesLink = { href: string; site: "eBird" | "iNaturalist" };

export function speciesLinkFor(sciName: string): SpeciesLink | null {
	const code = EBIRD_CODES[sciName];
	if (code) return { href: `https://ebird.org/species/${code}`, site: "eBird" };
	if (SOUND_CLASSES.has(sciName)) return null;
	const taxon = INATURALIST_TAXA[sciName];
	// A name in neither table (an older model's label, say) gets iNaturalist's
	// public taxon search, which also resolves retired synonyms.
	const href = taxon
		? `https://www.inaturalist.org/taxa/${taxon}`
		: `https://www.inaturalist.org/taxa/search?q=${encodeURIComponent(sciName)}`;
	return { href, site: "iNaturalist" };
}
