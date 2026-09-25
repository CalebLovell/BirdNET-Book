import {
	createFileRoute,
	useRouteContext,
	useRouter,
} from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import type { RowSelectionState } from "@tanstack/react-table";
import { Bird, CircleAlert } from "lucide-react";
import { useState } from "react";
import { DeleteDetectionsDialog } from "~/components/detections/delete-detections-dialog.tsx";
import {
	DetectionsFilters,
	DetectionsTable,
} from "~/components/detections/detections-table.tsx";
import { EmptyNote, EmptyState } from "~/components/empty-state.tsx";
import { PageHeaderCard } from "~/components/page-header-card.tsx";
import {
	hasActiveFilters,
	normalizeDetectionWorkspaceSearch,
} from "~/lib/detection-workspace.ts";
import { deleteDetections, getDetectionsPage } from "~/lib/detections.ts";
import { pageTitle } from "~/lib/page-title.ts";

type Feedback = {
	message: string;
	tone: "error" | "success";
};

export const Route = createFileRoute("/detections")({
	head: () => ({ meta: [{ title: pageTitle("Detections") }] }),
	validateSearch: (search) => normalizeDetectionWorkspaceSearch(search),
	loaderDeps: ({ search }) => search,
	loader: ({ deps }) => getDetectionsPage({ data: deps }),
	component: Detections,
});

function Detections() {
	const page = Route.useLoaderData();
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const router = useRouter();
	// The delete path is gated on the server, so a locked visitor could only ever
	// reach a refusal through it. The button and the checkboxes that feed it come
	// off entirely rather than sitting there offering something that cannot work.
	const { auth } = useRouteContext({ from: "__root__" });
	const canDelete = auth.unlocked;
	const runDeletion = useServerFn(deleteDetections);
	const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);
	const [feedback, setFeedback] = useState<Feedback | null>(null);
	const selectedRowIds = Object.entries(rowSelection)
		.filter(([, isSelected]) => isSelected)
		.map(([rowId]) => Number(rowId));
	const selectedCount = selectedRowIds.length;
	const isFiltered = hasActiveFilters(search);
	const isEmpty = page.total === 0;
	// Only a station that has never recorded anything drops its filters. An empty
	// filter result keeps them, or there would be no way to clear the filter that
	// emptied it.
	const stationEmpty = isEmpty && !isFiltered;

	async function confirmDeletion() {
		setIsDeleting(true);
		setFeedback(null);

		try {
			const result = await runDeletion({ data: { rowIds: selectedRowIds } });
			setDeleteOpen(false);
			setRowSelection({});
			setFeedback({
				tone: result.failedFiles > 0 ? "error" : "success",
				message:
					result.failedFiles > 0
						? `Deleted ${result.deletedRecords} detection${result.deletedRecords === 1 ? "" : "s"}, but ${result.failedFiles} audio file${result.failedFiles === 1 ? "" : "s"} could not be removed.`
						: `Deleted ${result.deletedRecords} detection${result.deletedRecords === 1 ? "" : "s"}.`,
			});

			if (search.page > 1 && selectedCount === page.rows.length) {
				navigate({
					search: { ...search, page: search.page - 1 },
					replace: true,
				});
			}

			await router.invalidate();
		} catch {
			setFeedback({
				tone: "error",
				message: "Unable to delete the selected detections. Please try again.",
			});
		} finally {
			setIsDeleting(false);
		}
	}

	return (
		// The page fills `main` exactly and never scrolls itself, so the header,
		// filters and the card's pager all hold their place and only the rows
		// move. `h-full` measures against `main`, which the shell has already
		// bounded to the viewport.
		<div className="page-wrap flex h-full min-h-0 flex-col gap-(--page-gap) py-4">
			<div className="shrink-0 space-y-(--page-gap)">
				<PageHeaderCard
					title="Detections"
					description="Browse, filter, and manage every individual detection."
				/>

				{!stationEmpty && (
					<DetectionsFilters
						search={search}
						onSearchChange={(nextSearch) => {
							setRowSelection({});
							navigate({ search: nextSearch, replace: true });
						}}
					/>
				)}

				{feedback ? (
					<p
						className={
							feedback.tone === "error"
								? "flex items-center gap-2 text-destructive text-sm"
								: "text-muted-foreground text-sm"
						}
					>
						{feedback.tone === "error" ? (
							<CircleAlert className="size-4" />
						) : null}
						{feedback.message}
					</p>
				) : null}
			</div>

			{/* A station that has never recorded anything replaces the table card
			    outright rather than sitting a card inside it -- there is no table
			    to head, and the filters above are gone too, so the shell would be
			    an empty frame around one message. A filter that matched nothing
			    keeps the card: the control that emptied it is right there. */}
			{stationEmpty ? (
				<EmptyState icon={Bird} title="No detections recorded yet.">
					Detections will appear here once the station hears something.
				</EmptyState>
			) : (
				/* Takes the leftover height when there are rows to scroll. An empty
				   filter result has nothing to scroll, so it keeps its natural size
				   rather than stretching a one-line message down the whole page.
				   `overflow-hidden` clips the table's header band, which runs out to
				   the card's top-left edge, to the card's rounded corner -- square, it
				   painted over the border's curve there. */
				<section
					aria-label="Detections"
					className={`feature-card flex min-h-0 flex-col overflow-hidden rounded-md p-(--page-gap) [--card-edge:min(var(--page-gap),0.75rem)] ${isEmpty ? "shrink-0 pt-0" : "flex-1 pr-(--card-edge) pb-0"}`}
				>
					{/* No header strip: the "All detections" kicker is gone and Delete
					    moved up into the filter row, so the table starts at the top of
					    the card and takes its full height. */}
					{isEmpty ? (
						<EmptyNote>No detections match these filters.</EmptyNote>
					) : (
						<DetectionsTable
							page={page}
							search={search}
							onSearchChange={(nextSearch) =>
								navigate({ search: nextSearch, replace: true })
							}
							rowSelection={rowSelection}
							onRowSelectionChange={setRowSelection}
							canDelete={canDelete}
							onDeleteSelected={() => setDeleteOpen(true)}
						/>
					)}
				</section>
			)}

			{deleteOpen ? (
				<DeleteDetectionsDialog
					count={selectedCount}
					pending={isDeleting}
					onCancel={() => setDeleteOpen(false)}
					onConfirm={confirmDeletion}
				/>
			) : null}
		</div>
	);
}
