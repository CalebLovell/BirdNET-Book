import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { RotateCcw } from "lucide-react";
import { PageStatus } from "~/components/page-status.tsx";
import {
	SpeciesControlPage,
	SpeciesControlPageSkeleton,
} from "~/components/species-control/species-control-page.tsx";
import { Button } from "~/components/ui/button.tsx";
import { pageTitle } from "~/lib/page-title.ts";
import { requireUnlocked } from "~/lib/require-unlocked.ts";
import {
	getSpeciesControlPage,
	saveSpeciesControl,
} from "~/lib/species-control.ts";
import { normalizeSpeciesControlWorkspaceSearch } from "~/lib/species-control-workspace.ts";
import { useSettled } from "~/lib/use-settled.ts";

export const Route = createFileRoute("/species-control")({
	head: () => ({ meta: [{ title: pageTitle("Species Control") }] }),
	validateSearch: normalizeSpeciesControlWorkspaceSearch,
	beforeLoad: ({ context, location }) =>
		requireUnlocked(context.auth, location),
	// Deferred: the page renders at once (see Deferred), and the species fill
	// in when they arrive.
	loader: () => ({ page: getSpeciesControlPage() }),
	component: SpeciesControlRoute,
	errorComponent: SpeciesControlUnavailable,
});

function SpeciesControlRoute() {
	const { page } = Route.useLoaderData();
	// Held, not suspended on, so a committed change's refetch never unmounts
	// the workspace mid-edit.
	const settled = useSettled(page);
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const save = useServerFn(saveSpeciesControl);
	const router = useRouter();

	if (!settled) return <SpeciesControlPageSkeleton search={search} />;

	return (
		<SpeciesControlPage
			initialData={settled.value}
			search={search}
			onSearchChange={(nextSearch) =>
				navigate({ search: nextSearch, replace: true })
			}
			onSave={(data) => save({ data })}
			onCommitted={() => router.invalidate()}
		/>
	);
}

function SpeciesControlUnavailable() {
	const router = useRouter();

	return (
		<div className="page-wrap py-4">
			<PageStatus
				tone="unavailable"
				title="Species control is unavailable"
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
				The installed model catalog or species-list directory could not be read.
				Check the BirdNET model and service permissions, then reload this page.
			</PageStatus>
		</div>
	);
}
