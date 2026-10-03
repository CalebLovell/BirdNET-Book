import { Link, useRouterState } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";

import { SidebarBody } from "~/components/sidebar/site-sidebar.tsx";

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
					className={ROUND_BUTTON_CLASS}
				>
					<Menu className="size-5" aria-hidden="true" />
				</button>
				<SiteName />
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
					{/* A copy of the bar above, the close button standing where the
					    hamburger was and the name where it was, so opening the drawer
					    swaps the icon and leaves everything else in place. */}
					<div className={BAR_CLASS}>
						<button
							type="button"
							onClick={() => setIsOpen(false)}
							aria-label="Close navigation"
							className={ROUND_BUTTON_CLASS}
						>
							<X className="size-5" aria-hidden="true" />
						</button>
						<SiteName onClick={() => setIsOpen(false)} />
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
			className="display-title font-semibold text-lg no-underline"
		>
			BirdNET-Book
		</Link>
	);
}
