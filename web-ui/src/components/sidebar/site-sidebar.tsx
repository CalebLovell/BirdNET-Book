import { Link } from "@tanstack/react-router";

import { SidebarNav } from "~/components/sidebar/sidebar-nav.tsx";
import { StationStatus } from "~/components/sidebar/station-status.tsx";

/**
 * Everything inside the sidebar, shared by the desktop column and the mobile
 * drawer so the two can never drift apart.
 */
export function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
	return (
		<div className="flex min-h-full flex-col py-4">
			<Link
				to="/"
				onClick={onNavigate}
				className="display-title px-4 pb-4 font-semibold text-xl no-underline"
			>
				BirdNET-Book
			</Link>

			<SidebarNav onNavigate={onNavigate} />

			{/* Pushed to the bottom on a tall viewport, and simply last in the flow
			    on a short one -- `mt-auto` does both. */}
			<div className="mt-auto">
				<hr className="mx-4 mb-4 border-0 border-[var(--line)] border-t" />
				<StationStatus />
			</div>
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
 * exactly a viewport minus the inset, so the station block stays reachable on a
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
