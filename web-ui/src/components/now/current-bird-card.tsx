import type { ReactNode } from "react";

import {
	HERO_CARD_SHELL,
	HeroCardShell,
	SpeciesHeroCard,
} from "~/components/species-hero-card.tsx";
import { formatDateTime } from "~/lib/date-format.ts";
import type { CurrentBird } from "~/lib/now.ts";
import { formatTimeAgo } from "~/lib/time-ago.ts";

/**
 * The page's masthead: the most recent detection of the last 24 hours as its
 * portrait. Like everything else on the Live page it is bounded to that window,
 * so once a day passes without a bird the card goes quiet rather than holding
 * up yesterday's news.
 */
export function CurrentBirdCard({
	current,
	hasAnyDetections,
	offsetMs,
	flash,
}: {
	current: CurrentBird | null;
	hasAnyDetections: boolean;
	offsetMs: number;
	flash: boolean;
}) {
	if (!current && hasAnyDetections) {
		return (
			<HeroCardShell label="Last 24 hours" portrait={<NestPortrait />}>
				<CenteredBody>
					<h1 className="display-title font-bold text-2xl sm:text-3xl">
						All quiet
					</h1>
					<p className="text-muted-foreground">
						Nothing heard in the last 24 hours. New detections will appear here
						on their own.
					</p>
				</CenteredBody>
			</HeroCardShell>
		);
	}

	// A station whose database is still empty.
	if (!current) {
		return (
			<HeroCardShell label="Station status" portrait={<NestPortrait />}>
				<CenteredBody>
					<h1 className="display-title font-bold text-2xl sm:text-3xl">
						Nothing recorded yet
					</h1>
					<p className="text-muted-foreground">
						Once BirdNET-Pi's analysis pipeline writes to birds.db, detections
						will appear here on their own.
					</p>
				</CenteredBody>
			</HeroCardShell>
		);
	}

	// The server measured this age, so it is already correct on the first paint --
	// `offsetMs` is 0 through hydration and only ages it forward from there.
	const elapsedMs = current.ageMs + offsetMs;

	// No figure row: the station's counts live in the cards below -- the log
	// and the Highlights -- so repeating them in the masthead
	// only duplicates what the page already shows.
	return (
		<SpeciesHeroCard
			label="Last 24 hours"
			comName={current.comName}
			sciName={current.sciName}
			speciesSlug={current.speciesSlug}
			imageUrl={current.imageUrl}
			relativeTime={formatTimeAgo(elapsedMs)}
			heardAt={formatDateTime(current.detectedAt)}
			confidence={current.confidence}
			audioUrl={current.audioUrl}
			className={flash ? `${HERO_CARD_SHELL} flash-in` : HERO_CARD_SHELL}
		/>
	);
}

function CenteredBody({ children }: { children: ReactNode }) {
	return (
		<div className="flex flex-1 flex-col justify-center gap-2">{children}</div>
	);
}

function NestPortrait() {
	return (
		// Aligned like HeroPortrait, so the empty state sits in the same slot as
		// the bird it stands in for.
		<div className="flex h-32 w-full items-center justify-center overflow-hidden sm:h-36">
			<img
				src="/illustrations/nest.webp"
				alt="An empty nest"
				className="max-h-full max-w-full object-contain"
			/>
		</div>
	);
}
