import { Link } from "@tanstack/react-router";

import { EmptyNote } from "~/components/empty-state.tsx";
import { LIST_ROW, SpeciesThumbnail } from "~/components/species-row.tsx";
import { comNameToSlug } from "~/lib/species-slug.ts";
import { rankingBarPercent } from "~/lib/stats-data.ts";

export type SpeciesListItem = {
	comName: string;
	sciName: string;
	count: number;
	imageUrl: string | null;
	/** Precomputed slug when the caller already has one; derived otherwise. */
	speciesSlug?: string;
};

/**
 * The ranked species list card, shared by "Top detections" on the today page and
 * "Top species" / "Rarest species" on stats, so every ranked list on the site
 * reads as the same object. Bars scale against the leader of their own list
 * rather than a global maximum, which keeps the rare list legible instead of
 * flattening it against the far larger counts of the common birds.
 */
export function SpeciesList({
	title,
	species,
	emptyMessage = "No detections recorded yet.",
	ariaLabel = title,
	className = "",
}: {
	title: string;
	species: SpeciesListItem[];
	emptyMessage?: string;
	/** Defaults to the title; set it when the card needs more context. */
	ariaLabel?: string;
	/** Extra shell classes, e.g. a min-height so cards line up in a grid. */
	className?: string;
}) {
	const maximum = Math.max(...species.map((item) => item.count), 0);

	return (
		<section
			aria-label={ariaLabel}
			className={`feature-card flex flex-col rounded-md p-4 ${className}`}
		>
			<div className="island-kicker">{title}</div>

			{species.length === 0 ? (
				<EmptyNote>{emptyMessage}</EmptyNote>
			) : (
				<ol className="mt-4 space-y-1">
					{species.map((item) => (
						<SpeciesListRow key={item.comName} item={item} maximum={maximum} />
					))}
				</ol>
			)}
		</section>
	);
}

/**
 * A ranked species row: thumbnail, name, count, and a bar scaled against the
 * leader rather than the total, so the shape of the list reads at a glance even
 * when one species dominates.
 */
function SpeciesListRow({
	item,
	maximum,
}: {
	item: SpeciesListItem;
	maximum: number;
}) {
	const { comName, sciName, count, imageUrl } = item;

	return (
		<li className={LIST_ROW}>
			<SpeciesThumbnail imageUrl={imageUrl} comName={comName} />

			<div className="min-w-0 flex-1">
				<div className="flex items-baseline justify-between gap-2">
					<Link
						to="/species/$comName"
						params={{ comName: item.speciesSlug ?? comNameToSlug(comName) }}
						className="truncate font-medium no-underline hover:underline"
					>
						{comName}
					</Link>
					<span className="count-figure shrink-0">
						{count.toLocaleString()}
					</span>
				</div>
				<div className="truncate text-[var(--bark)] text-xs italic">
					{sciName}
				</div>
				<div
					className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--track)]"
					role="img"
					aria-label={`${count} detections`}
				>
					<div
						className="h-full rounded-full"
						style={{
							width: `${rankingBarPercent(count, maximum)}%`,
							backgroundColor: "var(--moss)",
							opacity: 0.75,
						}}
					/>
				</div>
			</div>
		</li>
	);
}
