import { Link, useRouteContext } from "@tanstack/react-router";
import {
	Activity,
	AudioWaveform,
	CalendarRange,
	CircleUserRound,
	Feather,
	Lightbulb,
	SearchCheck,
	Settings,
	SlidersHorizontal,
} from "lucide-react";
import { useId } from "react";

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
	// The body renders in both the desktop column and the drawer, so the label
	// ids have to be unique per copy.
	const id = useId();

	return (
		<div className="flex flex-1 flex-col px-3">
			{/* The pages for browsing sit up top, and the station's working pages
			    together under their own label, then Account and Settings at the
			    foot. A visitor never sees Manage or Settings -- Account is their
			    way in, and signing in is what makes them appear. Detections lives under Manage though it isn't gated,
			    so a visitor reaches it only by URL or the site search. Each label
			    is the nav's accessible name too. */}
			<nav
				className="mt-1 flex flex-col gap-0.5"
				aria-labelledby={`${id}-explore`}
			>
				<SectionLabel id={`${id}-explore`}>Explore</SectionLabel>
				<Link to="/live" {...linkProps}>
					<Activity className="sidebar-icon" aria-hidden="true" />
					Live Feed
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
				<Link to="/birds" {...linkProps}>
					<Feather className="sidebar-icon" aria-hidden="true" />
					All Birds
				</Link>
				<Link to="/learn" {...linkProps}>
					<Lightbulb className="sidebar-icon" aria-hidden="true" />
					Learn
				</Link>
			</nav>

			{auth.unlocked ? (
				<nav
					className="mt-3 flex flex-col gap-0.5"
					aria-labelledby={`${id}-manage`}
				>
					<SectionLabel id={`${id}-manage`}>Manage</SectionLabel>
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
						<AudioWaveform className="sidebar-icon" aria-hidden="true" />
						Detections
					</Link>
					<Link
						to="/review"
						search={{ page: 1 }}
						activeOptions={{ includeSearch: false }}
						{...linkProps}
					>
						<SearchCheck className="sidebar-icon" aria-hidden="true" />
						Review
					</Link>
				</nav>
			) : null}

			{/* Set apart at the foot of the sidebar: `mt-auto` pushes it down on a
			    tall viewport and leaves it last in the flow on a short one. Account
			    is open to everyone -- a visitor signs in there, an owner locks up
			    there -- and Species Control and Settings join it once unlocked. Its label is "Station",
			    which a visitor sees over Account alone too. */}
			<nav
				className="mt-auto flex flex-col gap-0.5 pt-4"
				aria-labelledby={`${id}-station`}
			>
				<SectionLabel id={`${id}-station`}>Station</SectionLabel>
				<Link to="/account" {...linkProps}>
					<CircleUserRound className="sidebar-icon" aria-hidden="true" />
					Account
				</Link>
				{auth.unlocked ? (
					<>
						<Link
							to="/species-control"
							search={{ page: 1, sort: "species", direction: "asc" }}
							activeOptions={{ includeSearch: false }}
							{...linkProps}
						>
							<SlidersHorizontal className="sidebar-icon" aria-hidden="true" />
							Species Control
						</Link>
						<Link to="/settings" {...linkProps}>
							<Settings className="sidebar-icon" aria-hidden="true" />
							Settings
						</Link>
					</>
				) : null}
			</nav>
		</div>
	);
}

/**
 * A group's label: the kicker's size, weight and colour, but in its own case,
 * set near the left between hairlines: a short lead-in, then one running out
 * to the nav's right edge.
 */
function SectionLabel({ id, children }: { id: string; children: string }) {
	return (
		<h2
			id={id}
			className="m-0 flex items-center gap-2 pb-2 font-bold text-[0.69rem] text-[var(--kicker)] leading-none"
		>
			<span aria-hidden="true" className="h-px w-3 bg-[var(--line)]" />
			{children}
			<span aria-hidden="true" className="h-px flex-1 bg-[var(--line)]" />
		</h2>
	);
}
