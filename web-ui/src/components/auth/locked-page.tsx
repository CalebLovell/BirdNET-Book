import { UnlockGate } from "~/components/auth/unlock-gate.tsx";
import { PageHeaderCard } from "~/components/page-header-card.tsx";

/**
 * What a gated page renders while it is locked: its own masthead, then the
 * standard locked card.
 *
 * Keeping the masthead matters because the page is still the page -- you
 * navigated to Settings and you should still be looking at something that says
 * Settings, rather than the site appearing to have swapped itself out for a
 * password prompt. It also keeps the page's shape from jumping when you unlock.
 *
 * The masthead carries no figures here: every gated page's statistics come from
 * a server function that is itself gated, which is the point. Title and
 * description are static text the route already owns, so they cost nothing to
 * render for someone who cannot see the page.
 */
export function LockedPage({
	title,
	description,
}: {
	title: string;
	description: string;
}) {
	return (
		<div className="page-wrap space-y-(--page-gap) py-4">
			<PageHeaderCard title={title} description={description} />
			<UnlockGate />
		</div>
	);
}
