import { commonNameSafe } from "~/lib/audio.ts";

export type ReviewSearch = { page: number };
/** Queue rows per page: ten 54px rows fill the rail beside the recording. */
export const REVIEW_PAGE_SIZE = 10;
export type SpeciesOption = { sciName: string; comName: string };

export function normalizeReviewSearch(
	input: Record<string, unknown>,
): ReviewSearch {
	const page =
		typeof input.page === "number" &&
		Number.isSafeInteger(input.page) &&
		input.page >= 1
			? input.page
			: 1;
	return { page };
}

export function parseSpeciesCatalog(text: string): SpeciesOption[] {
	const parsed = JSON.parse(text) as Record<string, unknown>;
	return Object.entries(parsed)
		.filter(
			(entry): entry is [string, string] =>
				entry[0].trim().length > 0 &&
				typeof entry[1] === "string" &&
				entry[1].trim().length > 0,
		)
		.map(([sciName, comName]) => ({ sciName, comName }))
		.sort((a, b) => a.comName.localeCompare(b.comName));
}

export function recategorizedFileName(
	fileName: string,
	oldCommonName: string,
	newCommonName: string,
): string | null {
	const prefix = `${commonNameSafe(oldCommonName)}-`;
	return fileName.startsWith(prefix)
		? `${commonNameSafe(newCommonName)}-${fileName.slice(prefix.length)}`
		: null;
}
