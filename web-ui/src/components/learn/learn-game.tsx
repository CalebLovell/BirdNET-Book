import { Link } from "@tanstack/react-router";
import { ArrowRight, Check, RotateCcw, Trophy, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ConfidencePill } from "~/components/confidence-pill.tsx";
import { ClipPlayer } from "~/components/learn/clip-player.tsx";
import { RecordingButton } from "~/components/recording-button.tsx";
import { SpeciesImage } from "~/components/species-image.tsx";
import { Button } from "~/components/ui/button.tsx";
import { formatDateTime } from "~/lib/date-format.ts";
import {
	type LearnChoice,
	type LearnQuestion,
	type LearnRound,
	POINTS_BY_ATTEMPT,
	pointsForAttempt,
	type QuestionResult,
	roundVerdict,
	scoreRound,
} from "~/lib/learn-round.ts";

/**
 * The quiz itself: play a clip, pick the bird, keep going until the round is
 * done. All of the round's state lives here and nowhere else, so the page
 * starts a fresh round simply by giving this component a new `key`.
 */
export function LearnGame({
	round,
	onPlayAgain,
	isLoadingNextRound,
}: {
	round: LearnRound;
	onPlayAgain: () => void;
	isLoadingNextRound: boolean;
}) {
	const [index, setIndex] = useState(0);
	// Species already ruled out on the current question, in the order guessed.
	const [wrongGuesses, setWrongGuesses] = useState<string[]>([]);
	const [isSolved, setIsSolved] = useState(false);
	const [results, setResults] = useState<QuestionResult[]>([]);
	const [isFinished, setIsFinished] = useState(false);

	const question = round.questions[index];
	const runningScore = scoreRound(results);

	const guess = useCallback(
		(choice: LearnChoice) => {
			if (!question || isSolved || wrongGuesses.includes(choice.sciName))
				return;

			if (choice.sciName === question.answerSciName) {
				setResults((previous) => [
					...previous,
					{ attempts: wrongGuesses.length + 1 },
				]);
				setIsSolved(true);
				return;
			}

			setWrongGuesses((previous) => [...previous, choice.sciName]);
		},
		[question, isSolved, wrongGuesses],
	);

	const advance = useCallback(() => {
		if (!isSolved) return;
		if (index + 1 >= round.questions.length) {
			setIsFinished(true);
			return;
		}
		setIndex((previous) => previous + 1);
		setWrongGuesses([]);
		setIsSolved(false);
	}, [isSolved, index, round.questions.length]);

	// Number keys pick a bird, Enter moves on -- the round is a rhythm of
	// listen/answer/next, and reaching for the mouse each time interrupts it.
	useEffect(() => {
		if (isFinished) return;

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
	}, [question, guess, advance, isFinished]);

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

	const answer = question.choices.find(
		(choice) => choice.sciName === question.answerSciName,
	);

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
			<div className="grid @3xl/quiz:grid-cols-[minmax(0,1fr)_24rem] @7xl/quiz:grid-cols-[minmax(914px,1fr)_minmax(20rem,38rem)] items-start gap-(--page-gap)">
				<section
					aria-label="Bird call quiz"
					className="@container/game feature-card flex min-w-0 flex-col gap-(--page-gap) rounded-md p-4"
				>
					<header className="-mx-(--page-gap) -mt-(--page-gap) flex min-h-[45px] flex-wrap items-center justify-between gap-x-2 border-b px-(--page-gap) py-2">
						<h2 className="island-kicker">Mystery call</h2>
						<div className="tabular-data text-muted-foreground text-xs">
							Heard {formatDateTime(question.detectedAt)}
						</div>
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
						<ClipPlayer key={question.id} audioUrl={question.audioUrl} />
					</fieldset>

					<fieldset className="grid min-w-0 @xl/game:grid-cols-2 grid-cols-1 gap-4 max-[400px]:gap-2">
						<legend className="sr-only">Bird choices</legend>
						{question.choices.map((choice, choiceIndex) => (
							<ChoiceButton
								key={choice.sciName}
								choice={choice}
								shortcut={choiceIndex + 1}
								// The clip's own confidence only shows once it can't give
								// the answer away.
								confidence={
									isSolved && choice.sciName === question.answerSciName
										? question.confidence
										: null
								}
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

					{/* No reserved height -- this strip is only ever as tall as whatever it
				    is currently saying. */}
					<div className="border-[var(--line)] border-t pt-(--page-gap)">
						{isSolved && answer ? (
							<div className="flex flex-wrap items-center justify-center gap-4 max-[400px]:gap-2">
								{/* Wraps on a phone rather than pushing the species link off the
							    card's edge. */}
								<div className="flex flex-wrap items-center justify-center gap-2 text-sm">
									<span className="font-semibold">
										{wrongGuesses.length === 0
											? "First try —"
											: `Got it in ${wrongGuesses.length + 1} —`}
									</span>
									<span className="tabular-data">
										+{pointsForAttempt(wrongGuesses.length + 1)} pts
									</span>
									<Link
										to="/species/$comName"
										params={{ comName: answer.speciesSlug }}
										className="text-sm no-underline hover:underline"
									>
										About the {answer.comName}
									</Link>
								</div>
								<Button onClick={advance}>
									{index + 1 >= round.questions.length ? (
										<>
											<Trophy className="size-4" />
											See your score
										</>
									) : (
										// Trailing, unlike the leading icons elsewhere: the arrow is
										// pointing at where the button takes you.
										<>
											Next bird
											<ArrowRight className="size-4" />
										</>
									)}
								</Button>
							</div>
						) : (
							<p className="text-center text-muted-foreground text-sm">
								Listen, then pick the bird. {POINTS_BY_ATTEMPT[0]} points first
								try, {POINTS_BY_ATTEMPT[1]} on the second
								{/* No keyboard to speak of on a touch screen. */}
								<span className="pointer-coarse:hidden">
									{" "}
									— keys 1–4 work too
								</span>
								.
							</p>
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
		<aside
			aria-label="This round"
			className="feature-card @3xl/quiz:flex hidden flex-col rounded-md p-4"
		>
			<div className="-mx-(--page-gap) -mt-(--page-gap) flex min-h-[45px] items-center justify-between gap-2 border-b px-(--page-gap)">
				<div className="island-kicker">This round</div>
				<div className="tabular-data text-muted-foreground text-xs">
					Bird {current + 1} of {questions.length}
				</div>
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
							className={`flex min-h-[54px] items-center gap-3 px-(--page-gap) py-1.75 ${isCurrent ? "bg-[var(--row-selected)]" : ""}`}
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
							) : (
								<span
									className={`text-sm ${isCurrent ? "" : "text-muted-foreground"}`}
								>
									{isCurrent ? "Listening…" : "—"}
								</span>
							)}
						</li>
					);
				})}
			</ol>

			<div className="-mx-(--page-gap) mt-auto -mb-(--page-gap) flex items-baseline justify-between gap-2 border-t px-(--page-gap) py-3">
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
					to="/species/$comName"
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
	confidence,
	onSelect,
}: {
	choice: LearnChoice;
	shortcut: number;
	state: ChoiceState;
	/** The clip's confidence, passed only to the solved answer's card. */
	confidence: number | null;
	onSelect: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onSelect}
			disabled={state !== "open"}
			// A container so the art can give way to the name when two choices
			// share a row on a mid-sized screen, instead of the name truncating.
			className={`@container/choice flex items-center gap-4 rounded-md border px-4 py-2 text-left max-[400px]:gap-2 max-[400px]:px-2 ${CHOICE_STYLES[state]}`}
		>
			<span className="tabular-data w-4 shrink-0 text-center text-muted-foreground text-xs">
				{shortcut}
			</span>
			<ChoiceThumbnail choice={choice} size="lg" />
			<span className="min-w-0 flex-1">
				{/* Two lines before it truncates: "Yellow-rumped Warbler" wraps
				    rather than losing the half that tells it apart. */}
				<span className="line-clamp-2 font-medium @max-[20rem]/choice:text-sm leading-snug">
					{choice.comName}
				</span>
				<span className="block truncate text-[var(--bark)] text-xs italic">
					{choice.sciName}
				</span>
			</span>
			{confidence !== null ? <ConfidencePill confidence={confidence} /> : null}
			{state === "correct" ? (
				<Check className="size-4 shrink-0 text-[var(--moss)]" />
			) : state === "wrong" ? (
				<X className="size-4 shrink-0 text-[var(--clay)]" />
			) : null}
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
			className="feature-card rise-in rounded-md p-4"
		>
			<div className="island-kicker">Round complete</div>

			<div className="mt-(--page-gap) flex flex-wrap items-baseline gap-x-4 gap-y-1 max-[400px]:gap-x-2">
				<div className="tabular-data font-semibold text-4xl leading-none">
					{score.score}
					<span className="text-muted-foreground text-xl">
						/{score.maxScore}
					</span>
				</div>
				<div className="display-title text-xl">{roundVerdict(score)}</div>
			</div>

			<dl className="mt-(--page-gap) grid grid-cols-3 gap-2 text-center">
				<SummaryStat
					label="First try"
					value={`${score.firstTry}/${score.answered}`}
				/>
				<SummaryStat label="Best streak" value={score.bestStreak} />
				<SummaryStat
					label="Accuracy"
					value={`${Math.round((score.firstTry / Math.max(score.answered, 1)) * 100)}%`}
				/>
			</dl>

			<ol className="mt-3 space-y-0.5">
				{questions.map((question, position) => {
					const result = results[position];
					const answer = question.choices.find(
						(choice) => choice.sciName === question.answerSciName,
					);
					if (!result || !answer) return null;

					return (
						<li
							key={question.id}
							className="flex items-center gap-4 rounded-md px-4 py-2 odd:bg-[var(--meadow)] max-[400px]:gap-2 max-[400px]:px-2"
						>
							<ChoiceThumbnail choice={answer} />
							<div className="min-w-0 flex-1">
								<Link
									to="/species/$comName"
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
							<RecordingButton audioUrl={question.audioUrl} iconOnly />
						</li>
					);
				})}
			</ol>

			<div className="mt-(--page-gap) flex justify-end">
				<Button onClick={onPlayAgain} disabled={isLoadingNextRound}>
					<RotateCcw className="size-4" />
					{isLoadingNextRound ? "Dealing a new round…" : "Play again"}
				</Button>
			</div>
		</section>
	);
}

function SummaryStat({
	label,
	value,
}: {
	label: string;
	value: string | number;
}) {
	return (
		<div className="rounded-md border border-[var(--line)] p-4 max-[400px]:p-2">
			<dt className="island-kicker">{label}</dt>
			<dd className="tabular-data mt-1 font-semibold text-2xl leading-none">
				{value}
			</dd>
		</div>
	);
}
