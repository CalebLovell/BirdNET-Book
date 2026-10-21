import {
	createFileRoute,
	stripSearchParams,
	useRouter,
} from "@tanstack/react-router";
import { Lightbulb } from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";
import {
	LearnGame,
	LearnGameEmpty,
	LearnGameSkeleton,
} from "~/components/learn/learn-game.tsx";
import { LearnPoolSelector } from "~/components/learn/learn-layout.tsx";
import { PageHeaderCard } from "~/components/page-header-card.tsx";
import { EMPTY } from "~/lib/empty-messages.ts";
import { getLearnRound } from "~/lib/learn.ts";
import { LEARN_POOLS, type LearnPool } from "~/lib/learn-pools.ts";
import { PAGE_HEADERS } from "~/lib/page-headers.ts";
import { pageTitle } from "~/lib/page-title.ts";
import { useHeldRound } from "~/lib/use-held-round.ts";

const DEFAULT_POOL: LearnPool = "common";

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
	// Deferred: the page renders at once (see Deferred), and the round fills
	// in when it arrives.
	loader: ({ deps }) => ({ round: getLearnRound({ data: deps.pool }) }),
	component: Learn,
});

type LoadedRound = Awaited<ReturnType<typeof getLearnRound>>;

function Learn() {
	const { round: roundPromise } = Route.useLoaderData();
	const { pool } = Route.useSearch();
	const navigate = Route.useNavigate();

	// The latest round to arrive, with the pool it was dealt from and the
	// promise it came on. A round from another pool is no use once the pool
	// has changed -- the game drops to its shell -- but one from this pool
	// stays on screen while "play again" deals the next.
	const [loaded, setLoaded] = useState<{
		data: LoadedRound;
		pool: LearnPool;
		from: Promise<LoadedRound>;
	} | null>(null);
	useEffect(() => {
		let cancelled = false;
		roundPromise.then(
			(data) => {
				if (!cancelled) setLoaded({ data, pool, from: roundPromise });
			},
			() => {},
		);
		return () => {
			cancelled = true;
		};
	}, [roundPromise, pool]);
	const forPool = loaded?.pool === pool ? loaded : null;

	return (
		<div className="page-wrap py-4">
			<PageHeaderCard
				icon={Lightbulb}
				title={PAGE_HEADERS.learn.title}
				description={PAGE_HEADERS.learn.description}
			/>

			{/* Always drawn, an empty station included: the pool comes from the
			    URL, and the page keeps the shape its loading state promised. */}
			<LearnPoolSelector
				pool={pool}
				// The counts don't depend on the pool, so any round that has
				// arrived can supply them -- switching pools keeps them on screen.
				poolCounts={loaded?.data.poolCounts ?? null}
				onPoolChange={(value) => {
					navigate({
						search: (previous) => ({ ...previous, pool: value }),
						replace: true,
					});
				}}
			/>

			<div className="mt-(--page-gap) w-full">
				{forPool ? (
					<LearnRoundView
						key={pool}
						loaded={forPool.data}
						pool={pool}
						isLoadingNextRound={forPool.from !== roundPromise}
					/>
				) : (
					<LearnGameSkeleton />
				)}
			</div>
		</div>
	);
}

function LearnRoundView({
	loaded,
	pool,
	isLoadingNextRound,
}: {
	loaded: LoadedRound;
	pool: LearnPool;
	isLoadingNextRound: boolean;
}) {
	const router = useRouter();
	// The loader hands back a freshly randomized round every time it runs, so
	// "play again" is just an invalidation -- and the new round's id re-keys the
	// game below, which is what clears the finished round's state. Reruns nobody
	// asked for are held off, so they can't reshuffle a round mid-question.
	const { round, requestNextRound } = useHeldRound(loaded.round, pool);

	return round.questions.length === 0 ? (
		<EmptyPool hasAnyDetections={loaded.hasAnyDetections} />
	) : (
		<LearnGame
			key={round.id}
			round={round}
			rareMax={loaded.rareMax}
			onPlayAgain={() => {
				requestNextRound();
				router.invalidate();
			}}
			isLoadingNextRound={isLoadingNextRound}
		/>
	);
}

function EmptyPool({ hasAnyDetections }: { hasAnyDetections: boolean }) {
	// Nothing recorded anywhere is a different gap from a selection too narrow
	// to fill a round, so each names its own missing thing.
	return (
		<LearnGameEmpty
			message={
				hasAnyDetections ? EMPTY.filter.learnPool : EMPTY.station.recordings
			}
		/>
	);
}
