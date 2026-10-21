import {
	createFileRoute,
	useRouteContext,
	useRouter,
} from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import type { RowSelectionState } from "@tanstack/react-table";
import { AudioWaveform } from "lucide-react";
import { useState } from "react";
import { CardHeader } from "~/components/card-header.tsx";
import { Deferred, SHELL_DELAY_MS } from "~/components/deferred.tsx";
import { DeleteDetectionsDialog } from "~/components/detections/delete-detections-dialog.tsx";
import {
	DetectionsFilters,
	DetectionsTable,
} from "~/components/detections/detections-table.tsx";
import { EmptyNote } from "~/components/empty-state.tsx";
import { PageHeaderCard } from "~/components/page-header-card.tsx";
import { destructiveToast, toast } from "~/components/ui/toaster.tsx";
import {
	type DetectionWorkspaceSearch,
	hasActiveFilters,
	normalizeDetectionWorkspaceSearch,
} from "~/lib/detection-workspace.ts";
import { deleteDetections, getDetectionsPage } from "~/lib/detections.ts";
import { EMPTY } from "~/lib/empty-messages.ts";
import { PAGE_HEADERS } from "~/lib/page-headers.ts";
import { pageTitle } from "~/lib/page-title.ts";
import { useSettled } from "~/lib/use-settled.ts";

export const Route = createFileRoute("/detections")({
	head: () => ({ meta: [{ title: pageTitle("Detections") }] }),
	validateSearch: (search) => normalizeDetectionWorkspaceSearch(search),
	loaderDeps: ({ search }) => search,
	// Deferred: the page and its filters render at once (see Deferred), and
	// the table fills in when its page of rows arrives.
	loader: ({ deps }) => ({ page: getDetectionsPage({ data: deps }) }),
	component: Detections,
});

// Shared by the loaded table's card and its skeleton's.
const TABLE_CARD_CLASS =
	"feature-card flex min-h-0 flex-col overflow-hidden rounded-md p-(--page-gap) [--card-edge:min(var(--page-gap),0.75rem)]";

function Detections() {
	const { page: pagePromise } = Route.useLoaderData();
	// The rows on screen, for the bits of the page outside the table that
	// count them; null until the first page is in.
	const settled = useSettled(pagePromise);
	const page = settled?.current ? settled.value : null;
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
	const selectedRowIds = Object.entries(rowSelection)
		.filter(([, isSelected]) => isSelected)
		.map(([rowId]) => Number(rowId));
	const selectedCount = selectedRowIds.length;
	const isFiltered = hasActiveFilters(search);

	async function confirmDeletion() {
		setIsDeleting(true);

		try {
			const result = await runDeletion({ data: { rowIds: selectedRowIds } });
			setDeleteOpen(false);
			setRowSelection({});
			const deleted = `Deleted ${result.deletedRecords} detection${result.deletedRecords === 1 ? "" : "s"}.`;
			if (result.failedFiles > 0) {
				toast.warning(deleted, {
					description: `${result.failedFiles} audio file${result.failedFiles === 1 ? "" : "s"} could not be removed.`,
				});
			} else {
				destructiveToast(deleted);
			}

			if (search.page > 1 && selectedCount === page?.rows.length) {
				navigate({
					search: { ...search, page: search.page - 1 },
					replace: true,
				});
			}

			await router.invalidate();
		} catch {
			toast.error("Unable to delete the selected detections.", {
				description: "Please try again.",
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
					icon={AudioWaveform}
					title={PAGE_HEADERS.detections.title}
					description={PAGE_HEADERS.detections.description}
				/>

				<DetectionsFilters
					search={search}
					onSearchChange={(nextSearch) => {
						setRowSelection({});
						navigate({ search: nextSearch, replace: true });
					}}
				/>
			</div>

			{/* A new search, filter, sort or page keeps the current card up for a
			    moment: most answers land inside it and swap straight in, rather
			    than flashing the table's shell between two results on every
			    keystroke. A slow one still drops to the shell. */}
			<Deferred
				promise={pagePromise}
				shellAfterMs={SHELL_DELAY_MS}
				className="flex min-h-0 flex-1 flex-col"
				shell={
					<DetectionsTableShell
						search={search}
						canDelete={canDelete}
						onSearchChange={(nextSearch) =>
							navigate({ search: nextSearch, replace: true })
						}
					/>
				}
			>
				{(loaded) =>
					loaded.total === 0 ? (
						// Nothing to list: a plain titled card with one line, sized to
						// its content rather than holding a table's header and pager.
						<section
							aria-label="Detections"
							className="feature-card shrink-0 rounded-md p-4"
						>
							<CardHeader title="Detections" />
							{/* Unfiltered and still empty: the station has never recorded
							    anything. Otherwise the filters emptied it. */}
							<EmptyNote>
								{isFiltered
									? EMPTY.filter.detectionsFilters
									: EMPTY.station.detections}
							</EmptyNote>
						</section>
					) : (
						/* Takes the leftover height, so only the rows scroll.
						   `overflow-hidden` clips the table's header band, which runs
						   out to the card's top-left edge, to the card's rounded corner
						   -- square, it painted over the border's curve there. */
						<section
							aria-label="Detections"
							className={`${TABLE_CARD_CLASS} flex-1 pr-(--card-edge) pb-0`}
						>
							<DetectionsTable
								page={loaded}
								search={search}
								onSearchChange={(nextSearch) =>
									navigate({ search: nextSearch, replace: true })
								}
								rowSelection={rowSelection}
								onRowSelectionChange={setRowSelection}
								canDelete={canDelete}
								onDeleteSelected={() => setDeleteOpen(true)}
							/>
						</section>
					)
				}
			</Deferred>

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

/** The table card as the loaded page draws it, holding the table's own
    skeleton (see DetectionsTable with no page). */
function DetectionsTableShell({
	search,
	canDelete,
	onSearchChange,
}: {
	search: DetectionWorkspaceSearch;
	canDelete: boolean;
	onSearchChange: (search: DetectionWorkspaceSearch) => void;
}) {
	return (
		<section
			aria-busy="true"
			aria-label="Detections"
			className={`${TABLE_CARD_CLASS} flex-1 pr-(--card-edge) pb-0`}
		>
			<DetectionsTable
				page={null}
				search={search}
				onSearchChange={onSearchChange}
				rowSelection={{}}
				onRowSelectionChange={() => {}}
				canDelete={canDelete}
				onDeleteSelected={() => {}}
			/>
		</section>
	);
}
