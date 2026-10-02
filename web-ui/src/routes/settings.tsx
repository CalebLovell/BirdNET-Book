import {
	createFileRoute,
	useRouteContext,
	useRouter,
} from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Settings } from "lucide-react";
import { LockedPage } from "~/components/auth/locked-page.tsx";
import { PageStatus } from "~/components/page-status.tsx";
import { SessionCard } from "~/components/settings/session-card.tsx";
import {
	SETTINGS_PAGE_DESCRIPTION,
	SETTINGS_PAGE_TITLE,
	SettingsPage,
} from "~/components/settings/settings-page.tsx";
import { Button } from "~/components/ui/button.tsx";
import { getStationHealth } from "~/lib/health.ts";
import { pageTitle } from "~/lib/page-title.ts";
import {
	getSettingsPage,
	resetSettingsFn,
	restartStationFn,
	saveAudioSettingsFn,
	saveDetectionSettingsFn,
	savePrivacySettingsFn,
	saveRecordingSettingsFn,
	saveStationSettingsFn,
	saveStorageSettingsFn,
} from "~/lib/settings.ts";
import { usePolledData } from "~/lib/use-polled-data.ts";

/**
 * Refreshed every half minute so "Last detection" keeps aging while the page
 * is open. A statfs, a stat and one indexed row -- cheap enough not to think
 * about, and none of these figures move faster than that anyway.
 */
const HEALTH_INTERVAL_MS = 30_000;

export const Route = createFileRoute("/settings")({
	head: () => ({ meta: [{ title: pageTitle("Settings") }] }),
	// Settled together so the masthead paints with the cards rather than
	// snapping in a moment later. `getStationHealth` does not throw, so it
	// cannot be what sends this route to its error component.
	loader: async ({ context }) => {
		if (!context.auth.unlocked) return null;
		return { data: await getSettingsPage(), health: await getStationHealth() };
	},
	component: SettingsRoute,
	errorComponent: SettingsUnavailable,
});

function SettingsRoute() {
	const loaded = Route.useLoaderData();
	if (!loaded)
		return (
			<LockedPage
				icon={Settings}
				title={SETTINGS_PAGE_TITLE}
				description={SETTINGS_PAGE_DESCRIPTION}
			/>
		);
	return <SettingsContent loaded={loaded} />;
}

function SettingsContent({
	loaded,
}: {
	loaded: NonNullable<ReturnType<typeof Route.useLoaderData>>;
}) {
	const data = loaded.data;
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
	const reset = useServerFn(resetSettingsFn);
	const restart = useServerFn(restartStationFn);
	const router = useRouter();
	const { auth } = useRouteContext({ from: "__root__" });

	return (
		<SettingsPage
			data={data}
			health={health}
			access={<SessionCard isDefaultPassword={auth.isDefaultPassword} />}
			onRestart={(card) => restart({ data: { card } })}
			onReset={async () => {
				const result = await reset({});
				// The cards remount against this reload, so it has to land before
				// the page reports the reset as done.
				await router.invalidate();
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
