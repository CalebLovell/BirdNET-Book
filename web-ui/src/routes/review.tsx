import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CheckCheck, CircleAlert } from "lucide-react";
import { useState } from "react";
import { PageHeaderCard } from "~/components/page-header-card.tsx";
import { PageStatus } from "~/components/page-status.tsx";
import { ReviewQueueSettings } from "~/components/review/review-queue-settings.tsx";
import { ReviewWorkflow } from "~/components/review/review-workflow.tsx";
import { Button } from "~/components/ui/button.tsx";
import { CONFIDENT_MIN, formatConfidence } from "~/lib/confidence.ts";
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
import { saveReviewSettingsFn } from "~/lib/settings.ts";

const REVIEW_PAGE_TITLE = "Review detections";

export const Route = createFileRoute("/review")({
	head: () => ({ meta: [{ title: pageTitle("Review") }] }),
	validateSearch: normalizeReviewSearch,
	beforeLoad: ({ context, location }) =>
		requireUnlocked(context.auth, location),
	loaderDeps: ({ search }) => search,
	loader: async ({ deps }) => ({
		page: await getReviewPage({ data: deps }),
		species: await getReviewSpecies(),
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
	const loaded = Route.useLoaderData();
	const { page, species } = loaded;
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const router = useRouter();
	const correct = useServerFn(confirmReviewDetection),
		recategorize = useServerFn(recategorizeReviewDetection),
		remove = useServerFn(deleteReviewDetection),
		saveQueueSettings = useServerFn(saveReviewSettingsFn);
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
				icon={CheckCheck}
				title={REVIEW_PAGE_TITLE}
				description={`Species the station has heard fewer than ${page.rareSpeciesMax} times, on recordings BirdNET scored below ${formatConfidence(CONFIDENT_MIN)}.`}
				action={
					<ReviewQueueSettings
						rareSpeciesMax={page.rareSpeciesMax}
						onSave={async (rareSpeciesMax) => {
							await saveQueueSettings({ data: { rareSpeciesMax } });
							// The threshold decides the queue, so the page has to be
							// refetched before the new number means anything on screen.
							await router.invalidate();
						}}
					/>
				}
			/>
			{error ? (
				<p className="flex items-center gap-2 text-destructive text-sm">
					<CircleAlert className="size-4" />
					{error}
				</p>
			) : null}
			{/* Keyed by page so a new page starts on its first bird with nothing
			    skipped. */}
			<ReviewWorkflow
				key={page.page}
				page={page}
				species={species}
				busy={busy}
				onCorrect={(rowId) => run(() => correct({ data: { rowId } }))}
				onRecategorize={(rowId: number, item: SpeciesOption) =>
					run(() => recategorize({ data: { rowId, ...item } }))
				}
				onDelete={(rowId) => run(() => remove({ data: { rowId } }))}
				onPageChange={(next) => navigate({ search: { ...search, page: next } })}
			/>
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
