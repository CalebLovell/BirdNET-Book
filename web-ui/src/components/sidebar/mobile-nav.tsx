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
			    the menu icon stays in line with the cards' left edge. */}
			<div className="z-30 flex h-14 shrink-0 items-center gap-3 border-[var(--line)] border-b bg-[var(--paper-raised)] px-4 max-[400px]:px-2 xl:hidden">
				<button
					type="button"
					onClick={() => setIsOpen(true)}
					aria-label="Open navigation"
					aria-expanded={isOpen}
					className="-ml-1 rounded p-1 text-[var(--moss)]"
				>
					<Menu className="size-5" aria-hidden="true" />
				</button>
				<Link
					to="/"
					className="display-title font-semibold text-lg no-underline"
				>
					BirdNET-Book
				</Link>
			</div>

			{isOpen ? (
				<div className="fixed inset-0 z-40 xl:hidden">
					{/* Sits under the panel and above the page; clicking it dismisses. */}
					<button
						type="button"
						aria-label="Close navigation"
						onClick={() => setIsOpen(false)}
						className="absolute inset-0 h-full w-full bg-[color-mix(in_oklab,var(--ink)_35%,transparent)]"
					/>
					<div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto border-[var(--line)] border-r bg-[var(--paper-raised)]">
						<button
							type="button"
							onClick={() => setIsOpen(false)}
							aria-label="Close navigation"
							className="absolute top-4 right-3 rounded p-1 text-muted-foreground"
						>
							<X className="size-5" aria-hidden="true" />
						</button>
						<SidebarBody onNavigate={() => setIsOpen(false)} />
					</div>
				</div>
			) : null}
		</>
	);
}
