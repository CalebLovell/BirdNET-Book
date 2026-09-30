import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";

import { ConfidencePill } from "~/components/confidence-pill.tsx";
import { EmptyNote } from "~/components/empty-state.tsx";
import { RecordingButton } from "~/components/recording-button.tsx";
import { SpeciesThumbnail } from "~/components/species-row.tsx";
import { PageStepper } from "~/components/ui/page-stepper.tsx";
import {
	getRecentPage,
	RECENT_PAGE_SIZE,
	type RecentDetection,
	type RecentPage,
	recentPageCount,
} from "~/lib/now.ts";
import { formatClockTime, formatTimeAgo } from "~/lib/time-ago.ts";
import { useAgeOffset } from "~/lib/use-age-offset.ts";

/** A row's height: the 40px thumbnail and 7px above and below it. Paged, the
    list holds a full page's height, so a short last page never pulls the
    pager up from under the cursor. */
const ROW_HEIGHT_PX = 54;

/**
 * The window's detections, newest first, set like the species page's visit
 * log: a header band with the window's count, zebra rows bled to the card's
 * edges, and a layout that answers to the card's own width rather than the
 * screen's -- the card spans the page on a phone and takes the wider track
 * beside the rail at lg.
 *
 * Page one is the snapshot the page polls, so it stays live. A later page is
 * fetched when stepped to, and again on every poll, so it keeps pace as new
 * birds push the older ones down.
 */
export function RecentLogCard({
	recent,
	recentTotal,
	generatedAt,
	totalDetections,
	freshKeys,
}: {
	/** Page one, from the polled snapshot. */
	recent: RecentDetection[];
	/** Every row the log can page through. */
	recentTotal: number;
	/** When the snapshot was built; a new one re-fetches a later page. */
	generatedAt: string;
	/** Every detection in the window, the hero's included. */
	totalDetections: number;
	freshKeys: Set<string>;
}) {
	const fetchPage = useServerFn(getRecentPage);
	const [page, setPage] = useState(1);
	const [fetched, setFetched] = useState<RecentPage | null>(null);
	const firstPage = useMemo<RecentPage>(
		() => ({ page: 1, recent, recentTotal, generatedAt }),
		[recent, recentTotal, generatedAt],
	);
	const pageCount = recentPageCount(firstPage.recentTotal);

	// The window slides, so the page someone is on can stop existing.
	useEffect(() => {
		if (page > pageCount) setPage(pageCount);
	}, [page, pageCount]);

	// `generatedAt` is the re-fetch trigger: each poll brings a later page up
	// to date, not just stepping to it.
	// biome-ignore lint/correctness/useExhaustiveDependencies: re-fetch trigger
	useEffect(() => {
		if (page === 1) return;
		let cancelled = false;
		fetchPage({ data: { page } }).then((data) => {
			if (!cancelled) setFetched(data);
		});
		return () => {
			cancelled = true;
		};
	}, [page, generatedAt, fetchPage]);

	// Until the next page lands the previous one stays up, dimmed, so paging
	// never collapses the card to nothing.
	const current =
		page === 1 ? firstPage : fetched?.page === page ? fetched : null;
	const [held, setHeld] = useState(firstPage);
	useEffect(() => {
		if (current) setHeld(current);
	}, [current]);
	const shown = current ?? held;
	const loading = !current;
	const offsetMs = useAgeOffset(shown.generatedAt);
	const paged = pageCount > 1;

	return (
		<section
			aria-label="Recent detections"
			className="@container feature-card flex flex-col rounded-md p-4"
		>
			{/* The visit log's header band: a full-width hairline under a 45px
			    strip, the count held right. */}
			<div className="-mx-(--page-gap) -mt-(--page-gap) flex min-h-[45px] flex-wrap items-center justify-between gap-2 border-b px-(--page-gap)">
				<div className="island-kicker">Recent activity</div>
				{totalDetections > 0 ? (
					<div className="tabular-data text-muted-foreground text-xs">
						{totalDetections.toLocaleString()}{" "}
						{totalDetections === 1 ? "detection" : "detections"} in 24 hours
					</div>
				) : null}
			</div>

			{shown.recent.length === 0 ? (
				<EmptyNote>No detections recorded in the last 24 hours.</EmptyNote>
			) : (
				<ul
					aria-busy={loading}
					style={
						paged ? { minHeight: RECENT_PAGE_SIZE * ROW_HEIGHT_PX } : undefined
					}
					className={`-mx-(--page-gap) transition-opacity ${paged ? "" : "-mb-(--page-gap)"} ${loading ? "opacity-50" : ""}`}
				>
					{shown.recent.map((detection) => {
						const clock = formatClockTime(detection.detectedAt);
						const age = formatTimeAgo(detection.ageMs + offsetMs);

						return (
							<li
								key={detection.key}
								// Under 26rem the row can't hold the names, a time column,
								// the pill and a labelled button side by side, so the age
								// and time take the binomial's line and the button drops its
								// label. Two lines either way, so the row keeps its height.
								//
								// The zebra runs out to the card's edges and the row's own
								// padding hands the page gap back, so the content lines up
								// with the header's.
								className={`flex items-center @min-[26rem]:gap-3 gap-2 px-(--page-gap) py-1.75 odd:bg-[var(--meadow)] even:bg-transparent ${shown.page === 1 && freshKeys.has(detection.key) ? "flash-in" : ""}`}
							>
								<SpeciesThumbnail
									imageUrl={detection.imageUrl}
									comName={detection.comName}
								/>

								<div className="min-w-0 flex-1">
									<Link
										to="/species/$comName"
										params={{ comName: detection.speciesSlug }}
										className="block truncate font-medium no-underline hover:underline"
									>
										{detection.comName}
									</Link>
									<div className="@min-[26rem]:block hidden truncate text-[var(--bark)] text-xs italic">
										{detection.sciName}
									</div>
									<div className="tabular-data @min-[26rem]:hidden truncate text-muted-foreground text-xs">
										{age} · {clock}
									</div>
								</div>

								<div className="@min-[26rem]:block hidden shrink-0 text-right">
									<div className="tabular-data text-sm">{age}</div>
									<time
										dateTime={detection.detectedAt.replace(" ", "T")}
										className="tabular-data block text-muted-foreground text-xs"
									>
										{clock}
									</time>
								</div>

								<ConfidencePill
									confidence={detection.confidence}
									className="shrink-0"
								/>
								<RecordingButton
									audioUrl={detection.audioUrl}
									labelClassName="@min-[26rem]:inline hidden"
									className="@min-[26rem]:w-auto w-6 @min-[26rem]:px-2.5 px-0"
								/>
							</li>
						);
					})}
				</ul>
			)}

			{/* The visit log's footer: a hairline across the card's full width,
			    the stepper held right. */}
			{paged ? (
				<div className="-mx-(--page-gap) mt-auto -mb-(--page-gap) flex shrink-0 items-center border-t px-(--page-gap) py-2">
					<PageStepper
						className="ml-auto"
						label="Recent activity pages"
						page={Math.min(page, pageCount)}
						pageCount={pageCount}
						onPageChange={setPage}
					/>
				</div>
			) : null}
		</section>
	);
}
