import { Link, useRouteContext } from "@tanstack/react-router";
import {
	Activity,
	CalendarRange,
	CheckCheck,
	Feather,
	Lightbulb,
	ListTree,
	Lock,
	Settings,
	SlidersHorizontal,
} from "lucide-react";

/**
 * The site's nav, shared by the desktop sidebar and the mobile drawer.
 *
 * `onNavigate` lets the drawer close itself on a tap; the desktop sidebar
 * passes nothing, since it never needs dismissing.
 */
export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
	const linkProps = {
		className: "sidebar-link",
		activeProps: { className: "sidebar-link is-active" },
		onClick: onNavigate,
	};

	const { auth } = useRouteContext({ from: "__root__" });
	// Gated pages stay listed rather than disappearing: a visitor should be able
	// to see the station has settings without being able to open them, and the
	// nav must not change shape when you unlock.
	const lock = auth.unlocked ? null : (
		<Lock
			className="ml-auto size-3 text-muted-foreground"
			aria-label="Locked"
			role="img"
		/>
	);

	return (
		<div className="flex flex-col gap-4 px-2">
			{/* Two navs rather than one list: everything anyone can open sits up top,
			    and the three gated pages sit together below the divider, so the lock
			    icons read as one section rather than as scattered exceptions. */}
			<nav className="flex flex-col gap-0.5" aria-label="Explore">
				<Link to="/live" {...linkProps}>
					<Activity className="sidebar-icon" aria-hidden="true" />
					Live
				</Link>
				{/* One entry for every scope: a day, a week, a year, all of it. The
				    period control on the page is what used to be three separate nav
				    entries, so listing them again here would undo the merge. */}
				<Link
					to="/timeline"
					activeOptions={{ includeSearch: false }}
					{...linkProps}
				>
					<CalendarRange className="sidebar-icon" aria-hidden="true" />
					Timeline
				</Link>
				<Link to="/species" {...linkProps}>
					<Feather className="sidebar-icon" aria-hidden="true" />
					Species
				</Link>
				{/* The search-bearing links keep their defaults and
				    `activeOptions={{ includeSearch: false }}`: without it the link stops
				    reading as active as soon as paging or sorting changes the URL. */}
				<Link
					to="/detections"
					search={{
						page: 1,
						pageSize: 100,
						sort: "recorded",
						direction: "desc",
					}}
					activeOptions={{ includeSearch: false }}
					{...linkProps}
				>
					<ListTree className="sidebar-icon" aria-hidden="true" />
					Detections
				</Link>
				<Link to="/learn" {...linkProps}>
					<Lightbulb className="sidebar-icon" aria-hidden="true" />
					Learn
				</Link>
			</nav>

			<hr className="mx-2.5 border-0 border-[var(--line)] border-t" />

			<nav className="flex flex-col gap-0.5" aria-label="Manage">
				<Link
					to="/review"
					search={{ limit: 20 }}
					activeOptions={{ includeSearch: false }}
					{...linkProps}
				>
					<CheckCheck className="sidebar-icon" aria-hidden="true" />
					Review
					{lock}
				</Link>
				<Link
					to="/species-control"
					search={{ page: 1, sort: "species", direction: "asc" }}
					activeOptions={{ includeSearch: false }}
					{...linkProps}
				>
					<SlidersHorizontal className="sidebar-icon" aria-hidden="true" />
					Control
					{lock}
				</Link>
				<Link to="/settings" {...linkProps}>
					<Settings className="sidebar-icon" aria-hidden="true" />
					Settings
					{lock}
				</Link>
			</nav>
		</div>
	);
}
