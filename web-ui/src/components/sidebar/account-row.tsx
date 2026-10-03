import { Link, useRouteContext } from "@tanstack/react-router";
import { ChevronRight, KeyRound, Lock } from "lucide-react";

/**
 * Who you are on this station, at the foot of the sidebar, and the way to the
 * Account page where that changes.
 *
 * The station has one password and no users, so there is no name to show:
 * just whether this browser holds the key. The two states keep one shape --
 * same well, same two lines -- so unlocking never moves the row.
 */
export function AccountRow({ onNavigate }: { onNavigate?: () => void }) {
	const { auth } = useRouteContext({ from: "__root__" });
	const Icon = auth.unlocked ? KeyRound : Lock;

	return (
		<Link
			to="/account"
			onClick={onNavigate}
			className="sidebar-link gap-2.5! py-1.5!"
			activeProps={{ className: "sidebar-link is-active gap-2.5! py-1.5!" }}
		>
			<span
				className={
					auth.unlocked
						? "flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--moss)] text-[var(--paper-raised)]"
						: "flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--icon-well)] text-[var(--moss)]"
				}
			>
				<Icon aria-hidden="true" className="size-3.5" />
			</span>
			<span className="min-w-0 flex-1 leading-tight">
				<span className="block truncate text-[var(--ink)]">
					{auth.unlocked ? "Station owner" : "Visitor"}
				</span>
				<span className="block truncate text-muted-foreground text-xs">
					{auth.unlocked ? "Signed in" : "Sign in to manage"}
				</span>
			</span>
			<ChevronRight
				aria-hidden="true"
				className="size-3.5 shrink-0 text-muted-foreground"
			/>
		</Link>
	);
}
