import { Link } from "@tanstack/react-router";
import { ArrowRight, Bird, Check, RotateCcw, Trophy, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ConfidencePill } from "~/components/confidence-pill.tsx";
import { ClipPlayer } from "~/components/learn/clip-player.tsx";
import { RecordingButton } from "~/components/recording-button.tsx";
import { Button } from "~/components/ui/button.tsx";
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
import { formatClockTime } from "~/lib/time-ago.ts";

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
		<section
			aria-label="Bird call quiz"
			className="feature-card rounded-md p-4"
		>
			{/* The only thing that rides the card's full width -- it labels the card
			    rather than belonging to the game below it. */}
			<div className="island-kicker">
				Bird {index + 1} of {round.questions.length}
			</div>

			{/* The card spans the page, but the game itself stays a single centered
			    column: score, progress, clip, choices, in the order you use them. */}
			<div className="mx-auto mt-4 flex w-full max-w-2xl flex-col gap-4">
				<div className="flex flex-col gap-2">
					<div className="tabular-data self-end text-muted-foreground text-xs">
						{runningScore.score} pts
					</div>
					<ProgressTrack
						total={round.questions.length}
						results={results}
						current={index}
					/>
				</div>

				<fieldset className="flex flex-col items-center gap-2">
					<legend className="sr-only">Listening prompt</legend>
					<ClipPlayer key={question.id} audioUrl={question.audioUrl} />
					<div className="tabular-data text-muted-foreground text-xs">
						Recorded {formatClockTime(question.detectedAt)} ·{" "}
						{question.detectedAt.slice(0, 10)}
					</div>
				</fieldset>

				<fieldset className="grid min-w-0 gap-2 sm:grid-cols-2">
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

				{/* No reserved height -- this strip is only ever as tall as whatever it
				    is currently saying. */}
				<div className="border-[var(--line)] border-t pt-4">
					{isSolved && answer ? (
						<div className="flex flex-wrap items-center justify-center gap-4">
							<div className="flex items-center gap-2 text-sm">
								<span className="font-semibold">
									{wrongGuesses.length === 0
										? "First try —"
										: `Got it in ${wrongGuesses.length + 1} —`}
								</span>
								<span className="tabular-data">
									+{pointsForAttempt(wrongGuesses.length + 1)} pts
								</span>
								<ConfidencePill confidence={question.confidence} />
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
							try, {POINTS_BY_ATTEMPT[1]} on the second — keys 1–4 work too.
						</p>
					)}
				</div>
			</div>
		</section>
	);
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
			className={`flex items-center gap-4 rounded-md border p-4 text-left ${CHOICE_STYLES[state]}`}
		>
			<span className="tabular-data w-4 shrink-0 text-center text-muted-foreground text-xs">
				{shortcut}
			</span>
			<ChoiceThumbnail choice={choice} />
			<span className="min-w-0 flex-1">
				<span className="block truncate font-medium">{choice.comName}</span>
				<span className="block truncate text-[var(--bark)] text-xs italic">
					{choice.sciName}
				</span>
			</span>
			{state === "correct" ? (
				<Check className="size-4 shrink-0 text-[var(--moss)]" />
			) : state === "wrong" ? (
				<X className="size-4 shrink-0 text-[var(--clay)]" />
			) : null}
		</button>
	);
}

function ChoiceThumbnail({ choice }: { choice: LearnChoice }) {
	return (
		<span className="flex size-10 shrink-0 items-center justify-center overflow-hidden">
			{choice.imageUrl ? (
				<img
					src={choice.imageUrl}
					alt=""
					className="max-h-full max-w-full object-contain"
				/>
			) : (
				<Bird className="size-5 text-muted-foreground" />
			)}
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

			<div className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
				<div className="tabular-data font-semibold text-4xl leading-none">
					{score.score}
					<span className="text-muted-foreground text-xl">
						/{score.maxScore}
					</span>
				</div>
				<div className="display-title text-xl">{roundVerdict(score)}</div>
			</div>

			<dl className="mt-4 grid grid-cols-3 gap-2 text-center">
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

			<ol className="mt-4 space-y-1">
				{questions.map((question, position) => {
					const result = results[position];
					const answer = question.choices.find(
						(choice) => choice.sciName === question.answerSciName,
					);
					if (!result || !answer) return null;

					return (
						<li
							key={question.id}
							className="flex items-center gap-4 rounded-md px-4 py-2 odd:bg-[var(--meadow)]"
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
									{formatClockTime(question.detectedAt)}
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

			<div className="mt-4 flex justify-end">
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
		<div className="rounded-md border border-[var(--line)] p-4">
			<dt className="island-kicker">{label}</dt>
			<dd className="tabular-data mt-1 font-semibold text-2xl leading-none">
				{value}
			</dd>
		</div>
	);
}
