import { RotateCcw } from "lucide-react";
import { useState } from "react";

import { Button } from "~/components/ui/button.tsx";
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
				<div
					role="alertdialog"
					aria-modal="true"
					aria-labelledby="settings-reset-title"
					className="fixed inset-0 z-50 grid place-items-center bg-black/20 p-(--page-gap)"
				>
					<div className="feature-card w-full max-w-md rounded-md p-4 shadow-xl">
						<h2 id="settings-reset-title" className="font-semibold text-lg">
							Reset all settings to defaults?
						</h2>
						<p className="mt-2 text-muted-foreground text-sm leading-relaxed">
							Detection, Privacy, Audio input, Recording, Storage, and the
							Review queue threshold all go back to the values a fresh install
							writes. Any RTSP streams you have configured are cleared and the
							station returns to microphone input. This cannot be undone.
						</p>
						<p className="mt-4 rounded-md bg-muted p-(--page-gap) text-muted-foreground text-xs leading-relaxed">
							Your Station card is left as it is. Its name, coordinates, and
							timezone have no default to return to, and blanking them would put
							the station at 0,0 and break geographic species filtering.
						</p>
						<p className="mt-4 text-muted-foreground text-xs leading-relaxed">
							Your detections and recordings are not touched.
						</p>
						<div className="mt-4 flex justify-end gap-2">
							<Button
								variant="outline"
								disabled={busy}
								onClick={() => setOpen(false)}
							>
								Cancel
							</Button>
							<Button variant="destructive" disabled={busy} onClick={confirm}>
								{busy ? "Resetting…" : "Reset to defaults"}
							</Button>
						</div>
					</div>
				</div>
			) : null}
		</>
	);
}
