import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { type ReactNode, useState } from "react";

import { PageHeaderCard } from "~/components/page-header-card.tsx";
import type { StationHealth } from "~/lib/health-data.ts";
import type { SettingsPageData } from "~/lib/settings-data.ts";
import { RestartButton } from "./restart-button.tsx";
import {
	SettingsCards,
	type SettingsRestarter,
	type SettingsSavers,
} from "./settings-cards.tsx";
import { SettingsReset } from "./settings-reset.tsx";
import { healthStats } from "./station-health.tsx";

/** A reset that stored its values without getting BirdNET onto them. */
type ResetOutcome = { message: string; needsRestart: boolean };

/** Exported so the locked view of this page shows the same masthead as the
 *  unlocked one, rather than a second copy of the words that drifts. */
export const SETTINGS_PAGE_TITLE = "Settings";
export const SETTINGS_PAGE_DESCRIPTION =
	"Configure this station without editing birdnet.conf. Each card validates and saves independently.";

export function SettingsPage({
	data,
	savers = {},
	onReset,
	onRestart,
	health,
	access,
}: {
	data: SettingsPageData;
	savers?: SettingsSavers;
	/** Omit to render the masthead without its figures. */
	health?: StationHealth;
	/** Resolves with what to report. Omit to hide the reset control. */
	onReset?: () => Promise<ResetOutcome>;
	/** Bounces a card's services. Omit to hide every restart control. */
	onRestart?: SettingsRestarter;
	/**
	 * The Access card, last in the flow. Passed in rather than rendered here so
	 * this component stays free of the session server functions, and so the
	 * settings page still renders in a test without them.
	 */
	access?: ReactNode;
}) {
	const [reset, setReset] = useState<ResetOutcome | null>(null);

	// Each card seeds its own state from `data` once, so a reset that only
	// refetched would leave six forms showing the values it just discarded.
	// Keying on the loaded values themselves remounts them when -- and only
	// when -- new ones actually arrive; a counter bumped alongside the refetch
	// races it, and remounts against data that has not landed yet.
	const loadedValues = JSON.stringify([
		data.station,
		data.detection,
		data.privacy,
		data.audio,
		data.recording,
		data.storage,
	]);

	return (
		<div className="page-wrap space-y-(--page-gap) py-4">
			<PageHeaderCard
				title={SETTINGS_PAGE_TITLE}
				description={SETTINGS_PAGE_DESCRIPTION}
				stats={health ? healthStats(health) : []}
				action={
					onReset ? (
						<SettingsReset
							onReset={async () => {
								const outcome = await onReset();
								setReset(outcome);
								return outcome.message;
							}}
						/>
					) : undefined
				}
			>
				{reset ? (
					<div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-[var(--line)] border-t pt-4">
						<p
							aria-live="polite"
							className={`flex items-center gap-2 text-xs ${
								reset.needsRestart
									? "text-[var(--bark)]"
									: "text-muted-foreground"
							}`}
						>
							{reset.needsRestart ? (
								<AlertTriangle aria-hidden="true" className="size-3.5" />
							) : (
								<CheckCircle2 aria-hidden="true" className="size-3.5" />
							)}
							{reset.message}
						</p>
						{reset.needsRestart && onRestart ? (
							<RestartButton
								onRestart={async () => {
									try {
										// No card: a reset touched every one of them, so the
										// whole set comes back together.
										const result = await onRestart(undefined);
										setReset({ message: result.message, needsRestart: false });
									} catch (error) {
										setReset({
											message:
												error instanceof Error
													? error.message
													: "BirdNET could not be restarted.",
											needsRestart: true,
										});
									}
								}}
							/>
						) : null}
					</div>
				) : null}
			</PageHeaderCard>
			<SettingsCards
				key={loadedValues}
				data={data}
				savers={savers}
				restarter={onRestart}
			/>
			{access}
		</div>
	);
}
