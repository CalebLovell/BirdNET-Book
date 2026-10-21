import { RefreshCw } from "lucide-react";
import { useState } from "react";

import { Button } from "~/components/ui/button.tsx";

/**
 * Finishes what a save could not: BirdNET reads its configuration at startup,
 * so a stored value is not a running one until the services are bounced. This
 * is the same `systemctl restart` the save itself runs, offered as a button
 * once it has failed or been declined.
 *
 * No confirmation step -- the button is already the answer to a message that
 * says a restart is needed, and a second dialog to reach it would be in the
 * way. It does interrupt recording for a moment, which the label admits to.
 */
export function RestartButton({
	onRestart,
	label = "Restart BirdNET",
}: {
	/** Resolves with what to report; rejects with a message to show as an error. */
	onRestart: () => Promise<void>;
	label?: string;
}) {
	const [busy, setBusy] = useState(false);

	return (
		<Button
			type="button"
			variant="outline"
			size="default"
			icon={RefreshCw}
			loading={busy}
			title="Briefly interrupts recording while BirdNET reloads its settings"
			onClick={async () => {
				setBusy(true);
				try {
					await onRestart();
				} finally {
					setBusy(false);
				}
			}}
		>
			{busy ? "Restarting…" : label}
		</Button>
	);
}
