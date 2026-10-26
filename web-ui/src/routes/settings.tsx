import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
	SettingsPage,
	SettingsPageSkeleton,
} from "~/components/settings/settings-page.tsx";
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
 * Refreshed every half minute so the Storage card's disk figure follows a
 * purge while the page is open. A single statfs -- cheap enough not to think
 * about, and the disk does not fill faster than that anyway.
 */
const HEALTH_INTERVAL_MS = 30_000;

const UPDATES_INTERVAL_MS = 5_000;

export const Route = createFileRoute("/settings")({
	head: () => ({ meta: [{ title: pageTitle("Settings") }] }),
	beforeLoad: ({ context, location }) =>
		requireUnlocked(context.auth, location),
	// Deferred: the page renders at once (see Deferred), and the cards fill in
	// when the configuration arrives. `getStationHealth` does not throw, so it
	// cannot be what sends this page to the error card.
	loader: () => ({
		data: getSettingsPage(),
		health: getStationHealth(),
		updates: getUpdateState(),
	}),
	component: SettingsRoute,
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
	const { data: updates, replace: replaceUpdates } = usePolledData(
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
			onCheckUpdates={async () => {
				const state = await checkForUpdates();
				replaceUpdates(state);
				return state;
			}}
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
