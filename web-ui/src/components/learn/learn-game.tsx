import { Link } from "@tanstack/react-router";
import { ArrowRight, Check, RotateCcw, Trophy, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { CardHeader } from "~/components/card-header.tsx";
import { RecordingButton } from "~/components/recording-button.tsx";
import { SpeciesImage } from "~/components/species-image.tsx";
import {
	ClipMeta,
	ClipMetaSkeleton,
	SpectrogramPlayer,
	SpectrogramPlayerSkeleton,
} from "~/components/spectrogram-player.tsx";
import { Button } from "~/components/ui/button.tsx";
import { InfoTip } from "~/components/ui/info-tip.tsx";
import { ShellBar, ShellText } from "~/components/ui/shell.tsx";
import { formatDateTime } from "~/lib/date-format.ts";
import { HIGHLIGHT_THRESHOLDS } from "~/lib/highlight-thresholds.ts";
import {
	LEARN_POOL_LABELS,
	LEARN_POOLS,
	learnPoolMeanings,
} from "~/lib/learn-pools.ts";
import {
	CHOICES_PER_QUESTION,
	type LearnChoice,
	type LearnQuestion,
	type LearnRound,
	POINTS_BY_ATTEMPT,
	pointsForAttempt,
	QUESTIONS_PER_ROUND,
	type QuestionResult,
	scoreRound,
} from "~/lib/learn-round.ts";
import { FRESH_PROGRESS, type GameProgress } from "~/lib/learn-saved-game.ts";

/**
 * The quiz itself: play a clip, pick the bird, keep going until the round is
 * done. The round's progress lives here, starting from `initialProgress` and
 * reported through `onProgressChange` so the page can save it; the page starts
 * a fresh round by giving this component a new `key`.
 */
// Shared by the game and its skeleton, so the two are one shape.
const QUIZ_GRID_CLASS =
	"grid @3xl/quiz:grid-cols-[minmax(0,1fr)_24rem] @7xl/quiz:grid-cols-[minmax(914px,1fr)_minmax(20rem,38rem)] items-start gap-(--page-gap)";
const GAME_CARD_CLASS =
	"@container/game feature-card flex min-w-0 flex-col gap-(--page-gap) rounded-md p-4";
const GAME_HEADER_CLASS =
	"-mx-(--page-gap) -mt-(--page-gap) flex min-h-[45px] flex-wrap items-center justify-between gap-x-2 border-b px-(--page-gap) py-2";
// Equal rows: a name that wraps to two lines makes its row taller, and every
// other card stretches to match rather than reading as a smaller button.
const CHOICES_CLASS =
	"grid min-w-0 @xl/game:grid-cols-2 grid-cols-1 auto-rows-fr gap-4 max-[400px]:gap-2";
const CHOICE_CLASS =
	"@container/choice flex items-center gap-4 rounded-md border px-4 py-2 text-left max-[400px]:gap-2 max-[400px]:px-2";
// Always tall enough for a two-line name over the Latin one (snug base or sm
// lines, plus a 16px xs line), so a choice is the same height whatever bird it
// holds and the grid doesn't change size from one question to the next.
const CHOICE_TEXT_CLASS =
	"flex min-h-[calc(2*1.375rem+1rem)] min-w-0 flex-1 flex-col justify-center @max-[20rem]/choice:min-h-[calc(2*1.203125rem+1rem)]";
const RAIL_CLASS = "feature-card @3xl/quiz:flex hidden flex-col rounded-md p-4";
const RAIL_HEADER_CLASS =
	"-mx-(--page-gap) -mt-(--page-gap) flex min-h-[45px] items-center justify-between gap-2 border-b px-(--page-gap)";
const RAIL_ROW_CLASS =
	"flex min-h-[54px] items-center gap-3 px-(--page-gap) py-1.75";
const RAIL_FOOTER_CLASS =
	"-mx-(--page-gap) mt-auto -mb-(--page-gap) flex items-baseline justify-between gap-2 border-t px-(--page-gap) py-3";
// The game's footer under the choices, with no rule above it: just the Next
// button, at the right, as tall as itself from the start.
const GAME_FOOTER_CLASS = "flex min-h-8 items-center justify-end";

/** How to play, behind the header's info icon. Its one figure from the
    station, the rare cutoff, falls back to the default, so the skeleton can
    draw it as itself. */
function GameInfo({
	rareMax = HIGHLIGHT_THRESHOLDS.rareMax,
}: {
	rareMax?: number;
}) {
	const meanings = learnPoolMeanings(rareMax);
	return (
		<InfoTip label="the quiz" size="default">
			<p>
				Listen to the clip, then pick the bird. {POINTS_BY_ATTEMPT[0]} points
				first try, {POINTS_BY_ATTEMPT[1]} on the second.
			</p>
			{/* No keyboard to speak of on a touch screen. */}
			<p className="pointer-coarse:hidden">
				Keys 1–4 pick a bird; Enter moves on.
			</p>
			<ul className="space-y-1">
				{LEARN_POOLS.map((pool) => (
					<li key={pool}>
						<strong>{LEARN_POOL_LABELS[pool]}:</strong> {meanings[pool]}
					</li>
				))}
			</ul>
		</InfoTip>
	);
}

/**
 * The game before its round arrives, built from the game's own pieces: the
 * quiz card -- its header, the pip track a narrow card shows, the clip's
 * spectrogram slot with the play button's circle, four choices at their real
 * size, and the info icon and footer as themselves -- beside the round's
 * rail of numbered rows and its score.
 */
export function LearnGameSkeleton() {
	return (
		<div className="@container/quiz">
			<div className={QUIZ_GRID_CLASS}>
				<section
					aria-busy="true"
					aria-label="Bird call quiz"
					className={GAME_CARD_CLASS}
				>
					<header className={GAME_HEADER_CLASS}>
						<h2 className="island-kicker">Mystery call</h2>
						<GameInfo />
					</header>

					<div
						aria-hidden="true"
						className="flex @3xl/quiz:hidden flex-col gap-2"
					>
						<div className="flex justify-between">
							<ShellText className="w-20 text-xs" barClassName="w-full" />
							<ShellText className="w-10 text-xs" barClassName="w-full" />
						</div>
						<div className="flex gap-1">
							{Array.from({ length: QUESTIONS_PER_ROUND }, (_, pip) => (
								<ShellBar
									// biome-ignore lint/suspicious/noArrayIndexKey: one pip per bird
									key={pip}
									className="h-1.5 flex-1 rounded-full"
								/>
							))}
						</div>
					</div>

					<SpectrogramPlayerSkeleton aside={<ClipMetaSkeleton />} />

					<div aria-hidden="true" className={CHOICES_CLASS}>
						{Array.from({ length: CHOICES_PER_QUESTION }, (_, choice) => (
							<div
								// biome-ignore lint/suspicious/noArrayIndexKey: one per choice
								key={choice}
								className={`${CHOICE_CLASS} border-[var(--line)]`}
							>
								<span className="tabular-data w-4 shrink-0 text-center text-muted-foreground text-xs">
									{choice + 1}
								</span>
								<span
									className={`flex shrink-0 items-center justify-center ${THUMBNAIL_SIZES.lg}`}
								>
									<ShellBar className="size-full rounded-md" />
								</span>
								<span className={CHOICE_TEXT_CLASS}>
									<ShellText
										className="font-medium @max-[20rem]/choice:text-sm leading-snug"
										barClassName={choice % 2 ? "w-28" : "w-36"}
									/>
									<ShellText className="text-xs" barClassName="w-24" />
								</span>
								<span className="size-4 shrink-0" />
							</div>
						))}
					</div>

					<div className={GAME_FOOTER_CLASS}>
						<Button
							size="default"
							icon={ArrowRight}
							iconPosition="end"
							disabled
						>
							Next bird
						</Button>
					</div>
				</section>

				<aside aria-busy="true" aria-label="This round" className={RAIL_CLASS}>
					<div className={RAIL_HEADER_CLASS}>
						<div className="island-kicker">This round</div>
					</div>
					<ol aria-hidden="true" className="-mx-(--page-gap) divide-y">
						{Array.from({ length: QUESTIONS_PER_ROUND }, (_, position) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: one row per bird
							<li key={position} className={RAIL_ROW_CLASS}>
								<ShellBar className="size-5 shrink-0 rounded-full" />
								<ShellText className="flex-1 text-sm" barClassName="w-full" />
							</li>
						))}
					</ol>
					<div className={RAIL_FOOTER_CLASS}>
						<span className="text-muted-foreground text-sm">Score</span>
						<ShellText
							className="w-24 font-semibold text-xl leading-none"
							barClassName="right-0 left-auto w-full"
						/>
					</div>
				</aside>
			</div>
		</div>
	);
}

/**
 * The game with no round to deal: the same two cards under the same names as
 * the game and its skeleton, each saying what's missing instead of showing a
 * clip or a tally.
 */
export function LearnGameEmpty({ message }: { message: string }) {
	return (
		<div className="@container/quiz">
			<div className={QUIZ_GRID_CLASS}>
				<section aria-label="Bird call quiz" className={GAME_CARD_CLASS}>
					<header className={GAME_HEADER_CLASS}>
						<h2 className="island-kicker">Mystery call</h2>
					</header>
					<p className="text-muted-foreground text-sm">{message}</p>
				</section>

				<aside aria-label="This round" className={RAIL_CLASS}>
					<div className={RAIL_HEADER_CLASS}>
						<div className="island-kicker">This round</div>
					</div>
					<p className="mt-(--page-gap) text-muted-foreground text-sm">
						{message}
					</p>
				</aside>
			</div>
		</div>
	);
}

export function LearnGame({
	round,
	rareMax,
	initialProgress = FRESH_PROGRESS,
	onProgressChange,
	onPlayAgain,
	isLoadingNextRound,
	isPaused = false,
}: {
	round: LearnRound;
	rareMax: number;
	/** Where to pick the round up, for a game resumed from a save. */
	initialProgress?: GameProgress;
	/** Called with every change of progress, the starting point included. */
	onProgressChange?: (progress: GameProgress) => void;
	onPlayAgain: () => void;
	isLoadingNextRound: boolean;
	/** True while a dialog is over the game, e.g. the page's new-round
	    confirmation: its keys are held off so they can't answer behind it. */
	isPaused?: boolean;
}) {
	// One object rather than a state per field, so the whole of it can be
	// saved and handed back as it was.
	const [progress, setProgress] = useState(initialProgress);
	const { index, wrongGuesses, isSolved, results, isFinished } = progress;

	useEffect(() => {
		onProgressChange?.(progress);
	}, [progress, onProgressChange]);

	const question = round.questions[index];
	const runningScore = scoreRound(results);

	const guess = useCallback(
		(choice: LearnChoice) => {
			if (!question || isSolved || wrongGuesses.includes(choice.sciName))
				return;

			if (choice.sciName === question.answerSciName) {
				setProgress((previous) => ({
					...previous,
					results: [
						...previous.results,
						{ attempts: previous.wrongGuesses.length + 1 },
					],
					isSolved: true,
				}));
				return;
			}

			setProgress((previous) => ({
				...previous,
				wrongGuesses: [...previous.wrongGuesses, choice.sciName],
			}));
		},
		[question, isSolved, wrongGuesses],
	);

	const advance = useCallback(() => {
		if (!isSolved) return;
		if (index + 1 >= round.questions.length) {
			setProgress((previous) => ({ ...previous, isFinished: true }));
			return;
		}
		setProgress((previous) => ({
			...previous,
			index: previous.index + 1,
			wrongGuesses: [],
			isSolved: false,
		}));
	}, [isSolved, index, round.questions.length]);

	// Number keys pick a bird, Enter moves on -- the round is a rhythm of
	// listen/answer/next, and reaching for the mouse each time interrupts it.
	useEffect(() => {
		if (isFinished || isPaused) return;

		function onKeyDown(event: KeyboardEvent) {
			if (event.metaKey || event.ctrlKey || event.altKey) return;
			if (event.key === "Enter") {
				advance();
				return;
			}
			const choice = question?.choices[Number(event.key) - 1];
			if (choice) guess(choice);
		}

		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [question, guess, advance, isFinished, isPaused]);

	if (!question) return null;

	if (isFinished) {
		return (
			<RoundSummary
				questions={round.questions}
				results={results}
				onPlayAgain={onPlayAgain}
				isLoadingNextRound={isLoadingNextRound}
			/>
		);
	}

	return (
		// Game card on the left, the round so far in a card of its own on the
		// right. Once the page is too narrow for both, the rail card drops out
		// and the score and pip track above the clip stand in for it. Both keep
		// their natural height -- the rail stops where its rows do.
		//
		// On a wide page the split copies the species page's: its left track is
		// the year heat map's natural width (914px), the right one takes the rest
		// with a 20rem floor. So the game sits at the heat map's width and the
		// rail at the visit log's, and the two pages read as one system. Past
		// 38rem the rail stops growing and the game takes the extra instead.
		<div className="@container/quiz">
			<div className={QUIZ_GRID_CLASS}>
				<section aria-label="Bird call quiz" className={GAME_CARD_CLASS}>
					<header className={GAME_HEADER_CLASS}>
						<h2 className="island-kicker">Mystery call</h2>
						<GameInfo rareMax={rareMax} />
					</header>

					<div className="flex @3xl/quiz:hidden flex-col gap-2">
						<div className="tabular-data flex justify-between text-muted-foreground text-xs">
							<span>
								Bird {index + 1} of {round.questions.length}
							</span>
							<span>{runningScore.score} pts</span>
						</div>
						<ProgressTrack
							total={round.questions.length}
							results={results}
							current={index}
						/>
					</div>

					<fieldset className="min-w-0">
						<legend className="sr-only">Listening prompt</legend>
						<SpectrogramPlayer
							key={question.id}
							audioUrl={question.audioUrl}
							aside={
								<ClipMeta
									heardAt={formatDateTime(question.detectedAt)}
									confidence={question.confidence}
								/>
							}
						/>
					</fieldset>

					<fieldset className={CHOICES_CLASS}>
						<legend className="sr-only">Bird choices</legend>
						{question.choices.map((choice, choiceIndex) => (
							<ChoiceButton
								key={choice.sciName}
								choice={choice}
								shortcut={choiceIndex + 1}
								state={
									isSolved && choice.sciName === question.answerSciName
										? "correct"
										: wrongGuesses.includes(choice.sciName)
											? "wrong"
											: isSolved
												? "muted"
												: "open"
								}
								onSelect={() => guess(choice)}
							/>
						))}
					</fieldset>

					<div className={GAME_FOOTER_CLASS}>
						{/* Always there, out of service until the bird is named, so the
						    footer keeps one layout through the whole question. */}
						{index + 1 >= round.questions.length ? (
							<Button
								size="default"
								icon={Trophy}
								onClick={advance}
								disabled={!isSolved}
							>
								See your score
							</Button>
						) : (
							// Trailing, unlike the leading icons elsewhere: the arrow is
							// pointing at where the button takes you.
							<Button
								size="default"
								icon={ArrowRight}
								iconPosition="end"
								onClick={advance}
								disabled={!isSolved}
							>
								Next bird
							</Button>
						)}
					</div>
				</section>

				<RoundRail
					questions={round.questions}
					results={results}
					current={index}
					score={runningScore.score}
					maxScore={round.questions.length * POINTS_BY_ATTEMPT[0]}
				/>
			</div>
		</div>
	);
}

/**
 * The round so far, one row per bird, in the Live page's recent-activity idiom:
 * a header band, hairline-split rows that run to the card's edges, and a
 * footer band holding the score. Answered birds show who they were, how the
 * guess went, when the clip was recorded and a replay button; the current bird
 * is marked; the rest wait as numbered blanks. Only shown once the card is
 * wide enough to give it a column of its own; narrower, the pip track above
 * the clip stands in.
 */
function RoundRail({
	questions,
	results,
	current,
	score,
	maxScore,
}: {
	questions: LearnQuestion[];
	results: QuestionResult[];
	current: number;
	score: number;
	maxScore: number;
}) {
	return (
		<aside aria-label="This round" className={RAIL_CLASS}>
			<div className={RAIL_HEADER_CLASS}>
				<div className="island-kicker">This round</div>
			</div>

			<ol className="-mx-(--page-gap) divide-y">
				{questions.map((question, position) => {
					const result = results[position];
					const answer = question.choices.find(
						(choice) => choice.sciName === question.answerSciName,
					);
					const isCurrent = position === current && !result;

					return (
						<li
							key={question.id}
							aria-current={isCurrent ? "step" : undefined}
							// 54px like the recent-activity rows: the 40px thumbnail and
							// 7px either side. Blank rows hold the same height, so the
							// card doesn't grow as the round fills in.
							className={`${RAIL_ROW_CLASS} ${isCurrent ? "bg-[var(--row-selected)]" : ""}`}
						>
							<RailDot
								position={position}
								attempts={result?.attempts ?? null}
							/>
							{result && answer ? (
								<AnsweredRailRow
									answer={answer}
									attempts={result.attempts}
									question={question}
								/>
							) : isCurrent ? (
								// An empty frame where the bird's picture lands once it's named.
								<>
									<span
										aria-hidden="true"
										className={`flex shrink-0 items-center justify-center rounded-md border border-[var(--line)] border-dashed text-muted-foreground text-sm ${THUMBNAIL_SIZES.md}`}
									>
										?
									</span>
									<span className="text-sm italic">Mystery bird</span>
								</>
							) : (
								<span className="text-muted-foreground text-sm">—</span>
							)}
						</li>
					);
				})}
			</ol>

			<div className={RAIL_FOOTER_CLASS}>
				<span className="text-muted-foreground text-sm">Score</span>
				<span className="tabular-data font-semibold text-xl leading-none">
					{score}
					<span className="ml-1 font-normal text-muted-foreground text-sm">
						of {maxScore} pts
					</span>
				</span>
			</div>
		</aside>
	);
}

function AnsweredRailRow({
	answer,
	attempts,
	question,
}: {
	answer: LearnChoice;
	attempts: number;
	question: LearnQuestion;
}) {
	return (
		<>
			<ChoiceThumbnail choice={answer} size="md" />

			<div className="min-w-0 flex-1">
				<Link
					to="/birds/$comName"
					params={{ comName: answer.speciesSlug }}
					className="block min-w-0 max-w-fit truncate font-medium text-sm no-underline hover:underline"
				>
					{answer.comName}
				</Link>
				<div className="truncate text-[var(--bark)] text-xs italic">
					{answer.sciName}
				</div>
			</div>

			<div className="shrink-0 text-right">
				<div className="tabular-data text-sm">
					+{pointsForAttempt(attempts)}
				</div>
				<div className="tabular-data text-muted-foreground text-xs">
					{attemptLabel(attempts)}
				</div>
			</div>

			<RecordingButton
				audioUrl={question.audioUrl}
				speciesName={answer.comName}
				iconOnly
			/>
		</>
	);
}

/** The bird's number, coloured like its choice card: green first try, red after. */
function RailDot({
	position,
	attempts,
}: {
	position: number;
	attempts: number | null;
}) {
	const color =
		attempts === null
			? "bg-muted text-muted-foreground"
			: attempts === 1
				? "bg-[color-mix(in_oklab,var(--moss)_12%,var(--paper-raised))] font-semibold text-[var(--moss)]"
				: "bg-[color-mix(in_oklab,var(--clay)_10%,var(--paper-raised))] font-semibold text-[var(--clay)]";
	const label = String(position + 1);

	return (
		<span
			className={`tabular-data flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] ${color}`}
		>
			<span style={{ transform: `translateY(${digitNudge(label)}px)` }}>
				{label}
			</span>
		</span>
	);
}

/**
 * Georgia only has old-style figures: 0-2 sit at x-height, 3-5/7/9 hang
 * below the baseline and 6/8 rise above it, so centring the line box leaves
 * the ink off-centre. Measured at 11px (ascent 10, descent 2), this is how
 * far to shift a number so its ink sits in the middle of the 20px dot.
 */
function digitNudge(label: string) {
	const top = /[68]/.test(label) ? 9 : 6;
	const bottom = /[34579]/.test(label) ? 2 : 0;
	return (top - bottom) / 2 - 3.75;
}

/** One pip per question: filled as answers land, outlined for what's left. */
function ProgressTrack({
	total,
	results,
	current,
}: {
	total: number;
	results: QuestionResult[];
	current: number;
}) {
	return (
		<div className="flex gap-1">
			{Array.from({ length: total }, (_, position) => {
				const result = results[position];
				const background = result
					? result.attempts === 1
						? "var(--moss)"
						: "var(--sand)"
					: position === current
						? "var(--track)"
						: "transparent";

				return (
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: pips are positional
						key={position}
						className="h-1.5 flex-1 rounded-full border border-[var(--line)]"
						style={{ background }}
					/>
				);
			})}
		</div>
	);
}

type ChoiceState = "open" | "correct" | "wrong" | "muted";

const CHOICE_STYLES: Record<ChoiceState, string> = {
	open: "border-[var(--line)] bg-[var(--paper-raised)] hover:border-[var(--hover-line)] hover:bg-[var(--meadow)]",
	correct:
		"border-[var(--moss)] bg-[color-mix(in_oklab,var(--moss)_12%,var(--paper-raised))]",
	wrong:
		"border-[var(--clay)] bg-[color-mix(in_oklab,var(--clay)_10%,var(--paper-raised))] opacity-80",
	muted: "border-[var(--line)] bg-[var(--paper-raised)] opacity-50",
};

function ChoiceButton({
	choice,
	shortcut,
	state,
	onSelect,
}: {
	choice: LearnChoice;
	shortcut: number;
	state: ChoiceState;
	onSelect: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onSelect}
			disabled={state !== "open"}
			// A container so the art can give way to the name when two choices
			// share a row on a mid-sized screen, instead of the name truncating.
			className={`${CHOICE_CLASS} ${CHOICE_STYLES[state]}`}
		>
			<span className="tabular-data w-4 shrink-0 text-center text-muted-foreground text-xs">
				{shortcut}
			</span>
			<ChoiceThumbnail choice={choice} size="lg" />
			<span className={CHOICE_TEXT_CLASS}>
				{/* Two lines before it truncates: "Yellow-rumped Warbler" wraps
				    rather than losing the half that tells it apart. */}
				<span className="line-clamp-2 font-medium @max-[20rem]/choice:text-sm leading-snug">
					{choice.comName}
				</span>
				<span className="block truncate text-[var(--bark)] text-xs italic">
					{choice.sciName}
				</span>
			</span>
			{/* The mark's slot is held from the start: a tick or cross arriving
			    mid-question would otherwise narrow the name and rewrap it. */}
			<span className="size-4 shrink-0">
				{state === "correct" ? (
					<Check className="size-4 text-[var(--moss)]" />
				) : state === "wrong" ? (
					<X className="size-4 text-[var(--clay)]" />
				) : null}
			</span>
		</button>
	);
}

const THUMBNAIL_SIZES = {
	sm: "h-6 w-8",
	md: "size-10",
	lg: "h-20 w-24 @max-[20rem]/choice:h-12 @max-[20rem]/choice:w-14 max-[400px]:h-10 max-[400px]:w-13",
} as const;

const GLYPH_SIZES: Record<keyof typeof THUMBNAIL_SIZES, string> = {
	sm: "size-4",
	md: "size-5",
	lg: "size-10 @max-[20rem]/choice:size-6 max-[400px]:size-5",
};

function ChoiceThumbnail({
	choice,
	size = "md",
}: {
	choice: LearnChoice;
	size?: keyof typeof THUMBNAIL_SIZES;
}) {
	return (
		<span
			className={`flex shrink-0 items-center justify-center overflow-hidden ${THUMBNAIL_SIZES[size]}`}
		>
			<SpeciesImage
				imageUrl={choice.imageUrl}
				alt=""
				glyphClassName={GLYPH_SIZES[size]}
			/>
		</span>
	);
}

function attemptLabel(attempts: number): string {
	if (attempts === 1) return "First try";
	if (attempts === 2) return "Second guess";
	return `${attempts} guesses`;
}

function RoundSummary({
	questions,
	results,
	onPlayAgain,
	isLoadingNextRound,
}: {
	questions: LearnQuestion[];
	results: QuestionResult[];
	onPlayAgain: () => void;
	isLoadingNextRound: boolean;
}) {
	const score = scoreRound(results);

	return (
		<section
			aria-label="Round results"
			// One gap between every block, the game card's: 16px, 8px on a phone.
			className="feature-card rise-in flex flex-col gap-(--page-gap) rounded-md p-4"
		>
			{/* The score alone, written the way the rail's footer wrote it. */}
			<CardHeader title="Round complete">
				<span className="tabular-data text-sm">
					<strong className="font-semibold">{score.score}</strong> of{" "}
					<strong className="font-semibold">{score.maxScore}</strong> pts
				</span>
			</CardHeader>

			{/* Rows run to the card's edges and start right under the header's
			    hairline, as the rail's do, so their content sits on the card's own
			    16px inset instead of a second one inside it. */}
			<ol className="-mx-(--page-gap) -mt-(--page-gap)">
				{questions.map((question, position) => {
					const result = results[position];
					const answer = question.choices.find(
						(choice) => choice.sciName === question.answerSciName,
					);
					if (!result || !answer) return null;

					return (
						<li
							key={question.id}
							// 54px like the rail's rows and recent activity's: the 40px
							// thumbnail and 7px either side.
							className="flex items-center gap-4 px-(--page-gap) py-1.75 odd:bg-[var(--meadow)] max-[400px]:gap-2"
						>
							<ChoiceThumbnail choice={answer} />
							<div className="min-w-0 flex-1">
								<Link
									to="/birds/$comName"
									params={{ comName: answer.speciesSlug }}
									className="block max-w-fit truncate font-medium no-underline hover:underline"
								>
									{answer.comName}
								</Link>
								<div className="text-muted-foreground text-xs">
									{attemptLabel(result.attempts)} ·{" "}
									{formatDateTime(question.detectedAt)}
								</div>
							</div>
							<span className="tabular-data shrink-0 text-sm">
								+{pointsForAttempt(result.attempts)}
							</span>
							<RecordingButton
								audioUrl={question.audioUrl}
								speciesName={answer.comName}
								iconOnly
							/>
						</li>
					);
				})}
			</ol>

			{/* A footer band: the rows run straight into its hairline, and its
			    contents keep the card's standard 16px on every side. */}
			<div className="-mx-(--page-gap) -mt-(--page-gap) -mb-(--page-gap) flex items-center justify-between gap-4 border-t p-(--page-gap) max-[400px]:gap-2">
				{/* Wraps within itself on a phone rather than pushing the button
				    onto a line of its own: the two stay across from each other. */}
				<span className="tabular-data min-w-0 text-sm">
					You named <strong className="font-semibold">{score.firstTry}</strong>{" "}
					of <strong className="font-semibold">{score.answered}</strong> species
					on the first try.
				</span>
				<Button
					size="default"
					icon={RotateCcw}
					onClick={onPlayAgain}
					disabled={isLoadingNextRound}
				>
					{isLoadingNextRound ? "Dealing a new round…" : "Play again"}
				</Button>
			</div>
		</section>
	);
}
