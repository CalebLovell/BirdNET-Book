import { Info } from "lucide-react";
import type { ReactNode } from "react";

import { Hint } from "~/components/ui/hint.tsx";

/**
 * An explanation a reader can ask for, so a control can stay uncluttered
 * without going unexplained -- a `Hint` on an info icon. The click is swallowed because the
 * trigger sometimes sits inside a field's label, which would otherwise pull
 * focus into the control it labels.
 */
export function InfoTip({
	label,
	size = "sm",
	children,
}: {
	label: string;
	/** `default` is a 16px glyph on a 28px target for a card's header, pulled
	    out so the glyph sits 12px from the card's edge; `sm` is the
	    bare glyph that sits inside a field's label. */
	size?: "sm" | "default";
	children: ReactNode;
}) {
	return (
		<Hint content={children} className="max-w-80 space-y-2 leading-relaxed">
			<button
				type="button"
				aria-label={`About ${label}`}
				className={
					size === "default"
						? "-me-2.5 inline-flex size-7 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-[var(--moss)]"
						: "inline-flex items-center text-muted-foreground transition-colors hover:text-[var(--moss)]"
				}
				onClick={(event) => event.preventDefault()}
			>
				<Info className={size === "default" ? "size-4" : "size-3.5"} />
			</button>
		</Hint>
	);
}
