import { Settings } from "lucide-react";
import { useState } from "react";

import { PageHeaderCard } from "~/components/page-header-card.tsx";
import { destructiveToast, toast } from "~/components/ui/toaster.tsx";
import type { StationHealth } from "~/lib/health-data.ts";
import { PAGE_HEADERS } from "~/lib/page-headers.ts";
import type { SettingsPageData } from "~/lib/settings-data.ts";
import type { UpdateState } from "~/lib/updates-data.ts";
import { RestartButton } from "./restart-button.tsx";
import {
	SettingsCards,
	SettingsCardsSkeleton,
	type SettingsRestarter,
	type SettingsSavers,
} from "./settings-cards.tsx";
import { SettingsReset } from "./settings-reset.tsx";
import { healthStats, healthStatsSkeleton } from "./station-health.tsx";

/** A reset that stored its values without getting BirdNET onto them. */
type ResetOutcome = { message: string; needsRestart: boolean };

export function SettingsPage({
	data,
	savers = {},
	onReset,
	onRestart,
	health,
	updates,
	onCheckUpdates,
	onInstallUpdate,
}: {
	data: SettingsPageData;
	savers?: SettingsSavers;
	/** Omit to render the masthead without its figures. */
	health?: StationHealth;
	/** Resolves with what to report. Omit to hide the reset control. */
	onReset?: () => Promise<ResetOutcome>;
	/** Bounces a card's services. Omit to hide every restart control. */
	onRestart?: SettingsRestarter;
	/** What the updater last reported; null while it loads. */
	updates?: UpdateState | null;
	onCheckUpdates?: () => Promise<void>;
	onInstallUpdate?: () => Promise<void>;
}) {
	// A reset that stored the defaults but could not get BirdNET onto them
	// leaves the Restart button beside Reset until it has done so.
	const [needsRestart, setNeedsRestart] = useState(false);

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
		data.review,
		data.highlights,
		data.updates,
	]);

	return (
		<div className="page-wrap space-y-(--page-gap) py-4">
			<PageHeaderCard
				icon={Settings}
				title={PAGE_HEADERS.settings.title}
				description={PAGE_HEADERS.settings.description}
				stats={health ? healthStats(health) : healthStatsSkeleton()}
				action={
					onReset ? (
						<div className="flex flex-wrap items-center justify-end gap-2">
							{needsRestart && onRestart ? (
								<RestartButton
									onRestart={async () => {
										const toastId = "settings-reset";
										toast.loading("Restarting BirdNET…", { id: toastId });
										try {
											// No card: a reset touched every one of them, so the
											// whole set comes back together.
											const result = await onRestart(undefined);
											setNeedsRestart(false);
											toast.success(result.message, { id: toastId });
										} catch (error) {
											toast.warning(
												error instanceof Error
													? error.message
													: "BirdNET could not be restarted.",
												{ id: toastId, duration: 10_000 },
											);
										}
									}}
								/>
							) : null}
							<SettingsReset
								onReset={async () => {
									const outcome = await onReset();
									setNeedsRestart(outcome.needsRestart);
									if (outcome.needsRestart) {
										toast.warning(outcome.message, {
											id: "settings-reset",
											duration: 10_000,
										});
									} else {
										destructiveToast(outcome.message, { id: "settings-reset" });
									}
								}}
							/>
						</div>
					) : undefined
				}
			/>
			<SettingsCards
				key={loadedValues}
				data={data}
				savers={savers}
				restarter={onRestart}
				updates={updates}
				onCheckUpdates={onCheckUpdates}
				onInstallUpdate={onInstallUpdate}
			/>
		</div>
	);
}

/**
 * The page before the configuration arrives: the masthead as itself, its
 * figures blurred, the reset control drawn but inert, and the six cards as
 * their own skeleton (see SettingsCardsSkeleton).
 */
export function SettingsPageSkeleton() {
	return (
		<div className="page-wrap space-y-(--page-gap) py-4">
			<PageHeaderCard
				icon={Settings}
				title={PAGE_HEADERS.settings.title}
				description={PAGE_HEADERS.settings.description}
				stats={healthStatsSkeleton()}
				action={
					<div inert className="flex flex-wrap items-center justify-end gap-2">
						<SettingsReset onReset={async () => {}} />
					</div>
				}
			/>
			<SettingsCardsSkeleton />
		</div>
	);
}
