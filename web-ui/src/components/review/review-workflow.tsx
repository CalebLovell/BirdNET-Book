import {
	ArrowRight,
	Check,
	ExternalLink,
	Search,
	ShieldCheck,
	Shuffle,
	SkipForward,
	Trash2,
	X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { CardHeader } from "~/components/card-header.tsx";
import { ConfidencePill } from "~/components/confidence-pill.tsx";
import { EmptyNote } from "~/components/empty-state.tsx";
import { IndexDot } from "~/components/index-dot.tsx";
import { ClipPlayer } from "~/components/learn/clip-player.tsx";
import { SpeciesImage } from "~/components/species-image.tsx";
import { SpeciesThumbnail } from "~/components/species-row.tsx";
import { Button } from "~/components/ui/button.tsx";
import { Input } from "~/components/ui/input.tsx";
import { PageStepper } from "~/components/ui/page-stepper.tsx";
import { ShellBar, ShellSized, ShellText } from "~/components/ui/shell.tsx";
import { formatConfidence } from "~/lib/confidence.ts";
import { formatDate, formatDateTime } from "~/lib/date-format.ts";
import type { ReviewCandidate, ReviewPage } from "~/lib/review.server.ts";
import { REVIEW_PAGE_SIZE, type SpeciesOption } from "~/lib/review-data.ts";

/** A queue row's height: the 40px thumbnail and 7px above and below it. */
const ROW_HEIGHT_PX = 54;

// Shared by the workflow and its skeleton, so the two are one shape.
const REVIEW_GRID_CLASS =
	"grid @3xl/review:grid-cols-[minmax(0,1fr)_24rem] @7xl/review:grid-cols-[minmax(914px,1fr)_minmax(20rem,38rem)] items-start gap-(--page-gap)";
const UNDER_REVIEW_CLASS = "feature-card flex flex-col gap-4 rounded-md p-4";
const IDENTITY_ROW_CLASS = "flex items-center gap-4 max-[400px]:gap-3";
const PORTRAIT_CLASS =
	"flex size-20 shrink-0 items-center justify-center overflow-hidden max-[400px]:size-14";
const EVIDENCE_LINE_CLASS =
	"tabular-data flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-sm";
const QUEUE_CARD_CLASS = "@container feature-card flex flex-col rounded-md p-4";
const QUEUE_HEADER_CLASS =
	"-mx-(--page-gap) -mt-(--page-gap) flex min-h-[45px] items-center justify-between gap-2 border-b px-(--page-gap)";
const QUEUE_ROW_CLASS =
	"flex min-h-[54px] w-full items-center @min-[26rem]:gap-3 gap-2 px-(--page-gap) py-1.75";
const QUEUE_TIME_CLASS = "@min-[26rem]:block hidden shrink-0 text-right";
const QUEUE_FOOTER_CLASS =
	"-mx-(--page-gap) mt-auto -mb-(--page-gap) flex shrink-0 items-center border-t px-(--page-gap) py-2";

const NAME_WIDTHS = ["w-36", "w-28", "w-40", "w-32"];

/**
 * The workflow before its queue arrives, built from its own pieces: the
 * recording under review -- the portrait's square, bars for its kicker, name
 * and binomial, shells the size of the eBird link and the pill, the clip's
 * slot with the play button's circle, and its four action buttons as
 * themselves, disabled -- beside a full page of queue rows and the pager.
 */
export function ReviewWorkflowSkeleton() {
	return (
		<div className="@container/review">
			<div className={REVIEW_GRID_CLASS}>
				<section
					aria-busy="true"
					aria-label="Detection under review"
					className={UNDER_REVIEW_CLASS}
				>
					<div aria-hidden="true" className={IDENTITY_ROW_CLASS}>
						<div className={PORTRAIT_CLASS}>
							<ShellBar className="size-full rounded-md" />
						</div>
						<div className="min-w-0 flex-1">
							<ShellText className="island-kicker" barClassName="w-32" />
							<ShellText
								className="display-title mt-1 font-bold text-2xl sm:text-3xl"
								barClassName="w-56 max-w-full"
							/>
							<ShellText className="text-sm" barClassName="w-36" />
						</div>
						<ShellSized className="self-start rounded-md">
							<Button variant="outline" size="xs">
								<ExternalLink />
								<span className="max-sm:hidden">eBird reference</span>
							</Button>
						</ShellSized>
					</div>
					<div aria-hidden="true" className={EVIDENCE_LINE_CLASS}>
						<ShellSized className="rounded-full">
							<ConfidencePill confidence={0.5} />
						</ShellSized>
						<ShellText className="w-28" barClassName="w-full" />
						<ShellText className="w-40" barClassName="w-full" />
					</div>
					<div
						aria-hidden="true"
						className="relative flex h-56 items-center justify-center max-sm:h-40"
					>
						<ShellBar className="absolute inset-0 rounded-md opacity-60" />
						<ShellBar className="relative size-16 rounded-full max-[400px]:size-12" />
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<Button size="xs" disabled>
							<ShieldCheck />
							Correct
						</Button>
						<Button variant="outline" size="xs" disabled>
							<Shuffle />
							Recategorize
						</Button>
						<div className="ml-auto flex items-center gap-2">
							<Button variant="ghost" size="xs" disabled>
								<SkipForward />
								Skip
							</Button>
							<Button variant="destructive" size="xs" disabled>
								<Trash2 />
								Delete
							</Button>
						</div>
					</div>
				</section>

				<section
					aria-busy="true"
					aria-label="Review queue"
					className={QUEUE_CARD_CLASS}
				>
					<div className={QUEUE_HEADER_CLASS}>
						<div className="island-kicker">In the queue</div>
						<ShellText
							className="count-figure w-10"
							barClassName="right-0 left-auto w-full"
						/>
					</div>
					<ol aria-hidden="true" className="-mx-(--page-gap) divide-y">
						{Array.from({ length: REVIEW_PAGE_SIZE }, (_, index) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: static decoration
							<li key={index}>
								<div className={QUEUE_ROW_CLASS}>
									<ShellSized className="rounded-full">
										<IndexDot index={88} widest={88} />
									</ShellSized>
									<div className="flex size-10 shrink-0 items-center justify-center">
										<ShellBar className="size-9 rounded-md" />
									</div>
									<span className="min-w-0 flex-1">
										<ShellText
											className="font-medium"
											barClassName={NAME_WIDTHS[index % NAME_WIDTHS.length]}
										/>
										<ShellText className="text-xs" barClassName="w-24" />
									</span>
									<span className={QUEUE_TIME_CLASS}>
										<ShellText
											className="w-14 text-sm"
											barClassName="right-0 left-auto w-full"
										/>
										<ShellText
											className="w-14 text-xs"
											barClassName="right-0 left-auto w-full"
										/>
									</span>
									<ShellSized className="rounded-full">
										<ConfidencePill confidence={0.5} className="shrink-0" />
									</ShellSized>
								</div>
							</li>
						))}
					</ol>
					<div className={QUEUE_FOOTER_CLASS}>
						<span className="ml-auto">
							<ShellSized className="rounded-md">
								<PageStepper
									label="Review queue pages"
									page={1}
									pageCount={20}
									onPageChange={() => {}}
								/>
							</ShellSized>
						</span>
					</div>
				</section>
			</div>
		</div>
	);
}

type Action =
	| { kind: "correct"; row: ReviewCandidate }
	| { kind: "delete"; row: ReviewCandidate }
	| { kind: "recategorize"; row: ReviewCandidate; species: SpeciesOption };

/** "Jul 27, 2026" and "6:04 AM", for the queue's stacked date-over-time
    column; everywhere else the two travel together as formatDateTime. */
function formatRecorded(date: string, time: string) {
	return {
		day: formatDate(date),
		clock: formatDateTime(date, time).split(", ").at(-1) ?? time,
	};
}

/** How established the species is here -- the reason it's in the queue. */
function describeLifetime(count: number) {
	return count <= 1 ? "First time heard here" : `Heard ${count} times here`;
}

export function ReviewWorkflow({
	page,
	species,
	busy,
	onCorrect,
	onRecategorize,
	onDelete,
	onPageChange,
}: {
	page: ReviewPage;
	species: SpeciesOption[];
	busy: boolean;
	onCorrect: (rowId: number) => Promise<void>;
	onRecategorize: (rowId: number, species: SpeciesOption) => Promise<void>;
	onDelete: (rowId: number) => Promise<void>;
	onPageChange: (page: number) => void;
}) {
	const [index, setIndex] = useState(0);
	const [skipped, setSkipped] = useState<Set<number>>(new Set());
	const [action, setAction] = useState<Action | null>(null);
	const [picker, setPicker] = useState<ReviewCandidate | null>(null);
	const [query, setQuery] = useState("");
	const rows = page.candidates.filter((row) => !skipped.has(row.rowId));
	const row = rows[Math.min(index, Math.max(0, rows.length - 1))];
	const pageCount = Math.max(1, Math.ceil(page.total / page.pageSize));
	const paged = pageCount > 1;
	/** A recording's place in the whole queue, counted from one. Skipping a
	    bird hides it without renumbering the rest. */
	const queueNumber = (item: ReviewCandidate) =>
		(page.page - 1) * page.pageSize + page.candidates.indexOf(item) + 1;
	/** The page's largest number, so every dot on it is the same width. */
	const widest = (page.page - 1) * page.pageSize + page.candidates.length;
	const matches = useMemo(() => {
		const q = query.trim().toLowerCase();
		return (
			q
				? species.filter((s) =>
						`${s.comName} ${s.sciName}`.toLowerCase().includes(q),
					)
				: species
		).slice(0, 100);
	}, [query, species]);
	async function confirm() {
		if (!action) return;
		if (action.kind === "correct") await onCorrect(action.row.rowId);
		else if (action.kind === "delete") await onDelete(action.row.rowId);
		else await onRecategorize(action.row.rowId, action.species);
		setAction(null);
		setIndex(0);
	}
	if (!row)
		return (
			<section
				aria-label="Review queue"
				className="feature-card rounded-md p-4"
			>
				<CardHeader title="Review queue">
					{page.page < pageCount ? (
						<Button
							variant="outline"
							size="xs"
							icon={ArrowRight}
							iconPosition="end"
							onClick={() => onPageChange(page.page + 1)}
						>
							Next page
						</Button>
					) : null}
				</CardHeader>
				<EmptyNote>
					{page.page < pageCount
						? "All caught up. Nothing left on this page."
						: "All caught up. No more recordings in the queue."}
				</EmptyNote>
			</section>
		);
	const position = rows.indexOf(row);
	return (
		<>
			{/* The recording under review takes the width; the rest of the queue sits
			    beside it so the batch is visible and any bird can be picked next,
			    instead of one card floating on an empty page. */}
			{/* Same tracks as the Learn page's game and round rail, so the queue
			    card sits at the round card's width at every page size. */}
			<div className="@container/review">
				<div className={REVIEW_GRID_CLASS}>
					<section
						aria-label="Detection under review"
						className={UNDER_REVIEW_CLASS}
					>
						<div className={IDENTITY_ROW_CLASS}>
							<div className={PORTRAIT_CLASS}>
								<SpeciesImage
									imageUrl={row.imageUrl}
									alt={row.comName}
									glyphClassName="size-10"
								/>
							</div>
							<div className="min-w-0 flex-1">
								<div className="island-kicker">
									Recording {queueNumber(row)} of {page.total}
								</div>
								<h2 className="display-title mt-1 font-bold text-2xl text-[var(--moss)] sm:text-3xl">
									{row.comName}
								</h2>
								<p className="text-[var(--bark)] text-sm italic">
									{row.sciName}
								</p>
							</div>
							<Button
								asChild
								variant="outline"
								size="xs"
								className="self-start"
							>
								<a
									href={row.ebirdUrl}
									target="_blank"
									rel="noreferrer"
									aria-label="eBird reference"
								>
									<ExternalLink />
									<span className="max-sm:hidden">eBird reference</span>
								</a>
							</Button>
						</div>

						{/* What the verdict rests on, in one line rather than a row of stat
					    tiles: the score, how new the bird is here, and when it was heard. */}
						<div className={EVIDENCE_LINE_CLASS}>
							<ConfidencePill confidence={row.confidence} />
							<span>{describeLifetime(row.lifetimeCount)}</span>
							<span>{formatDateTime(row.date, row.time)}</span>
						</div>

						{/* The evidence itself: hear the call and see its shape. */}
						{row.audioAvailable ? (
							<ClipPlayer
								key={row.rowId}
								audioUrl={row.audioUrl}
								className="h-56 max-sm:h-40"
							/>
						) : (
							<p className="grid h-40 place-items-center rounded-md border border-[var(--line)] border-dashed px-4 text-center text-destructive text-sm">
								Audio unavailable. You can delete or skip this orphaned entry.
							</p>
						)}

						{/* The verdict pair reads left to right, and the two ways out sit
					    apart from them on the right. */}
						<div className="flex flex-wrap items-center gap-2">
							<Button
								size="xs"
								disabled={!row.audioAvailable || busy}
								onClick={() => setAction({ kind: "correct", row })}
							>
								<ShieldCheck />
								Correct
							</Button>
							<Button
								variant="outline"
								size="xs"
								disabled={!row.audioAvailable || busy}
								onClick={() => setPicker(row)}
							>
								<Shuffle />
								Recategorize
							</Button>
							<div className="ml-auto flex items-center gap-2">
								<Button
									variant="ghost"
									size="xs"
									disabled={busy}
									onClick={() => {
										setSkipped(new Set(skipped).add(row.rowId));
										// The next bird slides into this slot.
										setIndex(position);
									}}
								>
									<SkipForward />
									Skip
								</Button>
								<Button
									variant="destructive"
									size="xs"
									disabled={busy}
									onClick={() => setAction({ kind: "delete", row })}
								>
									<Trash2 />
									Delete
								</Button>
							</div>
						</div>
					</section>

					{/* Set like Today's Recent activity log: a header band, hairline-
					    divided rows bled to the card's edges, and a footer band for
					    the pager. */}
					<section aria-label="Review queue" className={QUEUE_CARD_CLASS}>
						<div className={QUEUE_HEADER_CLASS}>
							<div className="island-kicker">In the queue</div>
							<span className="count-figure">{page.total}</span>
						</div>
						{/* Paged, the list holds a full page's height, so a short last
						    page never pulls the pager up from under the cursor. */}
						<ol
							style={
								paged ? { minHeight: page.pageSize * ROW_HEIGHT_PX } : undefined
							}
							className="-mx-(--page-gap) divide-y"
						>
							{rows.map((item, i) => {
								const current = item === row;
								const when = formatRecorded(item.date, item.time);
								return (
									<li key={item.rowId}>
										{/* Under 26rem the date and time take the binomial's
										    line rather than a column of their own, so the row
										    keeps two lines either way. */}
										<button
											type="button"
											aria-current={current ? "true" : undefined}
											onClick={() => setIndex(i)}
											className={`${QUEUE_ROW_CLASS} text-left transition-colors duration-[180ms] ${current ? "bg-[var(--row-selected)]" : "hover:bg-[var(--meadow)]"}`}
										>
											<IndexDot index={queueNumber(item)} widest={widest} />
											<SpeciesThumbnail
												imageUrl={item.imageUrl}
												comName={item.comName}
											/>
											<span className="min-w-0 flex-1">
												<span className="block truncate font-medium">
													{item.comName}
												</span>
												<span className="@min-[26rem]:block hidden truncate text-[var(--bark)] text-xs italic">
													{item.sciName}
												</span>
												<span className="tabular-data block @min-[26rem]:hidden truncate text-muted-foreground text-xs">
													{formatDateTime(item.date, item.time)}
												</span>
											</span>
											<span className={QUEUE_TIME_CLASS}>
												<span className="tabular-data block text-sm">
													{when.day}
												</span>
												<span className="tabular-data block text-muted-foreground text-xs">
													{when.clock}
												</span>
											</span>
											<ConfidencePill
												confidence={item.confidence}
												className="shrink-0"
											/>
										</button>
									</li>
								);
							})}
						</ol>
						{/* Shown even on a single page, so the card keeps one shape as
						    the queue grows and shrinks. */}
						<div className={QUEUE_FOOTER_CLASS}>
							<PageStepper
								className="ml-auto"
								label="Review queue pages"
								page={page.page}
								pageCount={pageCount}
								onPageChange={onPageChange}
							/>
						</div>
					</section>
				</div>
			</div>
			{picker ? (
				<div
					role="dialog"
					aria-modal="true"
					aria-labelledby="recategorize-review-title"
					className="fixed inset-0 z-50 grid place-items-center bg-black/20 p-4"
				>
					<div className="feature-card flex max-h-[80vh] w-full max-w-xl flex-col rounded-md p-4 shadow-xl">
						<h2
							id="recategorize-review-title"
							className="font-semibold text-lg"
						>
							Choose the correct species
						</h2>
						<div className="relative mt-4">
							<Search
								aria-hidden="true"
								className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
							/>
							<Input
								className="pl-9"
								value={query}
								onChange={(e) => setQuery(e.target.value)}
								placeholder="Search any BirdNET species"
								autoFocus
							/>
						</div>
						{/* p-1 gives the full-width rows' focus rings room inside the
						    scrollport instead of letting it shave them; -m-1 takes it back
						    so the rows still line up with the search box, and mt-2 + the
						    1 of padding restores the original mt-3 gap above the list. */}
						<div className="-m-1 mt-2 min-h-0 flex-1 space-y-1 overflow-auto p-1">
							{matches.map((item) => (
								<button
									type="button"
									// scroll-my-1 matches the list's padding: without it, scrolling
									// a focused row to the top or bottom edge parks it flush
									// against the border box and shaves its ring again.
									className="w-full scroll-my-1 rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
									key={item.sciName}
									onClick={() => {
										setAction({
											kind: "recategorize",
											row: picker,
											species: item,
										});
										setPicker(null);
									}}
								>
									<span className="font-medium">{item.comName}</span>
									<span className="ml-2 text-muted-foreground text-xs italic">
										{item.sciName}
									</span>
								</button>
							))}
						</div>
						<div className="mt-4 flex justify-end">
							<Button
								icon={X}
								variant="outline"
								onClick={() => setPicker(null)}
							>
								Cancel
							</Button>
						</div>
					</div>
				</div>
			) : null}
			{action ? (
				<div
					role="alertdialog"
					aria-modal="true"
					aria-labelledby="confirm-review-title"
					className="fixed inset-0 z-50 grid place-items-center bg-black/20 p-4"
				>
					<div className="feature-card w-full max-w-md rounded-md p-4 shadow-xl">
						<h2 id="confirm-review-title" className="font-semibold text-lg">
							{action.kind === "delete"
								? "Delete this detection?"
								: "Confirm correction"}
						</h2>
						<p className="mt-2 text-muted-foreground text-sm">
							{action.kind === "correct"
								? `Sign off on this ${action.row.comName}? It leaves the queue, and BirdNET's ${formatConfidence(action.row.confidence)} score is kept as recorded.`
								: action.kind === "delete"
									? `This permanently removes the ${action.row.comName} record and its unreferenced audio. This cannot be undone.`
									: `Change this ${action.row.comName} to ${action.species.comName}? The recording is renamed to match and leaves the queue.`}
						</p>
						<div className="mt-4 flex justify-end gap-2">
							<Button
								variant="outline"
								icon={X}
								disabled={busy}
								onClick={() => setAction(null)}
							>
								Cancel
							</Button>
							<Button
								variant={action.kind === "delete" ? "destructive" : "default"}
								icon={action.kind === "delete" ? Trash2 : Check}
								disabled={busy}
								onClick={confirm}
							>
								{busy
									? "Saving…"
									: action.kind === "delete"
										? "Delete detection"
										: "Confirm correction"}
							</Button>
						</div>
					</div>
				</div>
			) : null}
		</>
	);
}
