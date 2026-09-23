import type { LucideIcon } from "lucide-react";
import { AlertTriangle, CheckCircle2, LoaderCircle, Save } from "lucide-react";
import { type ReactNode, useState } from "react";

import { Button } from "~/components/ui/button.tsx";
import { ConfirmDialog } from "~/components/ui/confirm-dialog.tsx";

export type CardSaveState = "idle" | "saving" | "saved" | "warning" | "error";

/**
 * What saving a card actually costs the reader. Every card's save writes the
 * configuration and then bounces the services so BirdNET reads it, which drops
 * recording for a moment -- that is the whole reason the save is worth
 * confirming rather than just doing.
 */
const DEFAULT_CONFIRM_DESCRIPTION =
	"This writes the values in this card to the station's configuration and restarts BirdNET so they take effect, which interrupts recording for a moment. Other cards are left as they are.";

export function SettingsCard({
	title,
	description,
	icon: Icon,
	state,
	message,
	onSave,
	confirmDescription = DEFAULT_CONFIRM_DESCRIPTION,
	action,
	restart,
	saveDisabled,
	children,
}: {
	title: string;
	description: string;
	icon: LucideIcon;
	state: CardSaveState;
	message?: string;
	/**
	 * Runs once the reader has confirmed. The card owns the form's submit event
	 * and the dialog in front of it, so this is only ever called for a save that
	 * was actually asked for twice.
	 */
	onSave: () => void;
	/** Overrides the standing warning for a card whose save costs something else. */
	confirmDescription?: string;
	/**
	 * A control for the card as a whole, set against its title. It sits inside
	 * the card's form, so anything interactive here needs `type="button"` --
	 * a bare button would submit the card.
	 */
	action?: ReactNode;
	/** Offered beside Save while the saved values are not the running ones. */
	restart?: ReactNode;
	/**
	 * True while the card holds nothing worth saving -- either it is mid-save,
	 * or nothing has been changed since the values it was given.
	 */
	saveDisabled?: boolean;
	children: ReactNode;
}) {
	const [confirming, setConfirming] = useState(false);
	const headingId = `settings-${title.toLowerCase().replaceAll(" ", "-")}`;

	return (
		<section
			aria-labelledby={headingId}
			// A plain card. The save state is already spoken by the message beside
			// the Save button; a coloured stripe down the edge said the same thing
			// again, in a shape no other card on the site has.
			className="feature-card overflow-hidden rounded-md"
		>
			<form
				className="flex h-full flex-col"
				onSubmit={(event) => {
					// Never submits. The card asks first, and the dialog's confirm is
					// what eventually reaches `onSave`.
					event.preventDefault();
					setConfirming(true);
				}}
			>
				{/* Centred, not top-aligned: the disc reads against the whole title
				    block, and hanging it off the first line left it sitting a few
				    pixels high of the space it occupies. */}
				<header className="flex items-center gap-3 border-b p-4">
					<div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--icon-well)]">
						<Icon aria-hidden="true" className="size-4 text-[var(--moss)]" />
					</div>
					<div className="min-w-0">
						<h2
							id={headingId}
							className="display-title font-semibold text-lg leading-tight"
						>
							{title}
						</h2>
						<p className="mt-1 text-muted-foreground text-sm leading-relaxed">
							{description}
						</p>
					</div>
					{/* `self-start` against the header's `items-center`: the disc wants
					    centring because it reads against the whole title block, but the
					    action is a corner control and centring it on a two-line title
					    left it floating in the middle of the header. */}
					{action ? (
						<div className="ml-auto shrink-0 self-start">{action}</div>
					) : null}
				</header>

				{/* One padded box, not a body and a footer. Save sits at the bottom
				    right of the content it saves, with no rule between them -- the
				    card is a single thought, and the divider was cutting it in two. */}
				<div className="flex flex-1 flex-col gap-4 p-4">
					<div className="flex-1 space-y-4">{children}</div>

					<div className="flex items-center justify-between gap-4">
						<div
							aria-live="polite"
							className={`flex min-w-0 items-center gap-2 text-xs ${
								state === "error"
									? "text-destructive"
									: state === "warning"
										? "text-[var(--bark)]"
										: "text-muted-foreground"
							}`}
						>
							{/* Nothing at rest. The card has no news until it has some, and
							    a standing note explaining that cards save separately was
							    read once and then permanently in the way. */}
							{message ? (
								<>
									{state === "saving" ? (
										<LoaderCircle
											aria-hidden="true"
											className="size-3.5 animate-spin"
										/>
									) : state === "saved" ? (
										<CheckCircle2 aria-hidden="true" className="size-3.5" />
									) : state === "warning" || state === "error" ? (
										<AlertTriangle aria-hidden="true" className="size-3.5" />
									) : null}
									<span>{message}</span>
								</>
							) : null}
						</div>
						<div className="flex shrink-0 items-center gap-2">
							{restart}
							<Button type="submit" icon={Save} disabled={saveDisabled}>
								Save
							</Button>
						</div>
					</div>
				</div>
			</form>

			{confirming ? (
				<ConfirmDialog
					title={`Save ${title.toLowerCase()} settings?`}
					description={confirmDescription}
					confirmLabel="Save changes"
					onCancel={() => setConfirming(false)}
					onConfirm={() => {
						setConfirming(false);
						onSave();
					}}
				/>
			) : null}
		</section>
	);
}
