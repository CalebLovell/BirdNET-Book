// Pure round assembly and scoring for the Learn quiz. Randomness arrives as an
// injected `random` so the tests can drive it deterministically, and nothing
// here touches the db -- learn.ts gathers the pool, this file shapes it into a
// round.

import { audioUrlFor } from "~/lib/audio.ts";

export const QUESTIONS_PER_ROUND = 10;
export const CHOICES_PER_QUESTION = 4;

/** Points awarded by how many guesses a question took; nothing after these. */
export const POINTS_BY_ATTEMPT = [3, 1] as const;

export type PoolClip = {
	date: string;
	fileName: string;
	/** "YYYY-MM-DD HH:MM:SS", local, as stored by BirdNET-Pi. */
	detectedAt: string;
	confidence: number | null;
};

export type PoolSpecies = {
	comName: string;
	sciName: string;
	speciesSlug: string;
	imageUrl: string | null;
	clips: PoolClip[];
};

export type LearnChoice = {
	comName: string;
	sciName: string;
	speciesSlug: string;
	imageUrl: string | null;
	/**
	 * Station-wide totals for the species, filled in by the loader. Deliberately
	 * nothing about the clip itself -- its time or confidence on every card
	 * would point straight at the answer.
	 */
	detections: number;
	/** "YYYY-MM-DD" of the species' first detection, or null if unknown. */
	firstHeard: string | null;
};

export type LearnQuestion = {
	/** Stable per question, so the audio player remounts between questions. */
	id: string;
	audioUrl: string;
	detectedAt: string;
	confidence: number | null;
	answerSciName: string;
	choices: LearnChoice[];
};

export type LearnRound = {
	id: string;
	questions: LearnQuestion[];
	/** How many distinct species the chosen pool offered. */
	speciesInPool: number;
};

function shuffle<T>(items: T[], random: () => number): T[] {
	const copy = [...items];
	for (let index = copy.length - 1; index > 0; index -= 1) {
		const swapWith = Math.floor(random() * (index + 1));
		const held = copy[index] as T;
		copy[index] = copy[swapWith] as T;
		copy[swapWith] = held;
	}
	return copy;
}

function pick<T>(items: T[], random: () => number): T {
	return items[Math.floor(random() * items.length)] as T;
}

function toChoice(species: PoolSpecies): LearnChoice {
	return {
		comName: species.comName,
		sciName: species.sciName,
		speciesSlug: species.speciesSlug,
		imageUrl: species.imageUrl,
		detections: 0,
		firstHeard: null,
	};
}

/**
 * Draws the round's answer species. Shuffling and taking from the front spreads
 * the questions over as many different species as the pool allows; only once
 * every species has had a turn does a reshuffled pass start repeating them.
 */
function drawAnswers(
	species: PoolSpecies[],
	questionCount: number,
	random: () => number,
): PoolSpecies[] {
	const answers: PoolSpecies[] = [];
	while (answers.length < questionCount) {
		answers.push(
			...shuffle(species, random).slice(0, questionCount - answers.length),
		);
	}
	return answers;
}

export function buildRound(
	species: PoolSpecies[],
	random: () => number = Math.random,
): LearnRound {
	const playable = species.filter((entry) => entry.clips.length > 0);
	if (playable.length < CHOICES_PER_QUESTION) {
		return { id: "empty", questions: [], speciesInPool: playable.length };
	}

	const questions = drawAnswers(playable, QUESTIONS_PER_ROUND, random).map(
		(answer, index) => {
			const clip = pick(answer.clips, random);
			const distractors = shuffle(
				playable.filter((entry) => entry.sciName !== answer.sciName),
				random,
			).slice(0, CHOICES_PER_QUESTION - 1);

			return {
				id: `${index}-${clip.date}-${clip.fileName}`,
				audioUrl: audioUrlFor(clip.date, answer.comName, clip.fileName),
				detectedAt: clip.detectedAt,
				confidence: clip.confidence,
				answerSciName: answer.sciName,
				choices: shuffle([answer, ...distractors], random).map(toChoice),
			};
		},
	);

	return {
		// Changes every round, so the page can key the game on it and reset all
		// of its in-progress state when a fresh round arrives.
		id: `${Date.now().toString(36)}-${Math.floor(random() * 1e6).toString(36)}`,
		questions,
		speciesInPool: playable.length,
	};
}

/** 3 points for a clean answer, 1 for a second try, nothing after that. */
export function pointsForAttempt(attempt: number): number {
	return POINTS_BY_ATTEMPT[attempt - 1] ?? 0;
}

export type QuestionResult = {
	/** How many guesses it took to land on the right species. */
	attempts: number;
};

export type RoundScore = {
	score: number;
	maxScore: number;
	firstTry: number;
	answered: number;
	/** Longest run of consecutive first-try answers. */
	bestStreak: number;
};

export function scoreRound(results: QuestionResult[]): RoundScore {
	let score = 0;
	let firstTry = 0;
	let streak = 0;
	let bestStreak = 0;

	for (const result of results) {
		score += pointsForAttempt(result.attempts);
		if (result.attempts === 1) {
			firstTry += 1;
			streak += 1;
			bestStreak = Math.max(bestStreak, streak);
		} else {
			streak = 0;
		}
	}

	return {
		score,
		maxScore: results.length * (POINTS_BY_ATTEMPT[0] ?? 0),
		firstTry,
		answered: results.length,
		bestStreak,
	};
}

/** A light bit of end-screen flavor, keyed off first-try accuracy. */
export function roundVerdict({ firstTry, answered }: RoundScore): string {
	if (answered === 0) return "No birds yet.";
	const ratio = firstTry / answered;
	if (ratio === 1) return "Perfect ear.";
	if (ratio >= 0.75) return "Sharp listening.";
	if (ratio >= 0.5) return "Coming along.";
	if (ratio >= 0.25) return "Keep at it.";
	return "Plenty left to learn.";
}
