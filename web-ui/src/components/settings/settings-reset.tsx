import { RotateCcw, X } from "lucide-react";
import { useState } from "react";

import { Button } from "~/components/ui/button.tsx";
import { ConfirmDialog } from "~/components/ui/confirm-dialog.tsx";
import { toast } from "~/components/ui/toaster.tsx";

/**
 * Returns the station to its install defaults. Destructive and immediate, so it
 * asks first and spells out both halves of what it does -- the cards it
 * rewrites, and the one it deliberately leaves alone.
 */
export function SettingsReset({ onReset }: { onReset: () => Promise<void> }) {
	const [open, setOpen] = useState(false);
	const [busy, setBusy] = useState(false);

	async function confirm() {
		setBusy(true);
		try {
			await onReset();
			setOpen(false);
		} catch {
			// The dialog stays open, so trying again is one click away.
			toast.error("Settings could not be reset.", {
				id: "settings-reset",
				description: "The station is unchanged.",
			});
		} finally {
			setBusy(false);
		}
	}

	return (
		<>
			<Button variant="outline" icon={RotateCcw} onClick={() => setOpen(true)}>
				Reset to defaults
			</Button>
			{open ? (
				<ConfirmDialog
					title="Reset all settings to defaults?"
					description="Detection, Privacy, Audio input, Recording, Storage, Highlights, and the Review queue threshold all go back to the values a fresh install writes. Any RTSP streams you have configured are cleared and the station returns to microphone input. This cannot be undone."
					cancelIcon={X}
					confirmIcon={RotateCcw}
					confirmLabel="Reset to defaults"
					destructive
					pending={busy}
					onCancel={() => setOpen(false)}
					onConfirm={confirm}
				>
					<p className="rounded-md bg-muted p-(--page-gap) text-muted-foreground text-xs leading-relaxed">
						Your Station card is left as it is. Its name, coordinates, and
						timezone have no default to return to, and blanking them would put
						the station at 0,0 and break geographic species filtering.
					</p>
					<p className="text-muted-foreground text-xs leading-relaxed">
						Your detections and recordings are not touched.
					</p>
				</ConfirmDialog>
			) : null}
		</>
	);
}
