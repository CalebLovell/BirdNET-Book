import {
	type ErrorComponentProps,
	useNavigate,
	useRouter,
	useRouterState,
} from "@tanstack/react-router";
import { Activity, RotateCcw } from "lucide-react";
import { useEffect } from "react";

import { PageStatus } from "~/components/page-status.tsx";
import { Button } from "~/components/ui/button.tsx";
import { ButtonLink } from "~/components/ui/button-link.tsx";
import { isUnauthorizedError } from "~/lib/auth.ts";
import { forgetUnlockStatus } from "~/lib/unlock-status.ts";

/**
 * The last resort for an address that matches no route at all. There is no
 * section to name here, so unlike `StatusPage` this renders the card alone --
 * the sidebar is still in frame, which is enough to say where you are.
 */
export function RouteNotFound() {
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});

	return (
		<div className="page-wrap py-4">
			<PageStatus
				tone="missing"
				title="Page not found"
				actions={
					<ButtonLink to="/live" variant="outline" size="sm" icon={Activity}>
						Go to Live
					</ButtonLink>
				}
			>
				There is nothing at <code>{pathname}</code>. The address may be
				mistyped, or the page may have moved.
			</PageStatus>
		</div>
	);
}

/**
 * The one card for a page whose data failed to load, on every route. It names
 * no cause: the error it gets could be anything, and a guess would mislead
 * the people this station is handed to. The cause goes to the server log.
 *
 * One failure does have a known cause: a gated page whose session ran out
 * while the browser still thought it was signed in. That is no error at all
 * -- the page drops the stale answer and goes to sign in, with nothing drawn
 * in between.
 */
export function RouteError({ error }: ErrorComponentProps) {
	const router = useRouter();
	const navigate = useNavigate();
	const signedOut = isUnauthorizedError(error);

	// Straight to /account, as the gate would send it, rather than re-running
	// the page: a re-run that is refused again remounts this card, which would
	// re-run it again, and so on without end. The card can still be up once
	// the address is /account, and sending that on would make /account its own
	// `next`.
	useEffect(() => {
		if (!signedOut) return;
		const { href: next, pathname } = router.state.location;
		if (pathname === "/account") return;
		forgetUnlockStatus();
		void navigate({ to: "/account", search: { next }, replace: true });
	}, [signedOut, navigate, router]);

	if (signedOut) return null;

	return (
		<div className="page-wrap py-4">
			<PageStatus
				tone="unavailable"
				title="This page couldn't load"
				actions={
					<>
						<Button
							variant="outline"
							size="sm"
							icon={RotateCcw}
							onClick={() => router.invalidate()}
						>
							Try again
						</Button>
						<ButtonLink to="/live" variant="ghost" size="sm" icon={Activity}>
							Go to Live
						</ButtonLink>
					</>
				}
			>
				Something went wrong on the station. Try again in a minute. If it keeps
				happening, restarting the station usually fixes it.
			</PageStatus>
		</div>
	);
}
