import { createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { RouteError, RouteNotFound } from "~/components/root-status.tsx";
import { MobileNav } from "~/components/sidebar/mobile-nav.tsx";
import { SiteSidebar } from "~/components/sidebar/site-sidebar.tsx";
import { getUnlockStatusFn } from "~/lib/auth.ts";
import { pageTitle } from "~/lib/page-title.ts";
import { DEFAULT_FAVICON } from "~/lib/use-favicon.ts";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
	// Resolved here so the sidebar and every gated route read the same answer
	// from router context instead of each making its own round trip.
	beforeLoad: async () => ({ auth: await getUnlockStatusFn() }),
	head: () => ({
		meta: [
			{
				charSet: "utf-8",
			},
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1",
			},
			{
				title: pageTitle(),
			},
		],
		links: [
			{
				rel: "stylesheet",
				href: appCss,
			},
			// The one and only icon element in the document, standing in until a
			// proper mark exists. Routes that know which bird they are about point
			// this same link somewhere else via `useFavicon` -- see the note there
			// for why they must not render a second one. No `type`: the href gets
			// swapped between webp and png, and a stale type is worse than none.
			{
				rel: "icon",
				href: DEFAULT_FAVICON,
			},
		],
	}),
	// Placed on the root so nothing can fall through to the router's own bare
	// defaults. `notFoundMode` stays at its default of `fuzzy`, so a route that
	// wants to keep its own masthead only has to declare its own handler.
	notFoundComponent: RouteNotFound,
	errorComponent: RouteError,
	shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body>
				{/* The shell is pinned to the viewport and never scrolls itself.
				    Scrolling happens only inside `main`, which is what keeps the
				    sidebar and the mobile bar fixed in frame like a dashboard.

				    `fixed inset-0` rather than a `h-dvh` block in flow: anything else
				    on the page that pokes below the fold (such as a portalled overlay)
				    can still make the document scrollable, and a
				    shell in flow would ride along with it. Pinned, it cannot move.

				    `min-h-0` on the content column is the part that makes it work:
				    a flex child's default `min-height: auto` refuses to shrink below
				    its content, so without it the column grows past the viewport and
				    the overflow escapes to the window again.

				    `min-w-0` stops a wide table or a long species name from forcing
				    the whole row wider than the viewport and squeezing the sidebar. */}
				<div className="fixed inset-0 flex overflow-hidden">
					<SiteSidebar />
					<div className="flex min-h-0 min-w-0 flex-1 flex-col">
						<MobileNav />
						{/* No `scrollbar-gutter` here on purpose: reserving the gutter
						    always would leave a dead band at the right edge on top of
						    the page's own 1rem, so the content would sit further from
						    the edge than it does from the sidebar. */}
						<main id="app-scroll" className="min-h-0 flex-1 overflow-y-auto">
							{children}
						</main>
					</div>
				</div>
				<Scripts />
			</body>
		</html>
	);
}
