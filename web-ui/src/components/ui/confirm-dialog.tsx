import { type LucideIcon, TriangleAlert, X } from "lucide-react";
import { type ReactNode, useEffect, useId } from "react";

import { Button } from "~/components/ui/button.tsx";

/**
 * The backdrop every modal sits on, and the card it holds. One measure
 * throughout, the page gap: the backdrop's margin around the card, the card's
 * padding (`p-4`, which follows the gap down on phones), and every gap inside
 * it -- title to description, text to buttons, button to button.
 */
export const MODAL_BACKDROP_CLASS =
	"fixed inset-0 z-50 flex items-center justify-center bg-[color-mix(in_oklab,var(--ink)_28%,transparent)] p-(--page-gap)";
export const MODAL_CARD_CLASS =
	"feature-card flex w-full flex-col gap-(--page-gap) rounded-md p-4 text-left shadow-xl";
export const MODAL_TITLE_CLASS = "display-title font-semibold text-lg";
export const MODAL_ACTIONS_CLASS = "flex justify-end gap-(--page-gap)";

/**
 * The station's one confirmation dialog: a question, the consequences under it,
 * and the two ways out. Grown out of the species control dialog, which was the
 * most complete of the three hand-rolled copies. Every confirmation on the
 * site goes through it, so they all look and size their buttons alike.
 *
 * Both buttons are explicitly `type="button"`. The dialog is often rendered
 * inside the form whose submission it is gating -- a settings card does exactly
 * this -- and a bare button there defaults to `submit`, so confirming would
 * submit the form a second time behind the handler's back.
 */
export function ConfirmDialog({
	title,
	description,
	children,
	confirmLabel,
	cancelLabel = "Cancel",
	cancelIcon = X,
	confirmIcon,
	destructive = false,
	pending = false,
	onCancel,
	onConfirm,
}: {
	title: string;
	description: string;
	/** Detail between the description and the buttons, e.g. a preview. Each
	 * top-level element takes the dialog's standard gap. */
	children?: ReactNode;
	confirmLabel: string;
	cancelLabel?: string;
	cancelIcon?: LucideIcon;
	confirmIcon?: LucideIcon;
	destructive?: boolean;
	pending?: boolean;
	onCancel: () => void;
	onConfirm: () => void;
}) {
	const titleId = useId();

	// Escape is the expected way out of a modal, and leaving it unhandled meant
	// the only exit was hitting a 24px Cancel button.
	useEffect(() => {
		function onKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape" && !pending) onCancel();
		}
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [onCancel, pending]);

	return (
		<div className={MODAL_BACKDROP_CLASS}>
			<section
				aria-labelledby={titleId}
				aria-modal="true"
				role="alertdialog"
				className={`${MODAL_CARD_CLASS} max-w-lg`}
			>
				<h2
					id={titleId}
					className={`${MODAL_TITLE_CLASS} flex items-center gap-(--page-gap)`}
				>
					{destructive ? (
						<TriangleAlert className="size-5 shrink-0 text-destructive" />
					) : null}
					{title}
				</h2>
				<p className="text-muted-foreground text-sm leading-relaxed">
					{description}
				</p>
				{children}
				{/* Full-size buttons, the same in every dialog: this is the moment
				    the station asks for a decision, not a toolbar's small print. */}
				<div className={MODAL_ACTIONS_CLASS}>
					<Button
						type="button"
						size="default"
						icon={cancelIcon}
						disabled={pending}
						variant="outline"
						onClick={onCancel}
					>
						{cancelLabel}
					</Button>
					<Button
						type="button"
						size="default"
						icon={confirmIcon}
						loading={pending}
						variant={destructive ? "destructive" : "default"}
						onClick={onConfirm}
					>
						{confirmLabel}
					</Button>
				</div>
			</section>
		</div>
	);
}
