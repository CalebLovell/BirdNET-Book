import {
	createFileRoute,
	stripSearchParams,
	useRouter,
} from "@tanstack/react-router";
import { Lightbulb, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import {
	LearnGame,
	LearnGameEmpty,
	LearnGameSkeleton,
} from "~/components/learn/learn-game.tsx";
import { LearnPoolSelector } from "~/components/learn/learn-layout.tsx";
import { PageHeaderCard } from "~/components/page-header-card.tsx";
import { ConfirmDialog } from "~/components/ui/confirm-dialog.tsx";
import { EMPTY } from "~/lib/empty-messages.ts";
import { getLearnRound } from "~/lib/learn.ts";
import { LEARN_POOLS, type LearnPool } from "~/lib/learn-pools.ts";
import {
	type GameProgress,
	loadSavedGame,
	saveGame,
} from "~/lib/learn-saved-game.ts";
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
	// "New round" lives in the pool row, above the game, so the page asks for
	// it: the confirmation is drawn here, and each confirmed request bumps a
	// count the round view acts on.
	const [isConfirmingNewRound, setIsConfirmingNewRound] = useState(false);
	const [newRoundRequests, setNewRoundRequests] = useState(0);
	const hasRound = (forPool?.data.round.questions.length ?? 0) > 0;

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
				onNewRound={hasRound ? () => setIsConfirmingNewRound(true) : undefined}
			/>

			<div className="mt-(--page-gap) w-full">
				{forPool ? (
					<LearnRoundView
						key={pool}
						loaded={forPool.data}
						pool={pool}
						isLoadingNextRound={forPool.from !== roundPromise}
						newRoundRequests={newRoundRequests}
						isPaused={isConfirmingNewRound}
					/>
				) : (
					<LearnGameSkeleton />
				)}
			</div>

			{isConfirmingNewRound ? (
				<ConfirmDialog
					title="Start a new round?"
					description="This round's answers and score are lost, and a new set of calls is dealt."
					confirmIcon={RotateCcw}
					confirmLabel="New Round"
					destructive
					onCancel={() => setIsConfirmingNewRound(false)}
					onConfirm={() => {
						setIsConfirmingNewRound(false);
						setNewRoundRequests((count) => count + 1);
					}}
				/>
			) : null}
		</div>
	);
}

function LearnRoundView({
	loaded,
	pool,
	isLoadingNextRound,
	newRoundRequests,
	isPaused,
}: {
	loaded: LoadedRound;
	pool: LearnPool;
	isLoadingNextRound: boolean;
	/** Bumped each time the page's "New round" is confirmed. */
	newRoundRequests: number;
	isPaused: boolean;
}) {
	const router = useRouter();
	// The game this tab already had going in the pool, if any, read once as
	// the pool opens. Only ever rendered on the client (the round arrives in an
	// effect), so sessionStorage is there to read.
	const [saved] = useState(() => loadSavedGame(pool));
	// The loader hands back a freshly randomized round every time it runs, so
	// "play again" is just an invalidation -- and the new round's id re-keys the
	// game below, which is what clears the finished round's state. Reruns nobody
	// asked for are held off, so they can't reshuffle a round mid-question.
	const { round, requestNextRound } = useHeldRound(
		loaded.round,
		pool,
		saved?.round,
	);
	// Every step is saved with its round, a fresh round's starting point
	// included, so switching away at any moment loses nothing.
	const onProgressChange = useCallback(
		(progress: GameProgress) => saveGame(pool, { round, progress }),
		[pool, round],
	);
	const playAgain = () => {
		requestNextRound();
		router.invalidate();
	};

	// A confirmed "New round" from the pool row deals one the same way "play
	// again" does. Requests made before this pool's view opened are not its to
	// act on, so only a count past the one it started with counts.
	const handledRequests = useRef(newRoundRequests);
	useEffect(() => {
		if (newRoundRequests === handledRequests.current) return;
		handledRequests.current = newRoundRequests;
		playAgain();
	});

	return round.questions.length === 0 ? (
		<EmptyPool hasAnyDetections={loaded.hasAnyDetections} />
	) : (
		<LearnGame
			key={round.id}
			round={round}
			rareMax={loaded.rareMax}
			initialProgress={
				saved?.round.id === round.id ? saved.progress : undefined
			}
			onProgressChange={onProgressChange}
			onPlayAgain={playAgain}
			isLoadingNextRound={isLoadingNextRound}
			isPaused={isPaused}
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
