import {
	ExternalLink,
	Search,
	ShieldCheck,
	Shuffle,
	SkipForward,
	Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { ConfidencePill } from "~/components/confidence-pill.tsx";
import { IndexDot } from "~/components/index-dot.tsx";
import { ClipPlayer } from "~/components/learn/clip-player.tsx";
import { SpeciesImage } from "~/components/species-image.tsx";
import { SpeciesThumbnail } from "~/components/species-row.tsx";
import { Button } from "~/components/ui/button.tsx";
import { Input } from "~/components/ui/input.tsx";
import { PageStepper } from "~/components/ui/page-stepper.tsx";
import { formatConfidence } from "~/lib/confidence.ts";
import type { ReviewCandidate, ReviewPage } from "~/lib/review.server.ts";
import type { SpeciesOption } from "~/lib/review-data.ts";

/** A queue row's height: the 40px thumbnail and 7px above and below it. */
const ROW_HEIGHT_PX = 54;

type Action =
	| { kind: "correct"; row: ReviewCandidate }
	| { kind: "delete"; row: ReviewCandidate }
	| { kind: "recategorize"; row: ReviewCandidate; species: SpeciesOption };

/** "Jul 27, 2026" and "6:04 AM" from the detection's separate date/time columns. */
function formatRecorded(date: string, time: string) {
	const parsed = new Date(`${date}T${time}`);
	if (Number.isNaN(parsed.getTime())) return { day: date, clock: time };
	return {
		day: new Intl.DateTimeFormat(undefined, {
			month: "short",
			day: "numeric",
			year: "numeric",
		}).format(parsed),
		clock: new Intl.DateTimeFormat(undefined, {
			hour: "numeric",
			minute: "2-digit",
		}).format(parsed),
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
				className="feature-card rounded-md p-4 text-center"
			>
				{/* The same empty-nest artwork the Today hero falls back to, so a
				    cleared queue reads as a state of the station, not a broken page. */}
				<img
					src="/illustrations/nest.webp"
					alt=""
					className="mx-auto h-32 object-contain"
				/>
				<h2 className="display-title mt-2 font-bold text-xl">All caught up</h2>
				<p className="mt-1 text-muted-foreground text-sm">
					{page.page < pageCount
						? "Nothing left on this page."
						: "No more recordings in the queue."}
				</p>
				{page.page < pageCount ? (
					<Button
						className="mt-4"
						variant="outline"
						size="xs"
						onClick={() => onPageChange(page.page + 1)}
					>
						Next page
					</Button>
				) : null}
			</section>
		);
	const recorded = formatRecorded(row.date, row.time);
	const position = rows.indexOf(row);
	return (
		<>
			{/* The recording under review takes the width; the rest of the queue sits
			    beside it so the batch is visible and any bird can be picked next,
			    instead of one card floating on an empty page. */}
			{/* Same tracks as the Learn page's game and round rail, so the queue
			    card sits at the round card's width at every page size. */}
			<div className="@container/review">
				<div className="grid @3xl/review:grid-cols-[minmax(0,1fr)_24rem] @7xl/review:grid-cols-[minmax(914px,1fr)_minmax(20rem,38rem)] items-start gap-(--page-gap)">
					<section
						aria-label="Detection under review"
						className="feature-card flex flex-col gap-4 rounded-md p-4"
					>
						<div className="flex items-center gap-4 max-[400px]:gap-3">
							<div className="flex size-20 shrink-0 items-center justify-center overflow-hidden max-[400px]:size-14">
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
						<div className="tabular-data flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-sm">
							<ConfidencePill confidence={row.confidence} />
							<span>{describeLifetime(row.lifetimeCount)}</span>
							<span>
								{recorded.day}, {recorded.clock}
							</span>
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
					<section
						aria-label="Review queue"
						className="@container feature-card flex flex-col rounded-md p-4"
					>
						<div className="-mx-(--page-gap) -mt-(--page-gap) flex min-h-[45px] items-center justify-between gap-2 border-b px-(--page-gap)">
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
											className={`flex min-h-[54px] w-full items-center @min-[26rem]:gap-3 gap-2 px-(--page-gap) py-1.75 text-left transition-colors duration-[180ms] ${current ? "bg-[var(--row-selected)]" : "hover:bg-[var(--meadow)]"}`}
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
													{when.day} · {when.clock}
												</span>
											</span>
											<span className="@min-[26rem]:block hidden shrink-0 text-right">
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
						<div className="-mx-(--page-gap) mt-auto -mb-(--page-gap) flex shrink-0 items-center border-t px-(--page-gap) py-2">
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
							<Search className="absolute top-2.5 left-3 size-4 text-muted-foreground" />
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
							<Button variant="outline" onClick={() => setPicker(null)}>
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
								disabled={busy}
								onClick={() => setAction(null)}
							>
								Cancel
							</Button>
							<Button
								variant={action.kind === "delete" ? "destructive" : "default"}
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
