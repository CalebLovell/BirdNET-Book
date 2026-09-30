import type { ReactNode } from "react";

import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "~/components/ui/tooltip.tsx";

/**
 * The app's hover explanation: wrap any element and it shows `content` in the
 * small raised tooltip on hover or focus. Carries its own provider, so it works
 * anywhere -- including a page or a test with no TooltipProvider above it.
 * With no content it renders the child untouched, so callers can pass an
 * optional explanation straight through. The child must accept a ref (a DOM
 * element or a forwarding component), since it becomes the trigger.
 */
export function Hint({
	content,
	children,
	className,
}: {
	content: ReactNode;
	children: ReactNode;
	className?: string;
}) {
	if (content == null || content === "") return children;

	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger asChild>{children}</TooltipTrigger>
				<TooltipContent className={className}>{content}</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}
