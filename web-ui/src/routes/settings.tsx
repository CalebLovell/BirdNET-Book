import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { RotateCcw } from "lucide-react";
import { PageStatus } from "~/components/page-status.tsx";
import {
	SettingsPage,
	SettingsPageSkeleton,
} from "~/components/settings/settings-page.tsx";
import { Button } from "~/components/ui/button.tsx";
import { getStationHealth } from "~/lib/health.ts";
import { pageTitle } from "~/lib/page-title.ts";
import { requireUnlocked } from "~/lib/require-unlocked.ts";
import {
	getSettingsPage,
	resetSettingsFn,
	restartStationFn,
	saveAudioSettingsFn,
	saveDetectionSettingsFn,
	saveHighlightSettingsFn,
	savePrivacySettingsFn,
	saveRecordingSettingsFn,
	saveReviewSettingsFn,
	saveStationSettingsFn,
	saveStorageSettingsFn,
	saveUpdateSettingsFn,
} from "~/lib/settings.ts";
import {
	checkForUpdatesFn,
	getUpdateState,
	installUpdateFn,
} from "~/lib/updates.ts";
import { usePolledData } from "~/lib/use-polled-data.ts";
import { useSettled } from "~/lib/use-settled.ts";

/**
 * Refreshed every half minute so "Last detection" keeps aging while the page
 * is open. A statfs, a stat and one indexed row -- cheap enough not to think
 * about, and none of these figures move faster than that anyway.
 */
const HEALTH_INTERVAL_MS = 30_000;

const UPDATES_INTERVAL_MS = 5_000;

export const Route = createFileRoute("/settings")({
	head: () => ({ meta: [{ title: pageTitle("Settings") }] }),
	// Settled together so the masthead paints with the cards rather than
	// snapping in a moment later. `getStationHealth` does not throw, so it
	// cannot be what sends this route to its error component.
	beforeLoad: ({ context, location }) =>
		requireUnlocked(context.auth, location),
	// Deferred: the page renders at once (see Deferred), and the cards fill in
	// when the configuration arrives.
	loader: () => ({
		data: getSettingsPage(),
		health: getStationHealth(),
		updates: getUpdateState(),
	}),
	component: SettingsRoute,
	errorComponent: SettingsUnavailable,
});

function SettingsRoute() {
	const loaded = Route.useLoaderData();
	// Held, not suspended on: a reset refetches the configuration, and the
	// page -- its pending reset among it -- has to stay mounted through that.
	const settled = useSettled(loaded.data);
	const { data: health } = usePolledData(
		getStationHealth,
		loaded.health,
		HEALTH_INTERVAL_MS,
	);
	const saveStation = useServerFn(saveStationSettingsFn);
	const saveDetection = useServerFn(saveDetectionSettingsFn);
	const savePrivacy = useServerFn(savePrivacySettingsFn);
	const saveAudio = useServerFn(saveAudioSettingsFn);
	const saveRecording = useServerFn(saveRecordingSettingsFn);
	const saveStorage = useServerFn(saveStorageSettingsFn);
	const saveReview = useServerFn(saveReviewSettingsFn);
	const saveHighlights = useServerFn(saveHighlightSettingsFn);
	const saveUpdates = useServerFn(saveUpdateSettingsFn);
	const checkForUpdates = useServerFn(checkForUpdatesFn);
	const installUpdate = useServerFn(installUpdateFn);
	// Every few seconds: cheap (two small files), and what lets the card follow
	// an install through the restart it causes.
	const { data: updates } = usePolledData(
		getUpdateState,
		loaded.updates,
		UPDATES_INTERVAL_MS,
	);
	const reset = useServerFn(resetSettingsFn);
	const restart = useServerFn(restartStationFn);
	const router = useRouter();

	if (!settled) return <SettingsPageSkeleton />;

	return (
		<SettingsPage
			data={settled.value}
			health={health ?? undefined}
			onRestart={(card) => restart({ data: { card } })}
			updates={updates}
			onCheckUpdates={() => checkForUpdates()}
			onInstallUpdate={() => installUpdate()}
			onReset={async () => {
				const result = await reset({});
				// The cards remount against this reload, so it has to land before
				// the page reports the reset as done. The loader itself returns at
				// once (its data is deferred), so wait on the data it started.
				await router.invalidate();
				await router.state.matches.find((match) => match.routeId === Route.id)
					?.loaderData?.data;
				return {
					message: result.message,
					needsRestart: result.status !== "reset",
				};
			}}
			savers={{
				station: (values) => saveStation({ data: values }),
				detection: (values) => saveDetection({ data: values }),
				privacy: (values) => savePrivacy({ data: values }),
				audio: (values) => saveAudio({ data: values }),
				recording: (values) => saveRecording({ data: values }),
				storage: (values) => saveStorage({ data: values }),
				review: (values) => saveReview({ data: values }),
				highlights: (values) => saveHighlights({ data: values }),
				updates: (values) => saveUpdates({ data: values }),
			}}
		/>
	);
}

function SettingsUnavailable() {
	const router = useRouter();

	return (
		<div className="page-wrap py-4">
			<PageStatus
				tone="unavailable"
				title="Settings unavailable"
				actions={
					<Button
						variant="outline"
						size="sm"
						icon={RotateCcw}
						onClick={() => router.invalidate()}
					>
						Try again
					</Button>
				}
			>
				The BirdNET configuration could not be read. Check that the service can
				access <code>/etc/birdnet/birdnet.conf</code>, or set the{" "}
				<code>BIRDNET_CONF</code> environment variable to its location.
			</PageStatus>
		</div>
	);
}
