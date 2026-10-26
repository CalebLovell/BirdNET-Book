import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
	SpeciesControlPage,
	SpeciesControlPageSkeleton,
} from "~/components/species-control/species-control-page.tsx";
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
