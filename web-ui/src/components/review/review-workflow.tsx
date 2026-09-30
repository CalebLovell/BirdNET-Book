import {
	Bird,
	ExternalLink,
	Search,
	ShieldCheck,
	Shuffle,
	SkipForward,
	Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { ConfidencePill } from "~/components/confidence-pill.tsx";
import { ClipPlayer } from "~/components/learn/clip-player.tsx";
import { SpeciesThumbnail } from "~/components/species-row.tsx";
import { Button } from "~/components/ui/button.tsx";
import { Input } from "~/components/ui/input.tsx";
import { formatConfidence } from "~/lib/confidence.ts";
import type { ReviewCandidate, ReviewPage } from "~/lib/review.server.ts";
import type { SpeciesOption } from "~/lib/review-data.ts";

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
	onLoadMore,
}: {
	page: ReviewPage;
	species: SpeciesOption[];
	busy: boolean;
	onCorrect: (rowId: number) => Promise<void>;
	onRecategorize: (rowId: number, species: SpeciesOption) => Promise<void>;
	onDelete: (rowId: number) => Promise<void>;
	onLoadMore: () => void;
}) {
	const [index, setIndex] = useState(0);
	const [skipped, setSkipped] = useState<Set<number>>(new Set());
	const [action, setAction] = useState<Action | null>(null);
	const [picker, setPicker] = useState<ReviewCandidate | null>(null);
	const [query, setQuery] = useState("");
	const rows = page.candidates.filter((row) => !skipped.has(row.rowId));
	const row = rows[Math.min(index, Math.max(0, rows.length - 1))];
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
					No more recordings in this batch.
				</p>
				{page.total > page.candidates.length ? (
					<Button
						className="mt-4"
						variant="outline"
						size="xs"
						onClick={onLoadMore}
					>
						Load more
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
								{row.imageUrl ? (
									<img
										src={row.imageUrl}
										alt={row.comName}
										className="max-h-full max-w-full object-contain"
									/>
								) : (
									<Bird className="size-10 text-muted-foreground" />
								)}
							</div>
							<div className="min-w-0 flex-1">
								<div className="island-kicker">
									Recording {position + 1} of {rows.length}
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

					<section
						aria-label="Review queue"
						className="feature-card rounded-md p-4"
					>
						<div className="flex items-baseline justify-between gap-2">
							<div className="island-kicker">In the queue</div>
							<span className="count-figure">
								{page.total > page.candidates.length
									? `${rows.length} of ${page.total}`
									: rows.length}
							</span>
						</div>
						<ol className="-mx-1 mt-3 max-h-[32rem] space-y-0.5 overflow-auto px-1">
							{rows.map((item, i) => {
								const current = item === row;
								return (
									<li key={item.rowId}>
										<button
											type="button"
											aria-current={current ? "true" : undefined}
											onClick={() => setIndex(i)}
											className={`flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors duration-[180ms] ${current ? "bg-[var(--row-selected)]" : "hover:bg-[var(--meadow)]"}`}
										>
											<SpeciesThumbnail
												imageUrl={item.imageUrl}
												comName={item.comName}
											/>
											<span className="min-w-0 flex-1">
												<span className="block truncate font-medium text-sm">
													{item.comName}
												</span>
												<span className="tabular-data block truncate text-muted-foreground text-xs">
													{formatRecorded(item.date, item.time).day}
												</span>
											</span>
											<ConfidencePill confidence={item.confidence} />
										</button>
									</li>
								);
							})}
						</ol>
						{page.total > page.candidates.length ? (
							<Button
								className="mt-3 w-full"
								variant="outline"
								size="xs"
								onClick={onLoadMore}
							>
								Load more
							</Button>
						) : null}
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
