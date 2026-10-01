import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { LearnRound } from "~/lib/learn-round.ts";
import { LearnGame } from "./learn-game.tsx";

const round: LearnRound = {
	id: "round-1",
	speciesInPool: 4,
	questions: [
		{
			id: "question-1",
			audioUrl: "/audio/test.wav",
			detectedAt: "2026-07-28 08:00:00",
			confidence: 0.9,
			answerSciName: "Cardinalis cardinalis",
			choices: [
				{
					comName: "Northern Cardinal",
					sciName: "Cardinalis cardinalis",
					speciesSlug: "Northern_Cardinal",
					imageUrl: null,
					detections: 1284,
					firstHeard: "2025-03-14",
				},
				{
					comName: "Blue Jay",
					sciName: "Cyanocitta cristata",
					speciesSlug: "Blue_Jay",
					imageUrl: null,
					detections: 0,
					firstHeard: null,
				},
				{
					comName: "American Robin",
					sciName: "Turdus migratorius",
					speciesSlug: "American_Robin",
					imageUrl: null,
					detections: 0,
					firstHeard: null,
				},
				{
					comName: "House Finch",
					sciName: "Haemorhous mexicanus",
					speciesSlug: "House_Finch",
					imageUrl: null,
					detections: 0,
					firstHeard: null,
				},
			],
		},
	],
};

function render() {
	return renderToStaticMarkup(
		<LearnGame
			round={round}
			onPlayAgain={() => {}}
			isLoadingNextRound={false}
		/>,
	);
}

test("fills the card: game beside a round rail once the card is wide", () => {
	const markup = render();

	assert.doesNotMatch(markup, /max-w-2xl/);
	assert.match(markup, /@container\/quiz/);
	assert.match(markup, /@3xl\/quiz:grid-cols-\[minmax\(0,1fr\)_24rem\]/);
	assert.match(
		markup,
		/@7xl\/quiz:grid-cols-\[minmax\(914px,1fr\)_minmax\(20rem,38rem\)\]/,
	);
	assert.match(
		markup,
		/<aside aria-label="This round" class="feature-card[^"]*@3xl\/quiz:flex/,
	);
	// The rail is the game card's sibling, not tucked inside it.
	assert.match(markup, /<\/section><aside aria-label="This round"/);
	assert.match(
		markup,
		/<fieldset[^>]*><legend[^>]*>Listening prompt<\/legend>/,
	);
	assert.match(markup, /<fieldset[^>]*><legend[^>]*>Bird choices<\/legend>/);
});

test("the narrow layout keeps the pip track, hidden once the rail shows", () => {
	assert.match(
		render(),
		/class="[^"]*@3xl\/quiz:hidden[^"]*"><div[^>]*><span>Bird 1 of 1<\/span><span>0 pts/,
	);
});

test("draws the spectrogram before any play, with the play button inside it", () => {
	assert.match(
		render(),
		/aria-label="Spectrogram of the call".*<button[^>]*aria-label="Play the recording"/,
	);
});

test("heads the card like the rail: title left, recording time right", () => {
	const markup = render();
	assert.match(markup, /<h2 class="island-kicker">Mystery call</);
	assert.doesNotMatch(markup, /Heard at /);
	assert.match(markup, /text-xs">Heard /);
	assert.match(markup, /Jul 28, 2026, /);
});

test("the rail counts the birds now that the title doesn't", () => {
	assert.match(render(), /Bird 1 of 1<\/div>/);
});

test("choices without art show the generic bird glyph, never initials", () => {
	const markup = render();
	assert.doesNotMatch(markup, />NC<\/span>/);
	assert.doesNotMatch(markup, />HF<\/span>/);
	assert.match(markup, /lucide-bird/);
});

test("the rail marks the current bird and leaves the rest blank", () => {
	const markup = render();
	assert.match(markup, /aria-current="step"[^>]*>.*Listening…/);
	assert.match(markup, /0<span[^>]*>of 3 pts<\/span>/);
});

test("bird cards show just the names, no station totals", () => {
	const markup = render();
	assert.doesNotMatch(markup, /count-figure/);
	assert.doesNotMatch(markup, /since Mar 2025/);
});

test("a long bird name truncates instead of widening the choice column", () => {
	// Without an explicit track the implicit auto column grows to the name's
	// nowrap width and the cards spill past the card on a phone.
	assert.match(render(), /<fieldset class="grid[^"]* grid-cols-1 /);
});

test("no confidence pill before the answer is in -- it would point at it", () => {
	assert.doesNotMatch(render(), /confidence/i);
});
