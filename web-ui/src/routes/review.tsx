import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CircleAlert, SearchCheck } from "lucide-react";
import { useState } from "react";
import { Deferred } from "~/components/deferred.tsx";
import { PageHeaderCard } from "~/components/page-header-card.tsx";
import {
	ReviewWorkflow,
	ReviewWorkflowSkeleton,
} from "~/components/review/review-workflow.tsx";
import { PAGE_HEADERS } from "~/lib/page-headers.ts";
import { pageTitle } from "~/lib/page-title.ts";
import { requireUnlocked } from "~/lib/require-unlocked.ts";
import {
	confirmReviewDetection,
	deleteReviewDetection,
	getReviewPage,
	getReviewSpecies,
	recategorizeReviewDetection,
} from "~/lib/review.ts";
import {
	normalizeReviewSearch,
	type SpeciesOption,
} from "~/lib/review-data.ts";
import { useSettled } from "~/lib/use-settled.ts";

export const Route = createFileRoute("/review")({
	head: () => ({ meta: [{ title: pageTitle("Review") }] }),
	validateSearch: normalizeReviewSearch,
	beforeLoad: ({ context, location }) =>
		requireUnlocked(context.auth, location),
	loaderDeps: ({ search }) => search,
	// Deferred: the page renders at once (see Deferred), and the queue fills
	// in when it arrives.
	loader: ({ deps }) => ({
		queue: Promise.all([
			getReviewPage({ data: deps }),
			getReviewSpecies(),
		]).then(([page, species]) => ({ page, species })),
	}),
	component: Review,
});

function Review() {
	const { queue } = Route.useLoaderData();
	// Whether the queue on screen is the latest, to hold the buttons busy.
	const settled = useSettled(queue);
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const router = useRouter();
	const correct = useServerFn(confirmReviewDetection),
		recategorize = useServerFn(recategorizeReviewDetection),
		remove = useServerFn(deleteReviewDetection);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	async function run(work: () => Promise<unknown>) {
		setBusy(true);
		setError(null);
		try {
			await work();
			await router.invalidate();
		} catch {
			setError(
				"The detection could not be changed. Check the recording and try again.",
			);
		} finally {
			setBusy(false);
		}
	}
	return (
		<div className="page-wrap space-y-(--page-gap) py-4">
			<PageHeaderCard
				icon={SearchCheck}
				title={PAGE_HEADERS.review.title}
				description={PAGE_HEADERS.review.description}
			/>
			{error ? (
				<p className="flex items-center gap-2 text-destructive text-sm">
					<CircleAlert className="size-4" />
					{error}
				</p>
			) : null}
			{/* Keyed on the search, so a new page of the queue drops to its shell
			    at once. An action's refetch keeps the same key: the router runs it
			    in a transition, which holds the queue on screen until the new one
			    is in -- and holds the buttons busy until then too. */}
			<Deferred
				key={JSON.stringify(search)}
				promise={queue}
				shell={<ReviewWorkflowSkeleton />}
			>
				{(loaded) => (
					// Keyed by page so a new page starts on its first bird with
					// nothing skipped.
					<ReviewWorkflow
						key={loaded.page.page}
						page={loaded.page}
						species={loaded.species}
						busy={busy || !settled?.current}
						onCorrect={(rowId) => run(() => correct({ data: { rowId } }))}
						onRecategorize={(rowId: number, item: SpeciesOption) =>
							run(() => recategorize({ data: { rowId, ...item } }))
						}
						onDelete={(rowId) => run(() => remove({ data: { rowId } }))}
						onPageChange={(next) =>
							navigate({ search: { ...search, page: next } })
						}
					/>
				)}
			</Deferred>
		</div>
	);
}
