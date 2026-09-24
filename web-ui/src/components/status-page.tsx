import type { ReactNode } from "react";

import { PageHeaderCard } from "~/components/page-header-card.tsx";
import { PageStatus, type PageStatusTone } from "~/components/page-status.tsx";

/**
 * A dead end inside a section that does exist -- an unknown species slug, a
 * date outside the station's range.
 *
 * The masthead stays for the same reason it stays on a locked page: you
 * navigated to Species and you should still be looking at something that says
 * Species, rather than the site appearing to have swapped itself out. It also
 * keeps the page's shape from jumping once the address is corrected.
 */
export function StatusPage({
	section,
	sectionDescription,
	tone,
	title,
	actions,
	children,
}: {
	section: string;
	sectionDescription: string;
	tone: PageStatusTone;
	title: string;
	actions?: ReactNode;
	children: ReactNode;
}) {
	return (
		<div className="page-wrap space-y-(--page-gap) py-4">
			<PageHeaderCard title={section} description={sectionDescription} />
			{/* h2: the masthead above is already this page's h1. */}
			<PageStatus tone={tone} title={title} heading="h2" actions={actions}>
				{children}
			</PageStatus>
		</div>
	);
}
