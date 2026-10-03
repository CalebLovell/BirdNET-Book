import {
	createFileRoute,
	useNavigate,
	useRouteContext,
} from "@tanstack/react-router";
import { UserRound } from "lucide-react";

import { SessionCard } from "~/components/auth/session-card.tsx";
import { UnlockGate } from "~/components/auth/unlock-gate.tsx";
import { PageHeaderCard } from "~/components/page-header-card.tsx";
import { pageTitle } from "~/lib/page-title.ts";
import { safeNext } from "~/lib/require-unlocked.ts";

export const Route = createFileRoute("/account")({
	head: () => ({ meta: [{ title: pageTitle("Account") }] }),
	// Where a gated page sent you from, so signing in can take you back.
	validateSearch: (search: Record<string, unknown>): { next?: string } => {
		const next = safeNext(search.next);
		return next ? { next } : {};
	},
	component: Account,
});

/**
 * Where this browser signs in to the station and out again -- the sidebar's
 * account row lands here, and so does any gated page opened while locked.
 *
 * Not itself gated: it is the way through the gate. Signing in after a gated
 * page sent you here goes on to that page; signing in from the account row
 * swaps the sign-in card for the session card in place.
 */
function Account() {
	const { auth } = useRouteContext({ from: "__root__" });
	const { next } = Route.useSearch();
	const navigate = useNavigate();

	return (
		<div className="page-wrap space-y-(--page-gap) py-4">
			<PageHeaderCard
				icon={UserRound}
				title="Account"
				description="Who can open Review, Control and Settings. Everything else on this station stays public."
			/>
			{auth.unlocked ? (
				<SessionCard isDefaultPassword={auth.isDefaultPassword} />
			) : (
				<UnlockGate
					onUnlock={() => {
						if (next) navigate({ href: next, replace: true });
					}}
					title="Sign in"
					description="Enter the station password to review detections, control species and change settings from this browser."
				/>
			)}
		</div>
	);
}
