/**
 * Every empty state's wording, in one place, so they can be read side by side
 * and kept saying the same thing the same way. A card or page that has nothing
 * to show takes its line from here rather than writing its own.
 *
 * One rule for all of them: name the thing that's missing, in its own word
 * (detections, species, visits, recordings), and stop. No explanation of
 * why, no promise of what will appear later. A card's title stays its own name
 * whether it is full or empty; only this line changes.
 *
 * The one exception is the Live page's hero card, which stands in for the
 * bird's portrait and keeps a title and a line beneath it.
 */
export const EMPTY = {
	// The station has recorded nothing at all.
	station: {
		/** The Live hero card, standing in for the bird: title and line. */
		liveHeroTitle: "All Quiet",
		liveHeroBody: "As birds are heard, each new one will appear here.",
		detections: "No detections recorded yet.",
		species: "No species recorded yet.",
		recordings: "No recordings yet.",
	},

	// The station has recordings, but this window or slice has none.
	window: {
		/** The Live hero card, when nothing was heard in the last day. */
		liveQuietTitle: "All Quiet",
		liveQuietBody:
			"Nothing heard in the last 24 hours. New detections will appear here on their own.",
		last24Hours: "No detections recorded in the last 24 hours.",
		timelineWindow: (windowLabel: string | null) =>
			windowLabel
				? `No detections recorded for ${windowLabel}.`
				: "No detections recorded in this window.",
		birdVisits: "No visits recorded yet.",
		birdRecording: "No recordings yet.",
	},

	// A search or filter matched nothing.
	filter: {
		birdsSearch: (search: string) => `No species match “${search}”.`,
		detectionsFilters: "No detections match these filters.",
		speciesControlSearch: "No species match that search.",
		recategorizeSearch: (search: string) => `No species match “${search}”.`,
		learnPool: "Not enough species with recordings in this selection.",
	},

	// A queue with nothing left in it.
	done: {
		reviewPage: "No recordings left on this page.",
		reviewQueue: "No recordings to review.",
	},
} as const;
