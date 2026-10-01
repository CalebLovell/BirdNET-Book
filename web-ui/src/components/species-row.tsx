import { SpeciesImage } from "~/components/species-image.tsx";

/**
 * The shared row shell for the ranked species lists. Lists that sit side by
 * side share one row height: the taller card (the one with progress bars) sets
 * it, and the shorter one pads out to match rather than drifting out of
 * alignment down the column.
 */
export const LIST_ROW =
	"flex min-h-18 items-center gap-3 rounded-md px-3 py-2 odd:bg-[var(--meadow)] max-[400px]:gap-2 max-[400px]:px-2";

export function SpeciesThumbnail({
	imageUrl,
	comName,
}: {
	imageUrl: string | null;
	comName: string;
}) {
	return (
		<div className="flex size-10 shrink-0 items-center justify-center overflow-hidden">
			<SpeciesImage
				imageUrl={imageUrl}
				alt=""
				title={comName}
				glyphClassName="size-5"
			/>
		</div>
	);
}
