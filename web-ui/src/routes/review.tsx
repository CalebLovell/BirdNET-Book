import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CircleAlert, RotateCcw, SearchCheck } from "lucide-react";
import { useState } from "react";
import { Deferred } from "~/components/deferred.tsx";
import { PageHeaderCard } from "~/components/page-header-card.tsx";
import { PageStatus } from "~/components/page-status.tsx";
import {
	ReviewWorkflow,
	ReviewWorkflowSkeleton,
} from "~/components/review/review-workflow.tsx";
import { Button } from "~/components/ui/button.tsx";
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

const REVIEW_PAGE_TITLE = "Review detections";

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
	// Gating this route gave its loader a second way to fail: the unlock status
	// resolved in the root's `beforeLoad` can go stale -- another device rotating
	// the session nonce, say -- between that check and the loader's call, and the
	// gated server function then refuses. A narrow window, but without a boundary
	// it surfaces raw.
	errorComponent: ReviewUnavailable,
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
				title={REVIEW_PAGE_TITLE}
				// Fixed, so it is there from the first frame. The threshold that
				// makes a species "rare" is set on the Settings page.
				description="Low-confidence recordings of the station's rarest species, to confirm, correct or delete."
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

function ReviewUnavailable() {
	const router = useRouter();

	return (
		<div className="page-wrap py-4">
			<PageStatus
				tone="unavailable"
				title="Review is unavailable"
				actions={
					<Button
						variant="outline"
						size="sm"
						icon={RotateCcw}
						onClick={() => router.invalidate()}
					>
						Try again
					</Button>
				}
			>
				The detection queue could not be read, or this browser's session expired
				while the page was open. Reload to sign in again.
			</PageStatus>
		</div>
	);
}
