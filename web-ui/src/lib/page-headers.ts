import { createElement, Fragment, type ReactNode } from "react";

/**
 * Every page masthead's title and subtitle, in one place, so they can be read
 * side by side and kept in the same voice. A page's `PageHeaderCard` takes its
 * words from here rather than writing its own.
 *
 * Subtitles are fixed, so they are there from the first frame. The two that
 * aren't plain strings: the Timeline title, which names the selected window
 * (built in `timeline.tsx` from the period labels), and the All Birds line,
 * which carries the station's running totals.
 */
export const PAGE_HEADERS = {
	birds: {
		title: "All Birds",
		/** Figures arrive as nodes, so they can shimmer while still loading. */
		description: (
			detections: ReactNode,
			species: ReactNode,
			oneDetection: boolean,
		) =>
			createElement(
				Fragment,
				null,
				"This station has recorded ",
				detections,
				` total ${oneDetection ? "detection" : "detections"} from `,
				species,
				" species.",
			),
	},
	timeline: {
		description: "Every detection, by species, over the selected time period.",
		/** A date outside the station's history: the page shows in place of
		    the window, under this section name and line. */
		missingSection: "Timeline",
		missingDescription:
			"What this station heard, at whatever scale you ask for.",
	},
	detections: {
		title: "Detections",
		description: "Browse, filter, and manage every individual detection.",
	},
	review: {
		title: "Review detections",
		description: "Confirm or correct uncertain detections.",
	},
	learn: {
		title: "Learn the calls",
		description: "Test your knowledge of the bird calls from your station.",
	},
	speciesControl: {
		title: "Species Control",
		description: "Decide which installed species BirdNET may detect.",
	},
	settings: {
		title: "Settings",
		description: "Adjust how your station runs.",
	},
	account: {
		title: "Account",
		description: "Manage access to your station.",
	},
} as const;
