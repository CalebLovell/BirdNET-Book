import {
	createFileRoute,
	stripSearchParams,
	useRouter,
	useRouterState,
} from "@tanstack/react-router";
import { Bird } from "lucide-react";
import { z } from "zod";

import { EmptyNote, EmptyState } from "~/components/empty-state.tsx";
import { LearnGame } from "~/components/learn/learn-game.tsx";
import { LearnPoolSelector } from "~/components/learn/learn-layout.tsx";
import { PageHeaderCard } from "~/components/page-header-card.tsx";
import { getLearnRound } from "~/lib/learn.ts";
import { LEARN_POOLS, type LearnPool } from "~/lib/learn-pools.ts";
import { CHOICES_PER_QUESTION } from "~/lib/learn-round.ts";
import { pageTitle } from "~/lib/page-title.ts";
import { useHeldRound } from "~/lib/use-held-round.ts";

const DEFAULT_POOL: LearnPool = "today";

const learnSearchSchema = z.object({
	pool: z.enum(LEARN_POOLS).default(DEFAULT_POOL).catch(DEFAULT_POOL),
});

export const Route = createFileRoute("/learn")({
	head: () => ({ meta: [{ title: pageTitle("Learn") }] }),
	validateSearch: learnSearchSchema,
	search: {
		middlewares: [stripSearchParams({ pool: DEFAULT_POOL })],
	},
	loaderDeps: ({ search }) => ({ pool: search.pool }),
	loader: ({ deps }) => getLearnRound({ data: deps.pool }),
	component: Learn,
});

function Learn() {
	const { round: loadedRound, hasAnyDetections } = Route.useLoaderData();
	const { pool } = Route.useSearch();
	const navigate = Route.useNavigate();
	const router = useRouter();
	// The loader hands back a freshly randomized round every time it runs, so
	// "play again" is just an invalidation -- and the new round's id re-keys the
	// game below, which is what clears the finished round's state. Reruns nobody
	// asked for are held off, so they can't reshuffle a round mid-question.
	const { round, requestNextRound } = useHeldRound(loadedRound, pool);
	const isLoading = useRouterState({ select: (state) => state.isLoading });

	return (
		<div className="page-wrap py-4">
			<PageHeaderCard
				title="Learn the calls"
				description="Ear training on the recordings your own station captured."
			/>

			{/* Gated on the station, not the pool: an empty pool still needs the
			    switcher to reach a fuller one, which is exactly what the empty card
			    advises. */}
			{hasAnyDetections && (
				<LearnPoolSelector
					pool={pool}
					onPoolChange={(value) => {
						navigate({
							search: (previous) => ({ ...previous, pool: value }),
							replace: true,
						});
					}}
				/>
			)}

			<div className="mt-4 w-full">
				{round.questions.length === 0 ? (
					<EmptyPool
						speciesInPool={round.speciesInPool}
						hasAnyDetections={hasAnyDetections}
					/>
				) : (
					<LearnGame
						key={round.id}
						round={round}
						onPlayAgain={() => {
							requestNextRound();
							router.invalidate();
						}}
						isLoadingNextRound={isLoading}
					/>
				)}
			</div>
		</div>
	);
}

function EmptyPool({
	speciesInPool,
	hasAnyDetections,
}: {
	speciesInPool: number;
	hasAnyDetections: boolean;
}) {
	// Pointing at a wider selection is only useful advice when a wider selection
	// could hold something. With nothing recorded anywhere, it would just send
	// someone around a loop of empty pools.
	if (!hasAnyDetections) {
		return (
			<EmptyState icon={Bird} title="No detections recorded yet.">
				A round needs recordings to play, so this page waits until the station
				has heard something.
			</EmptyState>
		);
	}

	return (
		<section className="feature-card rounded-md p-4">
			<div className="island-kicker">Not enough to go on</div>
			<EmptyNote>
				A round needs {CHOICES_PER_QUESTION} species with clear recordings still
				on disk, and this selection has{" "}
				{speciesInPool === 0 ? "none" : speciesInPool}. Try a wider selection —
				All Time always has the most to work with.
			</EmptyNote>
		</section>
	);
}
