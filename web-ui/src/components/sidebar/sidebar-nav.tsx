import { Link, useRouteContext } from "@tanstack/react-router";
import {
	Activity,
	CalendarRange,
	CheckCheck,
	Feather,
	Lightbulb,
	ListTree,
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

	return (
		<div className="flex flex-col gap-2 px-2">
			{/* Two navs rather than one list: everything anyone can open sits up top,
			    and the three gated pages sit together below the divider. A visitor
			    never sees that second group at all -- the sidebar's account row is
			    their way in, and signing in is what makes the group appear. */}
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

			{auth.unlocked ? (
				<>
					<hr className="mx-2.5 border-0 border-[var(--line)] border-t" />

					<nav className="flex flex-col gap-0.5" aria-label="Manage">
						<Link
							to="/review"
							search={{ page: 1 }}
							activeOptions={{ includeSearch: false }}
							{...linkProps}
						>
							<CheckCheck className="sidebar-icon" aria-hidden="true" />
							Review
						</Link>
						<Link
							to="/species-control"
							search={{ page: 1, sort: "species", direction: "asc" }}
							activeOptions={{ includeSearch: false }}
							{...linkProps}
						>
							<SlidersHorizontal className="sidebar-icon" aria-hidden="true" />
							Control
						</Link>
						<Link to="/settings" {...linkProps}>
							<Settings className="sidebar-icon" aria-hidden="true" />
							Settings
						</Link>
					</nav>
				</>
			) : null}
		</div>
	);
}
