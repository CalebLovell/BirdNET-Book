import { Link, useRouteContext } from "@tanstack/react-router";

import { SidebarNav } from "~/components/sidebar/sidebar-nav.tsx";
import { SiteSearch } from "~/components/sidebar/site-search.tsx";
import { SongbookWordmark } from "~/components/sidebar/songbook-wordmark.tsx";

/**
 * Everything inside the sidebar, shared by the desktop column and the mobile
 * drawer so the two can never drift apart.
 *
 * The drawer passes `withTitle={false}`: it carries the site name in its own
 * top bar, a copy of the mobile bar, so the name doesn't jump when it opens.
 */
export function SidebarBody({
	onNavigate,
	withTitle = true,
}: {
	onNavigate?: () => void;
	withTitle?: boolean;
}) {
	const { auth } = useRouteContext({ from: "__root__" });
	return (
		<div className="flex min-h-full flex-col py-3">
			{/* The wordmark, and under it which station this is, over a hairline.
			    Both start where the nav's icons and labels do (the nav's inset plus
			    a link's padding), and the hairline spans what the search box and
			    the section labels' lines do. A station with no name set shows the
			    wordmark alone. */}
			{withTitle ? (
				<>
					<Link
						to="/"
						onClick={onNavigate}
						className="flex flex-col items-start px-[1.375rem] pt-1 pb-3 no-underline"
					>
						<SongbookWordmark className="shrink-0 text-[24px] text-[var(--moss)]" />
						{auth.siteName ? (
							<span className="mt-0.5 text-muted-foreground text-xs">
								{auth.siteName}
							</span>
						) : null}
					</Link>
					<div aria-hidden="true" className="mx-3 mb-3 h-px bg-[var(--line)]" />
				</>
			) : null}

			<SiteSearch onNavigate={onNavigate} />

			<SidebarNav onNavigate={onNavigate} />
		</div>
	);
}

/**
 * The desktop sidebar: a card in the same family as the page's content cards,
 * inset from the viewport so paper shows to its left and above and below it.
 *
 * Nothing sticky or fixed here: the shell in `__root` is a single non-scrolling
 * viewport, so the column simply sits in normal flow at full height and stays
 * put while the content pane scrolls beside it. That also means the main column
 * needs no matching left offset, so the two can never disagree about width.
 *
 * The inset lives on the `aside` and the scrolling on the card inside it: a
 * single element can't both be the full-height box and the padded card without
 * the padding scrolling away with the content. `h-full` then makes the card
 * exactly a viewport minus the inset, so the account row stays reachable on a
 * short window.
 */
// From `xl` (1280px), not earlier: the sidebar's 272px column has to leave the
// page room for the timeline's full heat map -- 24 fixed squares beside the
// species names, about 1234px of window in all. Below that the mobile menu
// stands in, and the page gets the whole width.
export function SiteSidebar() {
	return (
		<aside className="hidden h-full shrink-0 py-4 pl-4 xl:block">
			<div className="feature-card h-full w-64 overflow-y-auto rounded-md">
				<SidebarBody />
			</div>
		</aside>
	);
}
