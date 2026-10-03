import { createFileRoute, redirect } from "@tanstack/react-router";

// The species list moved to /birds. Old links and bookmarks land there, with
// their search (page, sort, filter) carried across.
export const Route = createFileRoute("/species/")({
	beforeLoad: ({ search }) => {
		throw redirect({ to: "/birds", search, replace: true });
	},
});
