import { createFileRoute, useRouteContext } from "@tanstack/react-router";
import { UserRound } from "lucide-react";

import { SessionCard } from "~/components/auth/session-card.tsx";
import { UnlockGate } from "~/components/auth/unlock-gate.tsx";
import { PageHeaderCard } from "~/components/page-header-card.tsx";
import { pageTitle } from "~/lib/page-title.ts";

export const Route = createFileRoute("/account")({
	head: () => ({ meta: [{ title: pageTitle("Account") }] }),
	component: Account,
});

/**
 * Where this browser signs in to the station and out again -- the sidebar's
 * account row lands here.
 *
 * Not itself gated: it is the way through the gate. Whichever card it shows,
 * the masthead stays the same, so unlocking swaps one card for the other in
 * place rather than changing what page you are on.
 */
function Account() {
	const { auth } = useRouteContext({ from: "__root__" });

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
					title="Sign in"
					description="Enter the station password to review detections, control species and change settings from this browser."
				/>
			)}
		</div>
	);
}
