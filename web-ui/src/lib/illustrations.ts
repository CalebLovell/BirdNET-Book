import { NEW_FLIGHT_SLUGS, NEW_SLUGS } from "~/lib/illustrations-new.ts";

// The kachō-e style illustrations painted with tools/illustrate
// (public/illustrations-new/, listed in illustrations-new.ts). A species
// without one shows the generic bird glyph (see SpeciesImage) -- never a
// photo from elsewhere.

/**
 * "perched" reads clearly at thumbnail size, so it stays the default for
 * lists; "flight" is for the large hero slots where the spread wings have room.
 */
export type IllustrationPose = "perched" | "flight";

function slugify(sciName: string): string {
	return sciName.trim().toLowerCase().replaceAll(/\s+/g, "-");
}

/**
 * The species' picture, or null when it has none. A species painted perched
 * only shows that pose in the flight slot too.
 */
export function illustrationUrlFor(
	sciName: string,
	pose: IllustrationPose = "perched",
): string | null {
	const slug = slugify(sciName);
	if (!NEW_SLUGS.has(slug)) return null;
	const flight = pose === "flight" && NEW_FLIGHT_SLUGS.has(slug);
	return `/illustrations-new/${slug}${flight ? "-2" : ""}.png`;
}
