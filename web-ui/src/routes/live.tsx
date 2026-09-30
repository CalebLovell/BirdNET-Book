import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { HighlightsCard } from "~/components/highlights-card.tsx";
import { CurrentBirdCard } from "~/components/now/current-bird-card.tsx";
import { LiveAudioCard } from "~/components/now/live-audio-card.tsx";
import { RecentLogCard } from "~/components/now/recent-log-card.tsx";
import { getLiveHighlights } from "~/lib/live-highlights.ts";
import { getNowSnapshot } from "~/lib/now.ts";
import { pageTitle } from "~/lib/page-title.ts";
import { useAgeOffset } from "~/lib/use-age-offset.ts";
import { useFavicon } from "~/lib/use-favicon.ts";
import { usePolledData } from "~/lib/use-polled-data.ts";

const POLL_INTERVAL_MS = 10_000;
const FLASH_DURATION_MS = 2_400;

export const Route = createFileRoute("/live")({
	head: () => ({ meta: [{ title: pageTitle("Live") }] }),
	component: Live,
	// The highlights ride the loader alone. They are judged against a fortnight
	// of history and cannot change inside a ten-second poll, so pulling them
	// here keeps their full-table scans off the polling path.
	loader: async ({ context }) => {
		const [snapshot, highlights] = await Promise.all([
			getNowSnapshot(),
			getLiveHighlights(),
		]);
		return { snapshot, highlights, unlocked: context.auth.unlocked };
	},
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
		highlights,
		unlocked,
	} = Route.useLoaderData();
	const { data: snapshot } = usePolledData(
		() => getNowSnapshot(),
		initialSnapshot,
		POLL_INTERVAL_MS,
	);
	const offsetMs = useAgeOffset(snapshot.generatedAt);
	const freshKeys = useFreshKeys(snapshot.recent.map((row) => row.key));
	// Follows the poll rather than the loader, so the tab keeps pace with the hero
	// card as new birds arrive. It reuses the hero's own image, whatever that
	// turned out to be, so the two never disagree and the browser fetches once.
	// A null here means nothing has ever been heard, and the nest is what the
	// hero card is showing too.
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
				offsetMs={offsetMs}
				flash={heroIsNew}
			/>

			{/* `grid-cols-1` rather than a bare `grid`: the implicit track it would
			    fall back to is sized to max-content, so a long species name in the
			    log pushes the whole page wider than the phone it is on. The rail
			    comes first on a phone, so Listen is in reach without scrolling
			    past the whole log. */}
			<div className="mt-(--page-gap) grid grid-cols-1 items-start gap-(--page-gap) lg:grid-cols-[minmax(0,5fr)_minmax(0,3fr)]">
				<RecentLogCard
					recent={snapshot.recent}
					recentTotal={snapshot.recentTotal}
					generatedAt={snapshot.generatedAt}
					totalDetections={snapshot.summary.detections}
					freshKeys={freshKeys}
				/>

				<div className="order-first grid grid-cols-1 gap-(--page-gap) lg:order-none">
					<LiveAudioCard unlocked={unlocked} />

					{/* A station that has never recorded anything has nothing to
					    highlight, and the hero card above already says so, far more
					    plainly. */}
					{highlights.hasAnyDetections ? (
						<HighlightsCard
							highlights={highlights.highlights}
							emptyMessage="No detections recorded in the last 24 hours."
						/>
					) : null}
				</div>
			</div>
		</div>
	);
}
