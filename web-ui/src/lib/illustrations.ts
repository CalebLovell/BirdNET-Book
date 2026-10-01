// Locally-bundled kachō-e style illustrations pulled from Twarner491/AvianVisitors
// (see public/illustrations/ATTRIBUTION.md) for the species detected in this
// project's own birds.db. A species without one shows the generic bird glyph
// (see SpeciesImage) -- never a photo from elsewhere.
const AVAILABLE_SLUGS = new Set([
	"agelaius-phoeniceus",
	"archilochus-colubris",
	"baeolophus-bicolor",
	"bombycilla-cedrorum",
	"bubo-virginianus",
	"cardinalis-cardinalis",
	"corvus-brachyrhynchos",
	"cyanocitta-cristata",
	"dryobates-pubescens",
	"gavia-immer",
	"haemorhous-mexicanus",
	"junco-hyemalis",
	"megascops-asio",
	"melospiza-melodia",
	"passer-domesticus",
	"poecile-atricapillus",
	"quiscalus-quiscula",
	"sitta-canadensis",
	"sitta-carolinensis",
	"spinus-tristis",
	"strix-varia",
	"sturnus-vulgaris",
	"thryothorus-ludovicianus",
	"turdus-migratorius",
	"zenaida-macroura",
	"zonotrichia-albicollis",
]);

/**
 * Every bundled species ships two poses. "perched" reads clearly at thumbnail
 * size, so it stays the default for lists; "flight" is for the large hero
 * slots where the spread wings have room.
 */
export type IllustrationPose = "perched" | "flight";

function slugify(sciName: string): string {
	return sciName.trim().toLowerCase().replaceAll(/\s+/g, "-");
}

export function illustrationUrlFor(
	sciName: string,
	pose: IllustrationPose = "perched",
): string | null {
	const slug = slugify(sciName);
	if (!AVAILABLE_SLUGS.has(slug)) return null;
	return `/illustrations/${slug}${pose === "flight" ? "-2" : ""}.png`;
}
