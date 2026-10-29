import type { ReactNode } from "react";
import { LivePillSkeleton } from "~/components/now/live-pill.tsx";
import {
	HERO_ACTIONS_CLASS,
	HERO_CARD_SHELL,
	HeroCardShell,
	HeroTextShell,
	SpeciesHeroCard,
} from "~/components/species-hero-card.tsx";
import { formatDateTime } from "~/lib/date-format.ts";
import { EMPTY } from "~/lib/empty-messages.ts";
import type { CurrentBird } from "~/lib/now.ts";
import { formatTimeAgo } from "~/lib/time-ago.ts";
import { useAgeOffset } from "~/lib/use-age-offset.ts";

/**
 * The page's masthead: the most recent detection of the last 24 hours as its
 * portrait. Like everything else on the Live page it is bounded to that window,
 * so once a day passes without a bird the card goes quiet rather than holding
 * up yesterday's news.
 */
export function CurrentBirdCard({
	current,
	hasAnyDetections,
	generatedAt,
	flash,
	pill,
}: {
	current: CurrentBird | null;
	hasAnyDetections: boolean;
	/** When the snapshot was measured; the card ages it once a second itself,
	 * so that tick re-renders this card rather than the whole page. */
	generatedAt: string;
	flash: boolean;
	/** The station's status pill (or its shell), set beside the title. */
	pill: ReactNode;
}) {
	const live = pill;
	const offsetMs = useAgeOffset(generatedAt);

	if (!current && hasAnyDetections) {
		return (
			<HeroCardShell
				label="Last 24 hours"
				portrait={<NestPortrait />}
				actions={live}
			>
				<StandInBody live={live}>
					<h1 className="display-title font-bold text-2xl sm:text-3xl">
						{EMPTY.window.liveQuietTitle}
					</h1>
					<p className="text-muted-foreground">{EMPTY.window.liveQuietBody}</p>
				</StandInBody>
			</HeroCardShell>
		);
	}

	// A station whose database is still empty.
	if (!current) {
		return (
			<HeroCardShell label="Station status" portrait={<NestPortrait />}>
				<StandInBody>
					<h1 className="display-title font-bold text-2xl sm:text-3xl">
						{EMPTY.station.liveHeroTitle}
					</h1>
					<p className="text-muted-foreground">{EMPTY.station.liveHeroBody}</p>
				</StandInBody>
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
			actions={live}
			className={flash ? `${HERO_CARD_SHELL} flash-in` : HERO_CARD_SHELL}
		/>
	);
}

// Laid over an invisible copy of the loading shell's text, in one grid cell,
// so the card keeps the height the shell gave it and the page below doesn't
// jump when the snapshot lands. The text itself stays centred in that height,
// while the pill, if any, keeps to the top-right corner as on the bird card.
function StandInBody({
	live,
	children,
}: {
	live?: ReactNode;
	children: ReactNode;
}) {
	return (
		<div className="grid">
			<div
				aria-hidden="true"
				inert
				className="invisible col-start-1 row-start-1 flex flex-col gap-2.5 max-[400px]:gap-2"
			>
				<HeroTextShell actions={<LivePillSkeleton />} />
			</div>
			<div className="col-start-1 row-start-1 flex items-start justify-between gap-3 max-[400px]:gap-2">
				<div className="flex min-w-0 flex-col justify-center gap-2 self-stretch">
					{children}
				</div>
				{live ? <div className={HERO_ACTIONS_CLASS}>{live}</div> : null}
			</div>
		</div>
	);
}

function NestPortrait() {
	return (
		// Aligned like HeroPortrait, so the empty state sits in the same slot as
		// the bird it stands in for.
		<div className="flex h-28 w-full items-center justify-center overflow-hidden">
			<img
				src="/illustrations/nest.webp"
				alt="An empty nest"
				className="max-h-full max-w-full object-contain"
			/>
		</div>
	);
}
