import {
	createRootRoute,
	HeadContent,
	ScriptOnce,
	Scripts,
} from "@tanstack/react-router";
import { RouteError, RouteNotFound } from "~/components/root-status.tsx";
import { MobileNav } from "~/components/sidebar/mobile-nav.tsx";
import { SiteSidebar } from "~/components/sidebar/site-sidebar.tsx";
import { Toaster } from "~/components/ui/toaster.tsx";
import { pageTitle } from "~/lib/page-title.ts";
import { unlockStatusForNavigation } from "~/lib/unlock-status.ts";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
	// Resolved here so the sidebar and every gated route read the same answer
	// from router context instead of each making its own round trip -- and from
	// the browser's last answer rather than the server, so a click never waits
	// on it (see unlock-status.ts).
	beforeLoad: async () => ({ auth: await unlockStatusForNavigation() }),
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
			// The wordmark's singing book, on every page.
			{
				rel: "icon",
				type: "image/svg+xml",
				href: "/songbook.svg",
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

/**
 * Measures the browser's scrollbar once, before the first paint, into
 * `--scrollbar-w`: 15px or so for a classic desktop scrollbar, 0 where
 * scrollbars float over the content (phones, most Macs). The page's right
 * padding counts the reserved gutter toward its own spacing (see `.page-wrap`),
 * and reading it this early means that padding is right on the first frame
 * rather than settling after hydration. A <style> rather than an attribute on
 * <html>, so hydration finds nothing it didn't render.
 */
const SCROLLBAR_PROBE = `(() => {
	const probe = document.createElement("div");
	probe.style.cssText = "position:absolute;visibility:hidden;width:100px;height:100px;overflow:scroll";
	document.documentElement.appendChild(probe);
	const width = probe.offsetWidth - probe.clientWidth;
	probe.remove();
	const style = document.createElement("style");
	style.textContent = ":root{--scrollbar-w:" + width + "px}";
	document.head.appendChild(style);
})()`;

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<head>
				<HeadContent />
				<ScriptOnce>{SCROLLBAR_PROBE}</ScriptOnce>
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
						{/* The scrollbar's gutter is always reserved, so a page that
						    grows past the viewport (a tall shell giving way to a short
						    empty card, say) doesn't change the content's width and
						    walk everything sideways. Right edge only: mirroring it on
						    the left opens a gap between the sidebar and the page. */}
						<main
							id="app-scroll"
							className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]"
						>
							{children}
						</main>
					</div>
				</div>
				<Toaster />
				<Scripts />
			</body>
		</html>
	);
}
