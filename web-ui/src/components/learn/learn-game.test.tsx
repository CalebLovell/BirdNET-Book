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
				},
				{
					comName: "Blue Jay",
					sciName: "Cyanocitta cristata",
					speciesSlug: "Blue_Jay",
					imageUrl: null,
				},
				{
					comName: "American Robin",
					sciName: "Turdus migratorius",
					speciesSlug: "American_Robin",
					imageUrl: null,
				},
				{
					comName: "House Finch",
					sciName: "Haemorhous mexicanus",
					speciesSlug: "House_Finch",
					imageUrl: null,
				},
			],
		},
	],
};

test("stacks the clip above the choices in a centered column", () => {
	const markup = renderToStaticMarkup(
		<LearnGame
			round={round}
			onPlayAgain={() => {}}
			isLoadingNextRound={false}
		/>,
	);

	assert.match(
		markup,
		/mx-auto mt-\(--page-gap\) flex w-full max-w-2xl flex-col/,
	);
	assert.doesNotMatch(markup, /lg:grid-cols-/);
	assert.match(
		markup,
		/<fieldset[^>]*><legend[^>]*>Listening prompt<\/legend>/,
	);
	assert.match(markup, /<fieldset[^>]*><legend[^>]*>Bird choices<\/legend>/);
});
