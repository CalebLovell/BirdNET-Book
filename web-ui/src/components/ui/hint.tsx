import { type ReactNode, useRef, useState } from "react";

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
 *
 * A tap opens it too. Radix leaves tooltips to hover and focus, which a phone
 * has neither of, so a touch on the trigger is caught here and toggles the
 * tooltip itself; a tap anywhere else closes it.
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
	const [open, setOpen] = useState(false);
	const touched = useRef(false);

	if (content == null || content === "") return children;

	return (
		<TooltipProvider>
			<Tooltip open={open} onOpenChange={setOpen}>
				<TooltipTrigger
					asChild
					// Default prevented so Radix's own handlers, which close the
					// tooltip on press and click, stand aside for a touch.
					onPointerDown={(event) => {
						touched.current = event.pointerType === "touch";
						if (touched.current) event.preventDefault();
					}}
					onClick={(event) => {
						if (!touched.current) return;
						event.preventDefault();
						setOpen((wasOpen) => !wasOpen);
					}}
				>
					{children}
				</TooltipTrigger>
				<TooltipContent className={className}>{content}</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}
