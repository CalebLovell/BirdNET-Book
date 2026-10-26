import { Link, useRouteContext, useRouterState } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { UpdateDot } from "~/components/sidebar/sidebar-nav.tsx";
import { SidebarBody } from "~/components/sidebar/site-sidebar.tsx";
import { SongbookMark } from "~/components/sidebar/songbook-mark.tsx";
import { useUpdateOffered } from "~/lib/use-update-offered.ts";

/**
 * The narrow-screen counterpart to the sidebar: a slim bar carrying the site
 * name and a hamburger, plus the drawer it opens.
 *
 * Hidden from `xl` up, where the sidebar itself is always on screen. Not
 * earlier: the sidebar only takes its column once the page beside it can hold
 * the timeline's full heat map (see SiteSidebar).
 */
export function MobileNav() {
	const [isOpen, setIsOpen] = useState(false);
	const { auth } = useRouteContext({ from: "__root__" });
	const offered = useUpdateOffered(auth.unlocked);
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});

	// Closes on Escape while open. Bound only when open so the listener isn't
	// sitting on the document for the whole session.
	useEffect(() => {
		if (!isOpen) return;
		function onKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") setIsOpen(false);
		}
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [isOpen]);

	// A link tap closes the drawer through `onNavigate`, but the browser's back
	// button and any programmatic navigation don't go through it -- watching the
	// path catches those too.
	// biome-ignore lint/correctness/useExhaustiveDependencies: close on route change
	useEffect(() => {
		setIsOpen(false);
	}, [pathname]);

	return (
		<>
			{/* `shrink-0`, not `sticky`: the bar sits outside the scrolling pane in
			    the shell, so it holds its place without any stickiness. Its side
			    padding tracks the page gutter (.page-wrap), halving under 400px, so
			    the round menu button stays in line with the cards' left edge. */}
			<div className={BAR_CLASS}>
				<button
					type="button"
					onClick={() => setIsOpen(true)}
					aria-label="Open navigation"
					aria-expanded={isOpen}
					className={`relative ${ROUND_BUTTON_CLASS}`}
				>
					<Menu className="size-5" aria-hidden="true" />
					{/* Closed, the drawer hides the Settings link's dot, so the
					    button carries one too. */}
					{offered ? (
						<UpdateDot
							className="absolute top-1.5 right-1.5 ring-2 ring-[var(--paper-raised)]"
							label={`Update to ${offered} available`}
						/>
					) : null}
				</button>
				<SiteName />
				{/* Where a page puts its own control for the narrow screen, against
				    the bar's right edge (see InMenuBar). */}
				<div id={MENU_BAR_SLOT_ID} className="ml-auto flex items-center" />
			</div>

			{/* Always mounted so it can slide both ways: closed, the panel waits
			    off-screen to the left and the layer goes `invisible` (and `inert`)
			    so nothing in it takes a click, a tab or a screen reader's focus.
			    Visibility flips at once on open but only after the slide on close,
			    which is what lets the panel be seen sliding out. */}
			<div
				inert={!isOpen}
				className={`fixed inset-0 z-40 transition-[visibility] duration-300 motion-reduce:duration-0 xl:hidden ${
					isOpen ? "visible" : "invisible"
				}`}
			>
				{/* Sits under the panel and above the page; clicking it dismisses. */}
				<button
					type="button"
					aria-label="Close navigation"
					tabIndex={-1}
					onClick={() => setIsOpen(false)}
					className={`absolute inset-0 h-full w-full bg-[color-mix(in_oklab,var(--ink)_35%,transparent)] transition-opacity duration-300 motion-reduce:transition-none ${
						isOpen ? "opacity-100" : "opacity-0"
					}`}
				/>
				<div
					className={`absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-[var(--line)] border-r bg-[var(--paper-raised)] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none ${
						isOpen ? "translate-x-0" : "-translate-x-full"
					}`}
				>
					{/* The bar's height and look, with the name against the panel's left
					    edge, in line with the search box below, and the close button at
					    its far end. */}
					<div className={BAR_CLASS}>
						<SiteName onClick={() => setIsOpen(false)} />
						<button
							type="button"
							onClick={() => setIsOpen(false)}
							aria-label="Close navigation"
							className={`ml-auto ${ROUND_BUTTON_CLASS}`}
						>
							<X className="size-5" aria-hidden="true" />
						</button>
					</div>
					{/* Only the part under the bar scrolls, and only when a short
					    screen needs it: the body fills this box exactly, so the
					    Station group sits at its foot without overflowing it. */}
					<div className="min-h-0 flex-1 overflow-y-auto">
						<SidebarBody
							withTitle={false}
							onNavigate={() => setIsOpen(false)}
						/>
					</div>
				</div>
			</div>
		</>
	);
}

const MENU_BAR_SLOT_ID = "menu-bar-actions";

/**
 * Draws its children at the right end of the menu bar, for a page whose one
 * control has no room in its header on a narrow screen. The bar only shows
 * below `xl`, so the page keeps its own copy for wider screens and hides it
 * there. Nothing renders until mounted: the slot is found in the document,
 * which the server doesn't have.
 */
export function InMenuBar({ children }: { children: ReactNode }) {
	const [slot, setSlot] = useState<HTMLElement | null>(null);
	useEffect(() => {
		setSlot(document.getElementById(MENU_BAR_SLOT_ID));
	}, []);
	return slot ? createPortal(children, slot) : null;
}

// Shared by the bar and the drawer's top row so the two stay the same size.
const BAR_CLASS =
	"z-30 flex h-14 shrink-0 items-center gap-3 border-[var(--line)] border-b bg-[var(--paper-raised)] px-4 max-[400px]:px-2 xl:hidden";

const ROUND_BUTTON_CLASS =
	"flex size-9 items-center justify-center rounded-full bg-[var(--paper-raised)] text-[var(--moss)] transition-colors duration-[180ms] hover:bg-[color-mix(in_oklab,var(--moss)_8%,var(--paper-raised))]";

function SiteName({ onClick }: { onClick?: () => void }) {
	return (
		<Link
			to="/"
			onClick={onClick}
			className="display-title flex h-9 items-center gap-2 rounded-md px-2 font-semibold text-lg no-underline transition-colors duration-[180ms] hover:bg-[color-mix(in_oklab,var(--moss)_8%,var(--paper-raised))]"
		>
			<SongbookMark className="size-5 shrink-0 text-[var(--moss)]" />
			Songbook
		</Link>
	);
}
