import { createFileRoute } from "@tanstack/react-router";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { Deferred, ShellReveal } from "~/components/deferred.tsx";
import { HighlightsCard } from "~/components/highlights-card.tsx";
import { CurrentBirdCard } from "~/components/now/current-bird-card.tsx";
import { LiveAudioCard } from "~/components/now/live-audio-card.tsx";
import { LivePill, LivePillSkeleton } from "~/components/now/live-pill.tsx";
import {
	RecentLogCard,
	RecentLogCardSkeleton,
} from "~/components/now/recent-log-card.tsx";
import { SpeciesHeroCardShell } from "~/components/species-hero-card.tsx";
import {
	getLiveHighlights,
	type LiveHighlights,
} from "~/lib/live-highlights.ts";
import { getNowSnapshot, type NowSnapshot } from "~/lib/now.ts";
import { pageTitle } from "~/lib/page-title.ts";
import { getStationStatus } from "~/lib/station-status.ts";
import { useFavicon } from "~/lib/use-favicon.ts";
import { usePolledData } from "~/lib/use-polled-data.ts";

const POLL_INTERVAL_MS = 10_000;
const STATUS_INTERVAL_MS = 30_000;
const FLASH_DURATION_MS = 2_400;
const HIGHLIGHTS_EMPTY = "No detections recorded in the last 24 hours.";

export const Route = createFileRoute("/live")({
	head: () => ({ meta: [{ title: pageTitle("Live") }] }),
	component: Live,
	// The highlights ride the loader alone. They are judged against a fortnight
	// of history and cannot change inside a ten-second poll, so pulling them
	// here keeps their full-table scans off the polling path.
	//
	// Both are deferred -- returned as promises, not awaited -- so the page
	// renders the moment it is opened and each card fills in as its data lands:
	// the 24-hour snapshot quickly, the Highlights (which read the station's
	// whole history) after it.
	loader: ({ context }) => ({
		snapshot: getNowSnapshot(),
		status: getStationStatus(),
		highlights: getLiveHighlights(),
		unlocked: context.auth.unlocked,
	}),
});

/**
 * Keys that arrived since the previous poll, held just long enough for the
 * flash-in highlight to play. Keys travel as a joined signature so the effect
 * compares by value -- a fresh array of identical keys arrives on every poll.
 */
function useFreshKeys(keys: string[]): Set<string> {
	const signature = keys.join("|");
	const seenRef = useRef(new Set(keys));
	const [freshKeys, setFreshKeys] = useState<Set<string>>(new Set());

	useEffect(() => {
		const currentKeys = signature.length > 0 ? signature.split("|") : [];
		const arrived = currentKeys.filter((key) => !seenRef.current.has(key));
		seenRef.current = new Set(currentKeys);
		if (arrived.length === 0) return;

		setFreshKeys(new Set(arrived));
		const timeout = setTimeout(
			() => setFreshKeys(new Set()),
			FLASH_DURATION_MS,
		);
		return () => clearTimeout(timeout);
	}, [signature]);

	return freshKeys;
}

function Live() {
	const {
		snapshot: initialSnapshot,
		status: initialStatus,
		highlights,
		unlocked,
	} = Route.useLoaderData();
	const { data: snapshot } = usePolledData(
		() => getNowSnapshot(),
		initialSnapshot,
		POLL_INTERVAL_MS,
	);
	// Its own call and its own pace: whether the station is running changes
	// rarely, and asking systemd is the one costly part of it.
	const { data: status } = usePolledData(
		() => getStationStatus(),
		initialStatus,
		STATUS_INTERVAL_MS,
	);
	const pill = status ? <LivePill status={status} /> : <LivePillSkeleton />;

	if (!snapshot) return <LiveShell unlocked={unlocked} pill={pill} />;
	return (
		<LiveBody
			snapshot={snapshot}
			highlights={highlights}
			unlocked={unlocked}
			pill={pill}
		/>
	);
}

/**
 * The page before its first snapshot: the hero and the log as shells in their
 * real places, and the Listen card -- which needs no data -- as itself.
 */
function LiveShell({ unlocked, pill }: { unlocked: boolean; pill: ReactNode }) {
	return (
		<div className="page-wrap py-4">
			<SpeciesHeroCardShell label="Last 24 hours" actions={pill} />

			<div className="mt-(--page-gap) grid grid-cols-1 items-start gap-(--page-gap) lg:grid-cols-[minmax(0,5fr)_minmax(0,3fr)]">
				<RecentLogCardSkeleton />

				<div className="grid grid-cols-1 gap-(--page-gap)">
					<LiveAudioCard unlocked={unlocked} />
					<ShellReveal>
						<HighlightsCard
							highlights={null}
							period="live"
							emptyMessage={HIGHLIGHTS_EMPTY}
						/>
					</ShellReveal>
				</div>
			</div>
		</div>
	);
}

function LiveBody({
	snapshot,
	highlights,
	unlocked,
	pill,
}: {
	snapshot: NowSnapshot;
	highlights: Promise<LiveHighlights>;
	unlocked: boolean;
	/** The station's status pill, or its shell until that arrives. */
	pill: ReactNode;
}) {
	const freshKeys = useFreshKeys(snapshot.recent.map((row) => row.key));
	// Follows the poll rather than the loader, so the tab keeps pace with the hero
	// card as new birds arrive. It reuses the hero's own image, whatever that
	// turned out to be, so the two never disagree and the browser fetches once.
	// A null here means nothing was heard in the last 24 hours, and the nest is
	// what the hero card is showing too.
	useFavicon(snapshot.current?.imageUrl ?? null);

	// The hero is left out of the log, so each tracks its own arrivals: a new
	// bird flashes in the hero, and the one it replaced flashes again as it
	// lands at the top of the log.
	const heroKey = snapshot.current?.key;
	const freshHeroKeys = useFreshKeys(heroKey ? [heroKey] : []);
	const heroIsNew = heroKey !== undefined && freshHeroKeys.has(heroKey);

	return (
		<div className="page-wrap py-4">
			<CurrentBirdCard
				current={snapshot.current}
				hasAnyDetections={snapshot.hasAnyDetections}
				generatedAt={snapshot.generatedAt}
				flash={heroIsNew}
				pill={pill}
			/>

			{/* `grid-cols-1` rather than a bare `grid`: the implicit track it would
			    fall back to is sized to max-content, so a long species name in the
			    log pushes the whole page wider than the phone it is on. On a phone
			    the log leads, with Listen and Highlights stacked below it. */}
			<div className="mt-(--page-gap) grid grid-cols-1 items-start gap-(--page-gap) lg:grid-cols-[minmax(0,5fr)_minmax(0,3fr)]">
				<RecentLogCard
					recent={snapshot.recent}
					recentTotal={snapshot.recentTotal}
					generatedAt={snapshot.generatedAt}
					freshKeys={freshKeys}
				/>

				<div className="grid grid-cols-1 gap-(--page-gap)">
					<LiveAudioCard unlocked={unlocked} />

					{/* A station that has never recorded anything has nothing to
					    highlight, and the hero card above already says so, far more
					    plainly. */}
					{snapshot.hasAnyDetections ? (
						<Deferred
							promise={highlights}
							shell={
								<HighlightsCard
									highlights={null}
									period="live"
									emptyMessage={HIGHLIGHTS_EMPTY}
								/>
							}
						>
							{(judged) =>
								judged.hasAnyDetections ? (
									<HighlightsCard
										highlights={judged.highlights}
										thresholds={judged.thresholds}
										period="live"
										emptyMessage={HIGHLIGHTS_EMPTY}
									/>
								) : null
							}
						</Deferred>
					) : null}
				</div>
			</div>
		</div>
	);
}
