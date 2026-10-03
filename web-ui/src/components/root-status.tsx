import { useRouter, useRouterState } from "@tanstack/react-router";
import { Activity, RotateCcw } from "lucide-react";

import { PageStatus } from "~/components/page-status.tsx";
import { Button } from "~/components/ui/button.tsx";
import { ButtonLink } from "~/components/ui/button-link.tsx";

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
 * The catch-all for a loader that threw. Routes that can name a specific cause
 * -- the settings file, the review session -- still override this with their
 * own; everything else inherits it, which is what keeps the router's raw
 * default off the screen.
 */
export function RouteError() {
	const router = useRouter();

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
				The station's data could not be read. This usually means the detections
				database is unavailable, or the BirdNET service is restarting. Try again
				in a moment.
			</PageStatus>
		</div>
	);
}
