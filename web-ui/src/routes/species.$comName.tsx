import { createFileRoute, redirect } from "@tanstack/react-router";

// A bird's page moved to /birds/<slug>. Old links and bookmarks land there.
export const Route = createFileRoute("/species/$comName")({
	beforeLoad: ({ params }) => {
		throw redirect({
			to: "/birds/$comName",
			params: { comName: params.comName },
			replace: true,
		});
	},
});
