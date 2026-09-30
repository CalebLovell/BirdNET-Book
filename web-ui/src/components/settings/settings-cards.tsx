import {
	Disc3,
	HardDrive,
	MapPin,
	Mic2,
	ShieldCheck,
	SlidersHorizontal,
} from "lucide-react";
import type { ChangeEvent, ReactNode } from "react";
import { useState } from "react";

import { InfoTip } from "~/components/ui/info-tip.tsx";
import { Input } from "~/components/ui/input.tsx";
import type {
	AudioSettings,
	DetectionSettings,
	PrivacySettings,
	RecordingSettings,
	SettingsCardKind,
	SettingsPageData,
	SettingsSaveResult,
	StationSettings,
	StorageSettings,
} from "~/lib/settings-data.ts";
import { RestartButton } from "./restart-button.tsx";
import { type CardSaveState, SettingsCard } from "./settings-card.tsx";
import { StationLocation } from "./station-location.tsx";

type Saver<T> = (values: T) => Promise<SettingsSaveResult<T>>;
type CardRestarter = () => Promise<{ message: string }>;

export type SettingsSavers = {
	station?: Saver<StationSettings>;
	detection?: Saver<DetectionSettings>;
	privacy?: Saver<PrivacySettings>;
	audio?: Saver<AudioSettings>;
	recording?: Saver<RecordingSettings>;
	storage?: Saver<StorageSettings>;
};

/**
 * Bounces the services behind one card, retrying what its save could not do.
 * Omit the card to bring the whole set back at once, which is what a reset --
 * having rewritten every card -- needs.
 */
export type SettingsRestarter = (
	card?: SettingsCardKind,
) => Promise<{ message: string }>;

/**
 * Compared by value, not by identity: every keystroke rebuilds the values
 * object, so a reference check would call a card dirty for typing a character
 * and deleting it again. These are flat objects of primitives and one string
 * array, always rebuilt by spreading the previous one, so key order is stable
 * and serializing them is a sound equality test.
 */
function unchanged<T>(a: T, b: T) {
	return JSON.stringify(a) === JSON.stringify(b);
}

function useCardSave<T>(initial: T, save?: Saver<T>, restart?: CardRestarter) {
	const [values, setValues] = useState(initial);
	// What the station currently holds, as far as this card knows: the values it
	// loaded with, or the ones it last saved. Save has nothing to do until the
	// form differs from this.
	const [saved, setSaved] = useState(initial);
	const [state, setState] = useState<CardSaveState>("idle");
	const [message, setMessage] = useState<string>();
	// The card's values are on disk but BirdNET is still running the old ones.
	// Both save outcomes that mean this -- the restart was refused, or the
	// environment declined to try -- are the same situation to the reader, and
	// the same button fixes them.
	const [needsRestart, setNeedsRestart] = useState(false);

	async function submit() {
		if (!save) return;
		setState("saving");
		setMessage("Saving this section…");
		try {
			const result = await save(values);
			setValues(result.values);
			// The station now holds what it just accepted -- which is the parsed
			// form of what was sent, so trimmed text and coerced numbers count as
			// saved rather than leaving the card looking dirty straight after.
			setSaved(result.values);
			const pending =
				result.status === "saved-action-failed" ||
				result.status === "saved-restart-skipped";
			setNeedsRestart(pending);
			setState(pending ? "warning" : "saved");
			setMessage(result.message);
		} catch (error) {
			setState("error");
			setMessage(
				error instanceof Error
					? error.message
					: "These settings could not be saved.",
			);
		}
	}

	async function applyNow() {
		if (!restart) return;
		setState("saving");
		setMessage("Restarting BirdNET…");
		try {
			const result = await restart();
			setNeedsRestart(false);
			setState("saved");
			setMessage(result.message);
		} catch (error) {
			// The values are still saved -- only the restart failed -- so the card
			// keeps offering the button rather than dropping back to a clean state.
			setState("warning");
			setMessage(
				error instanceof Error
					? error.message
					: "BirdNET could not be restarted.",
			);
		}
	}

	const dirty = !unchanged(values, saved);
	return {
		values,
		setValues,
		state,
		message,
		submit,
		dirty,
		// A failed save leaves the card dirty, so the button stays live to retry.
		saveDisabled: state === "saving" || !dirty,
		needsRestart: needsRestart && restart !== undefined,
		applyNow,
	};
}

/** Renders the footer's restart control, or nothing when nothing is pending. */
function restartControl(form: { needsRestart: boolean; applyNow: () => void }) {
	return form.needsRestart ? (
		<RestartButton onRestart={async () => form.applyNow()} />
	) : undefined;
}

const controlClass =
	"h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus-visible:border-[var(--hover-line)]";

function Field({
	label,
	hint,
	info,
	children,
}: {
	label: string;
	hint?: string;
	info?: ReactNode;
	children: ReactNode;
}) {
	return (
		// The control is nested, so the label association is native HTML even
		// though Biome cannot see through this component's ReactNode boundary.
		// biome-ignore lint/a11y/noLabelWithoutControl: nested labeled control
		<label className="block space-y-1.5">
			<span className="flex items-center gap-1.5 font-medium text-sm">
				{label}
				{info ? <InfoTip label={label}>{info}</InfoTip> : null}
			</span>
			{children}
			{hint ? (
				<span className="block text-muted-foreground text-xs leading-relaxed">
					{hint}
				</span>
			) : null}
		</label>
	);
}

function twoColumns(children: ReactNode) {
	return <div className="grid gap-(--page-gap) sm:grid-cols-2">{children}</div>;
}

/**
 * A number input reports NaN while it is empty -- mid-edit, or cleared outright.
 * Storing that would hand React an invalid `value` and strand the field, so the
 * last good number is held until a real one is typed; `required` plus the input's
 * own min/max still block a submit while the box reads empty.
 */
function numberOr(event: ChangeEvent<HTMLInputElement>, fallback: number) {
	const parsed = event.target.valueAsNumber;
	return Number.isNaN(parsed) ? fallback : parsed;
}

export function SettingsCards({
	data,
	savers,
	restarter,
}: {
	data: SettingsPageData;
	savers: SettingsSavers;
	restarter?: SettingsRestarter;
}) {
	const restartFor = (card: SettingsCardKind): CardRestarter | undefined =>
		restarter ? () => restarter(card) : undefined;
	return (
		// One card per row, always. Side by side, cards of unequal height left
		// ragged gaps and no reliable reading order down the page.
		<div className="space-y-(--page-gap)">
			<StationCard
				initial={data.station}
				timezones={data.supportedTimezones}
				save={savers.station}
				restart={restartFor("station")}
			/>
			<DetectionCard
				initial={data.detection}
				models={data.supportedModels}
				save={savers.detection}
				restart={restartFor("detection")}
			/>
			<PrivacyCard
				initial={data.privacy}
				save={savers.privacy}
				restart={restartFor("privacy")}
			/>
			<AudioCard
				initial={data.audio}
				save={savers.audio}
				restart={restartFor("audio")}
			/>
			<RecordingCard
				initial={data.recording}
				save={savers.recording}
				restart={restartFor("recording")}
			/>
			<StorageCard
				initial={data.storage}
				save={savers.storage}
				restart={restartFor("storage")}
			/>
		</div>
	);
}

function StationCard({
	initial,
	timezones,
	save,
	restart,
}: {
	initial: StationSettings;
	timezones: string[];
	save?: Saver<StationSettings>;
	restart?: CardRestarter;
}) {
	const form = useCardSave(initial, save, restart);
	return (
		<SettingsCard
			title="Station"
			description="Name the station and locate it for geographic species filtering."
			icon={MapPin}
			state={form.state}
			message={form.message}
			onSave={() => void form.submit()}
			restart={restartControl(form)}
			saveDisabled={form.saveDisabled}
			action={
				<StationLocation
					current={{
						latitude: form.values.latitude,
						longitude: form.values.longitude,
					}}
					onApply={(coordinates) =>
						form.setValues({ ...form.values, ...coordinates })
					}
				/>
			}
		>
			<Field label="Station name">
				<Input
					value={form.values.siteName}
					maxLength={80}
					onChange={(event) =>
						form.setValues({ ...form.values, siteName: event.target.value })
					}
				/>
			</Field>
			{twoColumns(
				<>
					<Field label="Latitude">
						<Input
							type="number"
							min={-90}
							max={90}
							step="any"
							required
							value={form.values.latitude}
							onChange={(event) =>
								form.setValues({
									...form.values,
									latitude: numberOr(event, form.values.latitude),
								})
							}
						/>
					</Field>
					<Field label="Longitude">
						<Input
							type="number"
							min={-180}
							max={180}
							step="any"
							required
							value={form.values.longitude}
							onChange={(event) =>
								form.setValues({
									...form.values,
									longitude: numberOr(event, form.values.longitude),
								})
							}
						/>
					</Field>
				</>,
			)}
			<Field
				label="Timezone"
				hint="Changing this updates the station's operating-system timezone."
			>
				<select
					className={controlClass}
					value={form.values.timezone}
					onChange={(event) =>
						form.setValues({ ...form.values, timezone: event.target.value })
					}
				>
					{timezones.map((timezone) => (
						<option key={timezone}>{timezone}</option>
					))}
				</select>
			</Field>
		</SettingsCard>
	);
}

function DetectionCard({
	initial,
	models,
	save,
	restart,
}: {
	initial: DetectionSettings;
	models: SettingsPageData["supportedModels"];
	save?: Saver<DetectionSettings>;
	restart?: CardRestarter;
}) {
	const form = useCardSave(initial, save, restart);
	const selectedModel = models.find((model) => model.id === form.values.model);
	return (
		<SettingsCard
			title="Detection"
			description="Tune which model predictions become saved detections."
			icon={SlidersHorizontal}
			state={form.state}
			message={form.message}
			onSave={() => void form.submit()}
			restart={restartControl(form)}
			saveDisabled={form.saveDisabled}
		>
			<Field label="Analysis model">
				<select
					className={controlClass}
					value={form.values.model}
					onChange={(event) =>
						form.setValues({
							...form.values,
							model: event.target.value as DetectionSettings["model"],
						})
					}
				>
					{models.map((model) => (
						<option key={model.id} value={model.id}>
							{model.label}
						</option>
					))}
				</select>
			</Field>
			{twoColumns(
				<>
					<Field
						label="Minimum confidence"
						hint="Higher values save fewer, more confident predictions."
					>
						<Input
							type="number"
							min={0.01}
							max={0.99}
							step={0.01}
							required
							value={form.values.confidence}
							onChange={(event) =>
								form.setValues({
									...form.values,
									confidence: numberOr(event, form.values.confidence),
								})
							}
						/>
					</Field>
					<Field
						label="Sensitivity"
						hint="Changes how readily the model scores a sound as a bird."
					>
						<Input
							type="number"
							min={0.5}
							max={1.5}
							step={0.05}
							required
							value={form.values.sensitivity}
							onChange={(event) =>
								form.setValues({
									...form.values,
									sensitivity: numberOr(event, form.values.sensitivity),
								})
							}
						/>
					</Field>
					<Field
						label="Analysis overlap"
						hint="More overlap improves coverage but uses more compute."
					>
						<Input
							type="number"
							min={0}
							max={2.9}
							step={0.1}
							required
							value={form.values.overlap}
							onChange={(event) =>
								form.setValues({
									...form.values,
									overlap: numberOr(event, form.values.overlap),
								})
							}
						/>
					</Field>
				</>,
			)}
			{selectedModel?.supportsRangeModel
				? twoColumns(
						<>
							<Field label="Location model version">
								<select
									className={controlClass}
									value={form.values.dataModelVersion}
									onChange={(event) =>
										form.setValues({
											...form.values,
											dataModelVersion: Number(event.target.value) as 1 | 2,
										})
									}
								>
									<option value={1}>Version 1</option>
									<option value={2}>Version 2</option>
								</select>
							</Field>
							<Field
								label="Species-frequency threshold"
								hint="Narrows candidates using location and season."
								info={
									<>
										How common a species must be near you before BirdNET will
										consider it at all. The score behind this is roughly how
										often birders in your area report that bird this week, so
										even an everyday yard bird sits near 0.5 — not 1.0. The 0.03
										default is deliberately permissive. Lower it to catch more
										species, raise it to cut false positives. Species on Always
										detect skip this check entirely.
									</>
								}
							>
								<Input
									type="number"
									min={0.0005}
									max={0.99}
									step={0.0005}
									required
									value={form.values.speciesFrequencyThreshold}
									onChange={(event) =>
										form.setValues({
											...form.values,
											speciesFrequencyThreshold: numberOr(
												event,
												form.values.speciesFrequencyThreshold,
											),
										})
									}
								/>
							</Field>
						</>,
					)
				: null}
		</SettingsCard>
	);
}

function PrivacyCard({
	initial,
	save,
	restart,
}: {
	initial: PrivacySettings;
	save?: Saver<PrivacySettings>;
	restart?: CardRestarter;
}) {
	const form = useCardSave(initial, save, restart);
	return (
		<SettingsCard
			title="Privacy"
			description="Suppress chunks where the model detects likely human sounds."
			icon={ShieldCheck}
			state={form.state}
			message={form.message}
			onSave={() => void form.submit()}
			restart={restartControl(form)}
			saveDisabled={form.saveDisabled}
		>
			<Field
				label="Privacy threshold"
				hint="0 disables suppression. Larger values inspect a broader portion of predictions."
			>
				<Input
					type="number"
					min={0}
					max={3}
					step={0.1}
					required
					value={form.values.privacyThreshold}
					onChange={(event) =>
						form.setValues({
							privacyThreshold: numberOr(event, form.values.privacyThreshold),
						})
					}
				/>
			</Field>
			<p className="rounded-md bg-muted p-(--page-gap) text-muted-foreground text-xs leading-relaxed">
				Matching chunks and their neighbors are suppressed. This reduces
				incidental speech capture, but it cannot guarantee that speech is never
				recorded.
			</p>
		</SettingsCard>
	);
}

function AudioCard({
	initial,
	save,
	restart,
}: {
	initial: AudioSettings;
	save?: Saver<AudioSettings>;
	restart?: CardRestarter;
}) {
	const form = useCardSave(initial, save, restart);
	return (
		<SettingsCard
			title="Audio input"
			description="Choose a local microphone or one or more network audio streams."
			icon={Mic2}
			state={form.state}
			message={form.message}
			onSave={() => void form.submit()}
			restart={restartControl(form)}
			saveDisabled={form.saveDisabled}
		>
			<Field label="Input mode">
				<select
					className={controlClass}
					value={form.values.mode}
					onChange={(event) =>
						form.setValues({
							...form.values,
							mode: event.target.value as AudioSettings["mode"],
						})
					}
				>
					<option value="microphone">Microphone</option>
					<option value="rtsp">RTSP network stream</option>
				</select>
			</Field>
			{form.values.mode === "microphone" ? (
				twoColumns(
					<>
						<Field
							label="Recording device"
							hint="ALSA or PulseAudio device identifier."
						>
							<Input
								required
								value={form.values.recordingDevice}
								placeholder="default"
								onChange={(event) =>
									form.setValues({
										...form.values,
										recordingDevice: event.target.value,
									})
								}
							/>
						</Field>
						<Field label="Channels">
							<Input
								type="number"
								min={1}
								max={32}
								required
								value={form.values.channels}
								onChange={(event) =>
									form.setValues({
										...form.values,
										channels: numberOr(event, form.values.channels),
									})
								}
							/>
						</Field>
					</>,
				)
			) : (
				<>
					<Field
						label="RTSP streams"
						hint="One rtsp:// or rtsps:// URL per line. Credentials remain in the station configuration."
					>
						<textarea
							className={`${controlClass} min-h-28 py-2 font-mono text-xs`}
							required
							value={form.values.rtspStreams.join("\n")}
							onChange={(event) => {
								const rtspStreams = event.target.value.split(/\r?\n/);
								form.setValues({
									...form.values,
									rtspStreams,
									// Removing streams would otherwise leave the live-player
									// index pointing past the end of the list, and the save
									// would fail on a selector the card no longer shows.
									livestreamIndex: Math.min(
										form.values.livestreamIndex,
										Math.max(0, rtspStreams.filter(Boolean).length - 1),
									),
								});
							}}
						/>
					</Field>
					{form.values.rtspStreams.filter(Boolean).length > 1 ? (
						<Field label="Live-player stream">
							<select
								className={controlClass}
								value={form.values.livestreamIndex}
								onChange={(event) =>
									form.setValues({
										...form.values,
										livestreamIndex: Number(event.target.value),
									})
								}
							>
								{form.values.rtspStreams
									.filter(Boolean)
									.map((stream, index) => (
										<option key={stream} value={index}>
											Stream {index + 1}
										</option>
									))}
							</select>
						</Field>
					) : null}
				</>
			)}
		</SettingsCard>
	);
}

function RecordingCard({
	initial,
	save,
	restart,
}: {
	initial: RecordingSettings;
	save?: Saver<RecordingSettings>;
	restart?: CardRestarter;
}) {
	const form = useCardSave(initial, save, restart);
	return (
		<SettingsCard
			title="Recording"
			description="Control capture duration and the files retained for playback."
			icon={Disc3}
			state={form.state}
			message={form.message}
			onSave={() => void form.submit()}
			restart={restartControl(form)}
			saveDisabled={form.saveDisabled}
		>
			{twoColumns(
				<>
					<Field
						label="Recording length"
						hint="Seconds per analyzed recording."
					>
						<Input
							type="number"
							min={3}
							max={60}
							required
							value={form.values.recordingLength}
							onChange={(event) =>
								form.setValues({
									...form.values,
									recordingLength: numberOr(event, form.values.recordingLength),
								})
							}
						/>
					</Field>
					<Field
						label="Extraction length"
						hint="Leave blank to use the backend default."
					>
						<Input
							type="number"
							min={3}
							max={form.values.recordingLength}
							value={form.values.extractionLength ?? ""}
							onChange={(event) =>
								form.setValues({
									...form.values,
									// Blank is a real choice here -- it hands the backend
									// default back -- so NaN becomes null rather than being
									// held at the last number.
									extractionLength: Number.isNaN(event.target.valueAsNumber)
										? null
										: event.target.valueAsNumber,
								})
							}
						/>
					</Field>
				</>,
			)}
			<Field label="Audio format">
				<select
					className={controlClass}
					value={form.values.audioFormat}
					onChange={(event) =>
						form.setValues({
							...form.values,
							audioFormat: event.target
								.value as RecordingSettings["audioFormat"],
						})
					}
				>
					<option value="mp3">MP3</option>
					<option value="wav">WAV</option>
					<option value="flac">FLAC</option>
					<option value="ogg">Ogg Vorbis</option>
				</select>
			</Field>
		</SettingsCard>
	);
}

function StorageCard({
	initial,
	save,
	restart,
}: {
	initial: StorageSettings;
	save?: Saver<StorageSettings>;
	restart?: CardRestarter;
}) {
	const form = useCardSave(initial, save, restart);
	return (
		<SettingsCard
			title="Storage"
			description="Decide what happens as the station fills its disk."
			icon={HardDrive}
			state={form.state}
			message={form.message}
			onSave={() => void form.submit()}
			restart={restartControl(form)}
			saveDisabled={form.saveDisabled}
		>
			<fieldset className="space-y-2">
				<legend className="mb-1.5 font-medium text-sm">Disk-full action</legend>
				<label className="flex cursor-pointer gap-3 rounded-md border p-(--page-gap)">
					<input
						type="radio"
						name="full-disk-action"
						value="purge"
						checked={form.values.fullDiskAction === "purge"}
						onChange={() =>
							form.setValues({ ...form.values, fullDiskAction: "purge" })
						}
					/>
					<span>
						<strong className="block text-sm">Purge old data</strong>
						<span className="text-muted-foreground text-xs">
							When the threshold is crossed, removes the oldest recordings and
							detection rows.
						</span>
					</span>
				</label>
				<label className="flex cursor-pointer gap-3 rounded-md border p-(--page-gap)">
					<input
						type="radio"
						name="full-disk-action"
						value="keep"
						checked={form.values.fullDiskAction === "keep"}
						onChange={() =>
							form.setValues({ ...form.values, fullDiskAction: "keep" })
						}
					/>
					<span>
						<strong className="block text-sm">Keep all data</strong>
						<span className="text-muted-foreground text-xs">
							Stops core services when space runs out instead of deleting
							recordings.
						</span>
					</span>
				</label>
			</fieldset>
			{twoColumns(
				<>
					<Field
						label="Disk-used threshold"
						hint="Percent used before the selected action runs."
					>
						<Input
							type="number"
							min={20}
							max={99}
							required
							value={form.values.purgeThreshold}
							onChange={(event) =>
								form.setValues({
									...form.values,
									purgeThreshold: numberOr(event, form.values.purgeThreshold),
								})
							}
						/>
					</Field>
					<Field
						label="Maximum files per species"
						hint="0 keeps every recording, subject to disk-full handling."
					>
						<Input
							type="number"
							min={0}
							required
							value={form.values.maxFilesPerSpecies}
							onChange={(event) =>
								form.setValues({
									...form.values,
									maxFilesPerSpecies: numberOr(
										event,
										form.values.maxFilesPerSpecies,
									),
								})
							}
						/>
					</Field>
				</>,
			)}
		</SettingsCard>
	);
}
