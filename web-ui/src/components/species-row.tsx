import { Bird } from "lucide-react";

/**
 * The shared row shell for the ranked/recent species lists. Top detections and
 * Recent activity sit side by side on the now page, so their rows share one
 * height: the taller card (the one with progress bars) sets it, and the shorter
 * one pads out to match rather than drifting out of alignment down the column.
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
			{imageUrl ? (
				<img
					src={imageUrl}
					alt=""
					title={comName}
					className="max-h-full max-w-full object-contain"
				/>
			) : (
				<Bird className="size-5 text-muted-foreground" />
			)}
		</div>
	);
}
