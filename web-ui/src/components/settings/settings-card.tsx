import { Save } from "lucide-react";
import { type ReactNode, useState } from "react";

import { CardHeader } from "~/components/card-header.tsx";
import { Button } from "~/components/ui/button.tsx";
import { ConfirmDialog } from "~/components/ui/confirm-dialog.tsx";
import { settingsCardId } from "./settings-index.ts";

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
	onSave,
	confirmDescription = DEFAULT_CONFIRM_DESCRIPTION,
	restart,
	saveDisabled,
	children,
}: {
	title: string;
	description: string;
	/**
	 * Runs once the reader has confirmed. The card owns the form's submit event
	 * and the dialog in front of it, so this is only ever called for a save that
	 * was actually asked for twice.
	 */
	onSave: () => void;
	/** Overrides the standing warning for a card whose save costs something else. */
	confirmDescription?: string;
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
	const cardId = settingsCardId(title);
	const headingId = `settings-${cardId}`;

	return (
		<section
			// The anchor the sidebar search lands on, e.g. `/settings#storage`.
			id={cardId}
			aria-labelledby={headingId}
			// A plain card. How a save went is reported in a toast; a coloured
			// stripe down the edge said the same thing again, in a shape no other
			// card on the site has.
			className="feature-card scroll-mt-4 rounded-md p-4"
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
				{/* The band every card on the site is titled with. No controls in
				    it: a card's own actions sit in its rows. */}
				<CardHeader as="h2" titleId={headingId} title={title} />

				<p className="py-(--page-gap) text-muted-foreground text-sm leading-relaxed">
					{description}
				</p>

				{/* The settings, one hairline-parted row each (see Field). */}
				<div className="flex-1">{children}</div>

				{/* No status line beside Save: how the save went arrives as a
				    toast, so the row holds only the controls. Save leads, at the
				    left, with Restart after it when there is one. */}
				<div className="-mx-(--page-gap) flex flex-wrap items-center justify-start gap-2 border-t px-(--page-gap) pt-(--page-gap)">
					<Button
						type="submit"
						size="default"
						icon={Save}
						disabled={saveDisabled}
					>
						Save
					</Button>
					{restart}
				</div>
			</form>

			{confirming ? (
				<ConfirmDialog
					title={`Save ${title.toLowerCase()} settings?`}
					description={confirmDescription}
					confirmLabel="Save changes"
					confirmIcon={Save}
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
