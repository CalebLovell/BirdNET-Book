import { ChevronDown, Download, RefreshCw } from "lucide-react";
import type { ChangeEvent, ComponentProps, ReactNode } from "react";
import { createContext, useContext, useEffect, useId, useState } from "react";

import { Button } from "~/components/ui/button.tsx";
import { ConfirmDialog } from "~/components/ui/confirm-dialog.tsx";
import { InfoTip } from "~/components/ui/info-tip.tsx";
import { Input } from "~/components/ui/input.tsx";
import { ShellText } from "~/components/ui/shell.tsx";
import { toast } from "~/components/ui/toaster.tsx";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group.tsx";
import { formatDate } from "~/lib/date-format.ts";
import {
	type AudioSettings,
	type DetectionSettings,
	type HighlightSettings,
	type PrivacySettings,
	type RecordingSettings,
	type ReviewSettings,
	SETTINGS_DEFAULTS,
	type SettingsCardKind,
	type SettingsPageData,
	type SettingsSaveResult,
	type StationSettings,
	type StorageSettings,
	SUPPORTED_MODELS,
	type UpdateSettings,
} from "~/lib/settings-data.ts";
import { formatTimeAgo } from "~/lib/time-ago.ts";
import { modernTimezone } from "~/lib/timezones.ts";
import {
	availableUpdate,
	type UpdateState,
	updateBusy,
} from "~/lib/updates-data.ts";
import { RestartButton } from "./restart-button.tsx";
import { SettingsCard } from "./settings-card.tsx";
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
	review?: Saver<ReviewSettings>;
	highlights?: Saver<HighlightSettings>;
	updates?: Saver<UpdateSettings>;
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

/**
 * Reports a card's save as one toast that changes in place: a spinner while it
 * runs, then how it went. Keyed on the card, so saving the same card twice
 * replaces its toast rather than stacking a second one.
 */
function useCardSave<T>(
	title: string,
	initial: T,
	save?: Saver<T>,
	restart?: CardRestarter,
) {
	const toastId = `settings-${title}`;
	const [values, setValues] = useState(initial);
	// What the station currently holds, as far as this card knows: the values it
	// loaded with, or the ones it last saved. Save has nothing to do until the
	// form differs from this.
	const [saved, setSaved] = useState(initial);
	const [saving, setSaving] = useState(false);
	// The card's values are on disk but BirdNET is still running the old ones.
	// Both save outcomes that mean this -- the restart was refused, or the
	// environment declined to try -- are the same situation to the reader, and
	// the same button fixes them.
	const [needsRestart, setNeedsRestart] = useState(false);

	async function submit() {
		if (!save) return;
		setSaving(true);
		toast.loading(`Saving ${title.toLowerCase()} settings…`, { id: toastId });
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
			// A pending restart stays up until it is read: the Restart button it
			// explains sits beside Save with no words of its own.
			if (pending) {
				toast.warning(result.message, { id: toastId, duration: 10_000 });
			} else {
				toast.success(result.message, { id: toastId });
			}
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "These settings could not be saved.",
				{ id: toastId },
			);
		} finally {
			setSaving(false);
		}
	}

	async function applyNow() {
		if (!restart) return;
		setSaving(true);
		toast.loading("Restarting BirdNET…", { id: toastId });
		try {
			const result = await restart();
			setNeedsRestart(false);
			toast.success(result.message, { id: toastId });
		} catch (error) {
			// The values are still saved -- only the restart failed -- so the card
			// keeps offering the button rather than dropping back to a clean state.
			toast.warning(
				error instanceof Error
					? error.message
					: "BirdNET could not be restarted.",
				{ id: toastId, duration: 10_000 },
			);
		} finally {
			setSaving(false);
		}
	}

	const dirty = !unchanged(values, saved);
	return {
		values,
		setValues,
		submit,
		dirty,
		// A failed save leaves the card dirty, so the button stays live to retry.
		saveDisabled: saving || !dirty,
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

/**
 * One setting as a row: what it is on the left -- label, then a line on what it
 * does -- and the control on the right, every control the same width so they
 * line up down the card. Rows are parted by hairlines; on a phone the control
 * drops beneath its label.
 *
 * Labelled by id rather than by wrapping: the info tip and the timezone hint
 * carry buttons, and a label around those would hand its click to them.
 */
function Field({
	label,
	hint,
	info,
	readOnly = false,
	children,
}: {
	label: string;
	hint?: ReactNode;
	info?: ReactNode;
	/** A row that shows a value rather than holding a control, so its name is
	    plain text, not a label pointing at nothing. */
	readOnly?: boolean;
	children: ReactNode;
}) {
	const id = useId();
	const field = { id, labelId: `${id}-label` };
	const Name = readOnly ? "span" : "label";
	return (
		<div className="grid gap-x-8 gap-y-2 border-t py-(--page-gap) sm:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] sm:items-center">
			<div className="min-w-0">
				<div className="flex items-center gap-1.5">
					<Name
						id={field.labelId}
						htmlFor={readOnly ? undefined : id}
						className="font-medium text-sm leading-6"
					>
						{label}
					</Name>
					{info ? <InfoTip label={label}>{info}</InfoTip> : null}
				</div>
				{hint ? (
					<div className="space-y-1 text-muted-foreground text-xs leading-relaxed">
						{hint}
					</div>
				) : null}
			</div>
			<FieldContext.Provider value={field}>
				<div className="min-w-0">{children}</div>
			</FieldContext.Provider>
		</div>
	);
}

const FieldContext = createContext({ id: "", labelId: "" });

/** Number fields drop the browser's spin arrows: they crowd a short value
    and sit on top of the unit. */
const NO_SPINNER =
	"[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

/** The row's text or number box, with its unit ("s", "%") set inside the
    right edge so a bare figure never has to explain itself in the hint. */
function FieldInput({
	unit,
	className = "",
	...props
}: ComponentProps<typeof Input> & { unit?: string }) {
	const { id } = useContext(FieldContext);
	const numeric = props.type === "number";
	const input = (
		<Input
			id={id}
			className={`${numeric ? `tabular-data ${NO_SPINNER}` : ""} ${unit ? (unit.length > 2 ? "pr-20" : "pr-10") : ""} ${className}`}
			{...props}
		/>
	);
	if (!unit) return input;
	return (
		<div className="relative">
			{input}
			<span
				aria-hidden="true"
				className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground text-sm"
			>
				{unit}
			</span>
		</div>
	);
}

/** A native select in the site's control dress: the same box as the inputs,
    with the chevron the timeline and bird list selects use. */
function FieldSelect({ children, ...props }: ComponentProps<"select">) {
	const { id } = useContext(FieldContext);
	return (
		<div className="relative">
			<select
				id={id}
				className="h-9 w-full cursor-pointer appearance-none rounded-md border border-input bg-card pr-8 pl-3 pointer-coarse:text-base text-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:border-[var(--focus-ring)] focus-visible:outline-none"
				{...props}
			>
				{children}
			</select>
			<ChevronDown
				aria-hidden="true"
				className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground"
			/>
		</div>
	);
}

/** A choice between a few named options, as the moss segmented control. */
function FieldChoice<T extends string>({
	value,
	options,
	onChange,
}: {
	value: T;
	options: { value: T; label: string }[];
	onChange: (value: T) => void;
}) {
	const { labelId } = useContext(FieldContext);
	return (
		<ToggleGroup
			type="single"
			variant="outline"
			aria-labelledby={labelId}
			className="w-full"
			value={value}
			onValueChange={(next) => {
				// Clicking the selected segment again would clear it; a setting
				// always has a value.
				if (next) onChange(next as T);
			}}
		>
			{options.map((option) => (
				<ToggleGroupItem
					key={option.value}
					value={option.value}
					className="flex-1"
				>
					{option.label}
				</ToggleGroupItem>
			))}
		</ToggleGroup>
	);
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
	diskUsedPercent = null,
	updates = null,
	onCheckUpdates,
	onInstallUpdate,
}: {
	data: SettingsPageData;
	savers: SettingsSavers;
	restarter?: SettingsRestarter;
	/** How full the recordings disk is now; null leaves the figure out. */
	diskUsedPercent?: number | null;
	/** What the updater last reported; null while it loads. */
	updates?: UpdateState | null;
	onCheckUpdates?: () => Promise<UpdateState>;
	onInstallUpdate?: () => Promise<void>;
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
				diskUsedPercent={diskUsedPercent}
			/>
			<ReviewSettingsCard initial={data.review} save={savers.review} />
			<HighlightsSettingsCard
				initial={data.highlights}
				save={savers.highlights}
			/>
			<UpdatesSettingsCard
				initial={data.updates}
				save={savers.updates}
				updates={updates}
				onCheck={onCheckUpdates}
				onInstall={onInstallUpdate}
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
	const form = useCardSave("Station", initial, save, restart);
	return (
		<SettingsCard
			title="Station"
			description="Name the station and locate it for geographic species filtering."
			onSave={() => void form.submit()}
			restart={restartControl(form)}
			saveDisabled={form.saveDisabled}
		>
			<Field label="Station name" hint="What this station is called.">
				<FieldInput
					value={form.values.siteName}
					maxLength={80}
					onChange={(event) =>
						form.setValues({ ...form.values, siteName: event.target.value })
					}
				/>
			</Field>
			<Field label="Latitude" hint="Decimal degrees, north positive.">
				<FieldInput
					type="number"
					min={-90}
					max={90}
					step="any"
					required
					unit="°"
					value={form.values.latitude}
					onChange={(event) =>
						form.setValues({
							...form.values,
							latitude: numberOr(event, form.values.latitude),
						})
					}
				/>
			</Field>
			<Field label="Longitude" hint="Decimal degrees, east positive.">
				<FieldInput
					type="number"
					min={-180}
					max={180}
					step="any"
					required
					unit="°"
					value={form.values.longitude}
					onChange={(event) =>
						form.setValues({
							...form.values,
							longitude: numberOr(event, form.values.longitude),
						})
					}
				/>
			</Field>
			<Field
				label="Your location"
				readOnly
				hint="Fill the latitude and longitude from this device's location."
			>
				<StationLocation
					current={{
						latitude: form.values.latitude,
						longitude: form.values.longitude,
					}}
					onApply={(coordinates) =>
						form.setValues({ ...form.values, ...coordinates })
					}
				/>
			</Field>
			<Field
				label="Timezone"
				hint={
					<>
						<p>
							Type to search, e.g. “New York”. Also sets the station's
							operating-system clock.
						</p>
						<BrowserTimezoneHint
							timezone={form.values.timezone}
							onUse={(timezone) => form.setValues({ ...form.values, timezone })}
						/>
					</>
				}
			>
				{/* A text field over a datalist rather than a select: ~400 zones
				    are a long scroll, and typing any part of a name finds it. */}
				<FieldInput
					list="station-timezones"
					autoComplete="off"
					spellCheck={false}
					value={form.values.timezone}
					onChange={(event) =>
						form.setValues({ ...form.values, timezone: event.target.value })
					}
				/>
				<datalist id="station-timezones">
					{timezones.map((timezone) => (
						<option key={timezone} value={timezone} />
					))}
				</datalist>
			</Field>
		</SettingsCard>
	);
}

/**
 * Offers this browser's own timezone when it differs from the station's -- the
 * likeliest way a station ends up on the wrong clock is a zone picked once and
 * never checked against where it actually sits. Read after mount, since the
 * server can't know the viewer's zone and guessing would break hydration.
 */
function BrowserTimezoneHint({
	timezone,
	onUse,
}: {
	timezone: string;
	onUse: (timezone: string) => void;
}) {
	const skeleton = useContext(SkeletonContext);
	const [browserTimezone, setBrowserTimezone] = useState<string | null>(null);
	useEffect(() => {
		setBrowserTimezone(
			modernTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone),
		);
	}, []);

	// The skeleton's timezone is a placeholder, so it has nothing to compare;
	// a loaded station on the browser's own zone shows no hint either.
	if (
		skeleton ||
		!browserTimezone ||
		modernTimezone(timezone) === browserTimezone
	) {
		return null;
	}
	return (
		<p>
			This browser is on <span className="font-medium">{browserTimezone}</span>.{" "}
			<button
				type="button"
				onClick={() => onUse(browserTimezone)}
				className="font-medium text-[var(--moss)] underline underline-offset-2"
			>
				Use it
			</button>
		</p>
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
	const form = useCardSave("Detection", initial, save, restart);
	const selectedModel = models.find((model) => model.id === form.values.model);
	return (
		<SettingsCard
			title="Detection"
			description="Tune which model predictions become saved detections."
			onSave={() => void form.submit()}
			restart={restartControl(form)}
			saveDisabled={form.saveDisabled}
		>
			<Field
				label="Analysis model"
				hint="The classifier that scores each chunk."
			>
				<FieldSelect
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
				</FieldSelect>
			</Field>
			<Field
				label="Minimum confidence"
				hint="Higher values save fewer, more confident predictions."
			>
				<FieldInput
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
				hint="How readily the model scores a sound as a bird."
			>
				<FieldInput
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
				<FieldInput
					type="number"
					min={0}
					max={2.9}
					step={0.1}
					required
					unit="s"
					value={form.values.overlap}
					onChange={(event) =>
						form.setValues({
							...form.values,
							overlap: numberOr(event, form.values.overlap),
						})
					}
				/>
			</Field>
			{selectedModel?.supportsRangeModel ? (
				<>
					<Field
						label="Location model version"
						hint="The range model that predicts which species live near you."
					>
						<FieldSelect
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
						</FieldSelect>
					</Field>
					<Field
						label="Species-frequency threshold"
						hint="Narrows candidates using location and season."
						info={
							<>
								How common a species must be near you before BirdNET will
								consider it at all. The score behind this is roughly how often
								birders in your area report that bird this week, so even an
								everyday yard bird sits near 0.5 — not 1.0. The 0.03 default is
								deliberately permissive. Lower it to catch more species, raise
								it to cut false positives. Species on Always detect skip this
								check entirely.
							</>
						}
					>
						<FieldInput
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
				</>
			) : null}
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
	const form = useCardSave("Privacy", initial, save, restart);
	return (
		<SettingsCard
			title="Privacy"
			description="Suppress chunks where the model detects likely human sounds."
			onSave={() => void form.submit()}
			restart={restartControl(form)}
			saveDisabled={form.saveDisabled}
		>
			<Field
				label="Privacy threshold"
				hint="Speech is filtered even at 0. Higher values catch fainter voices, and drop more birds by mistake."
				info={
					<>
						BirdNET drops a chunk when a human sound is among its top 10 guesses
						for it at 0, its top 60 at 1, and its top 180 at 3. The chunks
						either side are dropped too. Saved clips longer than 9 seconds can
						still reach past them into speech, and the live stream is never
						filtered.
					</>
				}
			>
				<FieldInput
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
	const form = useCardSave("Audio input", initial, save, restart);
	const streams = form.values.rtspStreams.filter(Boolean);
	return (
		<SettingsCard
			title="Audio input"
			description="Choose a local microphone or one or more network audio streams."
			onSave={() => void form.submit()}
			restart={restartControl(form)}
			saveDisabled={form.saveDisabled}
		>
			<Field label="Input" hint="Where the station listens from.">
				<FieldChoice
					value={form.values.mode}
					options={[
						{ value: "microphone", label: "Microphone" },
						{ value: "rtsp", label: "RTSP stream" },
					]}
					onChange={(mode) => form.setValues({ ...form.values, mode })}
				/>
			</Field>
			{form.values.mode === "microphone" ? (
				<>
					<Field
						label="Recording device"
						hint="ALSA or PulseAudio device identifier."
					>
						<FieldInput
							required
							className="font-mono"
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
					<Field label="Channels" hint="Channels captured from the device.">
						<FieldInput
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
				</>
			) : (
				<>
					<Field
						label="RTSP streams"
						hint="One rtsp:// or rtsps:// URL per line. Credentials stay in the station configuration."
					>
						<FieldTextarea
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
					{streams.length > 1 ? (
						<Field
							label="Live-player stream"
							hint="The stream the live player plays."
						>
							<FieldSelect
								value={form.values.livestreamIndex}
								onChange={(event) =>
									form.setValues({
										...form.values,
										livestreamIndex: Number(event.target.value),
									})
								}
							>
								{streams.map((stream, index) => (
									<option key={stream} value={index}>
										Stream {index + 1}
									</option>
								))}
							</FieldSelect>
						</Field>
					) : null}
				</>
			)}
		</SettingsCard>
	);
}

/** The RTSP list: the input's box, grown to a few lines of monospace URLs. */
function FieldTextarea(props: ComponentProps<"textarea">) {
	const { id } = useContext(FieldContext);
	return (
		<textarea
			id={id}
			className="block min-h-28 w-full rounded-md border border-input bg-card px-3 py-2 font-mono text-xs transition-colors placeholder:text-muted-foreground focus-visible:border-[var(--focus-ring)] focus-visible:outline-none"
			{...props}
		/>
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
	const form = useCardSave("Recording", initial, save, restart);
	return (
		<SettingsCard
			title="Recording"
			description="Control capture duration and the files retained for playback."
			onSave={() => void form.submit()}
			restart={restartControl(form)}
			saveDisabled={form.saveDisabled}
		>
			<Field
				label="Recording length"
				hint="Audio captured per analyzed recording."
			>
				<FieldInput
					type="number"
					min={3}
					max={60}
					required
					unit="s"
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
				hint="Length of each saved clip. Leave blank for the backend default."
			>
				<FieldInput
					type="number"
					min={3}
					max={form.values.recordingLength}
					unit="s"
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
			<Field label="Audio format" hint="File type for saved clips.">
				<FieldSelect
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
				</FieldSelect>
			</Field>
		</SettingsCard>
	);
}

function StorageCard({
	initial,
	save,
	restart,
	diskUsedPercent,
}: {
	initial: StorageSettings;
	save?: Saver<StorageSettings>;
	restart?: CardRestarter;
	diskUsedPercent: number | null;
}) {
	const form = useCardSave("Storage", initial, save, restart);
	return (
		<SettingsCard
			title="Storage"
			description="Decide what happens as the station fills its disk."
			onSave={() => void form.submit()}
			restart={restartControl(form)}
			saveDisabled={form.saveDisabled}
		>
			<Field
				label="When the disk fills"
				hint={
					form.values.fullDiskAction === "purge"
						? "Removes the oldest recordings and detection rows once the threshold is crossed."
						: "Stops core services when space runs out instead of deleting recordings."
				}
			>
				<FieldChoice
					value={form.values.fullDiskAction}
					options={[
						{ value: "purge", label: "Purge old data" },
						{ value: "keep", label: "Keep all data" },
					]}
					onChange={(fullDiskAction) =>
						form.setValues({ ...form.values, fullDiskAction })
					}
				/>
			</Field>
			<Field
				label="Disk-used threshold"
				hint={
					diskUsedPercent === null
						? "How full the disk gets before that action runs."
						: `How full the disk gets before that action runs. It is ${Math.round(diskUsedPercent)}% full now.`
				}
			>
				<FieldInput
					type="number"
					min={20}
					max={99}
					required
					unit="%"
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
				<FieldInput
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
		</SettingsCard>
	);
}

/**
 * How rare a species has to be for its detections to land in the Review
 * queue. Nothing to restart -- the queue is judged by it on its next load.
 */
function ReviewSettingsCard({
	initial,
	save,
}: {
	initial: ReviewSettings;
	save?: Saver<ReviewSettings>;
}) {
	const form = useCardSave("Review", initial, save);
	return (
		<SettingsCard
			title="Review"
			description="Decide which uncommon species the Review page asks you to confirm."
			confirmDescription="This writes the value in this card to the station's configuration. Nothing restarts: the Review queue is judged by it from its next load."
			onSave={() => void form.submit()}
			saveDisabled={form.saveDisabled}
		>
			<Field
				label="Rare species threshold"
				hint="Species with fewer detections than this, in all, are queued for review."
			>
				<FieldInput
					type="number"
					min={1}
					max={10_000}
					required
					unit="detections"
					value={form.values.rareSpeciesMax}
					onChange={(event) =>
						form.setValues({
							rareSpeciesMax: numberOr(event, form.values.rareSpeciesMax),
						})
					}
				/>
			</Field>
		</SettingsCard>
	);
}

/**
 * What earns a bird each line on the Highlights card (Live page and
 * timeline). Only the day-scale knobs: a week or month view keeps its own
 * fixed lookback. Nothing to restart -- the next page load judges by these.
 */
function HighlightsSettingsCard({
	initial,
	save,
}: {
	initial: HighlightSettings;
	save?: Saver<HighlightSettings>;
}) {
	const form = useCardSave("Highlights", initial, save);
	const number =
		(key: keyof HighlightSettings) => (event: ChangeEvent<HTMLInputElement>) =>
			form.setValues({
				...form.values,
				[key]: numberOr(event, form.values[key]),
			});
	return (
		<SettingsCard
			title="Highlights"
			description="Decide which birds the Highlights card calls out on the Live page and timeline."
			confirmDescription="This writes the values in this card to the station's configuration. Nothing restarts: the Live page and timeline judge by them from their next load."
			onSave={() => void form.submit()}
			saveDisabled={form.saveDisabled}
		>
			<Field
				label="Rare"
				hint="A bird heard before, with this many records or fewer in all."
			>
				<FieldInput
					type="number"
					min={1}
					max={1000}
					required
					unit="records"
					value={form.values.rareMax}
					onChange={number("rareMax")}
				/>
			</Field>
			<Field
				label="Returned"
				hint="Back after going unheard for at least this long."
			>
				<FieldInput
					type="number"
					min={2}
					max={90}
					required
					unit="days"
					value={form.values.returnedDays}
					onChange={number("returnedDays")}
				/>
			</Field>
			<Field
				label="Gone quiet"
				hint="Heard every day for this long, then not today."
			>
				<FieldInput
					type="number"
					min={2}
					max={90}
					required
					unit="days"
					value={form.values.goneQuietDays}
					onChange={number("goneQuietDays")}
				/>
			</Field>
			<Field
				label="Regular"
				hint="Heard this many days in a row, today included."
			>
				<FieldInput
					type="number"
					min={2}
					max={90}
					required
					unit="days"
					value={form.values.regularDays}
					onChange={number("regularDays")}
				/>
			</Field>
			<Field
				label="Vocal"
				hint="Calling this many times more than its usual day."
			>
				<FieldInput
					type="number"
					min={1.5}
					max={20}
					step={0.5}
					required
					unit="×"
					value={form.values.vocalRatio}
					onChange={number("vocalRatio")}
				/>
			</Field>
		</SettingsCard>
	);
}

function ago(iso: string) {
	const label = formatTimeAgo(Date.now() - new Date(iso).getTime());
	return label === "just now" ? label : `${label} ago`;
}

/**
 * The station's software: what it runs, what GitHub last offered, and whether
 * it installs new releases by itself. Checking and installing are handed to the
 * updater (scripts/update_birdnet.sh) through systemd and followed by polling
 * its status file, since an install restarts this server mid-way.
 */
function UpdatesSettingsCard({
	initial,
	save,
	updates,
	onCheck,
	onInstall,
}: {
	initial: UpdateSettings;
	save?: Saver<UpdateSettings>;
	updates: UpdateState | null;
	onCheck?: () => Promise<UpdateState>;
	onInstall?: () => Promise<void>;
}) {
	const form = useCardSave("Updates", initial, save);
	const [confirming, setConfirming] = useState(false);
	// The version this tab's code came with. Once the station reports another,
	// the code here is the old one, and the reader is offered a reload.
	const [loadedVersion, setLoadedVersion] = useState<string | null>(null);
	const installed = updates?.installed ?? null;
	useEffect(() => {
		if (installed && loadedVersion === null)
			setLoadedVersion(installed.version);
	}, [installed, loadedVersion]);
	const managed = updates?.managed ?? false;
	const busy = updates ? updateBusy(updates) : false;
	const offered = updates ? availableUpdate(updates) : null;
	const reloadable =
		loadedVersion !== null &&
		installed !== null &&
		installed.version !== loadedVersion;

	// Held here rather than read from the status file: a check is over in a
	// second or two, quicker than the page polls, so "checking" there is
	// rarely seen.
	const [checking, setChecking] = useState(false);

	async function run(
		action: (() => Promise<void>) | undefined,
		failure: string,
	) {
		if (!action) return;
		try {
			await action();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : failure, {
				id: "settings-updates",
			});
		}
	}

	async function check() {
		if (!onCheck) return;
		setChecking(true);
		try {
			const result = await onCheck();
			if (result.state === "failed")
				toast.error(result.message ?? "Couldn't look for updates.", {
					id: "settings-updates",
				});
			else
				toast.success(
					result.message ??
						(availableUpdate(result)
							? "An update is available."
							: "Up to date."),
					{ id: "settings-updates" },
				);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Couldn't look for updates.",
				{ id: "settings-updates" },
			);
		} finally {
			setChecking(false);
		}
	}

	return (
		<SettingsCard
			title="Updates"
			description="Keep this station on the newest release of BirdNET-Book."
			confirmDescription="This writes the values in this card to the station's configuration. Nothing restarts."
			onSave={() => void form.submit()}
			saveDisabled={form.saveDisabled}
		>
			<Field
				label="This station"
				readOnly
				hint={
					updates === null ? (
						<ShellText className="text-xs" barClassName="w-40" />
					) : !managed ? (
						"Not installed from a release, so the updater leaves it alone."
					) : reloadable ? (
						<p>
							Updated.{" "}
							<button
								type="button"
								onClick={() => window.location.reload()}
								className="font-medium text-[var(--moss)] underline underline-offset-2"
							>
								Reload to use it
							</button>
						</p>
					) : installed?.installedAt ? (
						`Installed ${formatDate(installed.installedAt)}.`
					) : null
				}
			>
				{updates === null ? (
					<ShellText className="text-sm leading-9" barClassName="w-24" />
				) : (
					<p className="text-sm leading-9">
						{!managed ? (
							"Development copy"
						) : (
							<span className="tabular-data">
								{installed?.version ?? "Unknown"}
							</span>
						)}
					</p>
				)}
			</Field>
			<Field
				label="Newest release"
				readOnly
				hint={
					updates === null ? (
						<ShellText className="text-xs" barClassName="w-48" />
					) : updates.state === "failed" && updates.message ? (
						<span className="text-destructive">{updates.message}</span>
					) : updates.state === "updating" ? (
						"Recording stops for about a minute while it installs, and this page comes back when the station does."
					) : updates.checkedAt ? (
						`Checked ${ago(updates.checkedAt)}.`
					) : managed ? (
						"Checked nightly, or when you press Check."
					) : (
						"Only an installed station looks for releases."
					)
				}
			>
				{updates === null ? (
					<ShellText className="text-sm leading-9" barClassName="w-28" />
				) : updates.state === "updating" ? (
					<p className="text-sm leading-9">
						Installing{" "}
						<span className="tabular-data">{updates.target ?? "update"}</span>…
					</p>
				) : offered ? (
					<Button
						type="button"
						size="default"
						icon={Download}
						disabled={busy || !onInstall}
						onClick={() => setConfirming(true)}
					>
						Update to {offered}
					</Button>
				) : (
					<p className="text-sm leading-9">
						{updates.latest
							? "Up to date"
							: managed
								? "Not checked yet"
								: "Not available"}
					</p>
				)}
			</Field>
			<Field
				label="Check for updates"
				readOnly
				hint="Ask GitHub for the newest release now instead of waiting for tonight's check."
			>
				<Button
					type="button"
					variant="outline"
					size="default"
					icon={RefreshCw}
					loading={checking || updates?.state === "checking"}
					disabled={!managed || busy || !onCheck}
					onClick={() => void check()}
				>
					{checking ? "Checking…" : "Check"}
				</Button>
			</Field>
			<Field
				label="Automatic updates"
				hint="Installs new releases by itself overnight, between 3 and 5 AM. Off, they wait for you to press Update."
			>
				<FieldChoice
					value={form.values.automatic ? "on" : "off"}
					options={[
						{ value: "on", label: "On" },
						{ value: "off", label: "Off" },
					]}
					onChange={(choice) => form.setValues({ automatic: choice === "on" })}
				/>
			</Field>

			{confirming && offered ? (
				<ConfirmDialog
					title={`Update to ${offered}?`}
					description="The station installs the new release and restarts. Recording stops for about a minute, and this page comes back when the station does. If the new version doesn't start, the station goes back to the one it has now."
					confirmLabel="Update now"
					confirmIcon={Download}
					onCancel={() => setConfirming(false)}
					onConfirm={() => {
						setConfirming(false);
						void run(onInstall, "Couldn't start the update.");
					}}
				/>
			) : null}
		</SettingsCard>
	);
}

/** True inside SettingsCardsSkeleton, for the odd piece that has to know. */
const SkeletonContext = createContext(false);

/** Laid out against, never shown: every value is blanked by the skeleton's
    styles. Station has no static default, so it gets a stand-in -- placed
    somewhere real, since 0, 0 is the one location the card warns about, and
    the warning would make the skeleton taller than any loaded card. */
const SKELETON_DATA: SettingsPageData = {
	...SETTINGS_DEFAULTS,
	station: { siteName: "", latitude: 45, longitude: -75, timezone: "UTC" },
	supportedModels: [...SUPPORTED_MODELS],
	supportedTimezones: ["UTC"],
	updates: { automatic: true },
};

/**
 * The six cards before the configuration arrives -- the real cards, so every
 * header, label and hint is itself and in place, laid out on placeholder
 * values that the wrapper's styles blank: each field is a soft shell of its
 * own size with nothing showing through it. Inert, so none of it can be
 * focused or saved.
 */
export function SettingsCardsSkeleton() {
	return (
		<div inert aria-busy="true" className="settings-skeleton">
			<SkeletonContext.Provider value={true}>
				<SettingsCards data={SKELETON_DATA} savers={{}} />
			</SkeletonContext.Provider>
		</div>
	);
}
