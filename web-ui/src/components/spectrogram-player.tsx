import { Pause, Play } from "lucide-react";
import {
	type KeyboardEvent,
	type PointerEvent,
	type ReactNode,
	useEffect,
	useReducer,
	useRef,
	useState,
} from "react";

import { ConfidencePill } from "~/components/confidence-pill.tsx";
import { recordingActionLabel } from "~/components/recording-button.tsx";
import { Spectrogram } from "~/components/spectrogram.tsx";
import { Button } from "~/components/ui/button.tsx";
import { ShellBar, ShellSized, ShellText } from "~/components/ui/shell.tsx";
import {
	clipNeedsLoad,
	clipShouldPlay,
	clipShowsPlayhead,
	clipTransition,
	INITIAL_CLIP_STATE,
} from "~/lib/clip-player-machine.ts";
import { claimPlayback, fetchAudioBlob } from "~/lib/use-playable-audio.ts";

const DEFAULT_HEIGHT = "h-36 max-[400px]:h-28";
// The controls sit the card's own padding below the plot -- the same gap the
// card leaves above the plot and below the controls -- so the plot reads as
// evenly framed rather than with its controls crowded up against it.
const CONTROLS_CLASS = "mt-(--page-gap) flex flex-wrap items-center gap-2";
const SCRUBBER_CLASS =
	"cursor-pointer touch-none select-none rounded-md focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-2";
const TIME_CLASS = "tabular-data text-muted-foreground text-xs";
const META_DATE_CLASS = "tabular-data text-muted-foreground text-sm";

// How far the element's own clock may disagree with the glide before the
// glide snaps to it. A seek or a stall is far more than this; the element's
// coarse updates are well under it.
const RESYNC_SECONDS = 0.15;

/**
 * The app's one spectrogram player: wherever a recording has room to be seen
 * as well as heard (Learn, Review, a species' best recording), it is this.
 * The spectrogram is drawn before the first play -- the shape of a call is
 * worth seeing on its own -- and the plot itself is the scrubber: click or drag
 * anywhere on it to move the playhead (the audio holds still for the drag and
 * carries on from where it's dropped), or focus it and use the arrow keys.
 * Under it, play/pause and the time; `aside` fills the rest of that row (a
 * date, a confidence pill).
 *
 * What the player is doing lives in one state machine (`clip-player-machine`);
 * the <audio> element is kept in line with it. The playhead and the running
 * time are written straight to the DOM each frame rather than through React
 * state, and the line moves by `transform`, so playback costs no re-renders
 * and no layout -- nothing for a busy page to make stutter.
 *
 * Callers give this a `key` per clip; a remount is what swaps clips.
 */
export function SpectrogramPlayer({
	audioUrl,
	speciesName,
	aside,
	fill = false,
	className = DEFAULT_HEIGHT,
}: {
	audioUrl: string;
	/** Names the bird in the accessible labels; leave it out where naming it
	 * would give the answer away (the quiz). */
	speciesName?: string;
	/** Laid out at the far end of the controls row. */
	aside?: ReactNode;
	/** Grow to fill a flex column, the plot taking whatever height is spare
	 * (pair with a `min-h-*` in `className`). */
	fill?: boolean;
	/** Sizes the spectrogram. */
	className?: string;
}) {
	const [state, dispatch] = useReducer(clipTransition, INITIAL_CLIP_STATE);
	const [duration, setDuration] = useState<number | null>(null);
	const audioRef = useRef<HTMLAudioElement>(null);
	const playheadRef = useRef<HTMLDivElement>(null);
	const timeRef = useRef<HTMLSpanElement>(null);
	const sliderRef = useRef<HTMLDivElement>(null);
	const objectUrlRef = useRef<string | null>(null);
	// A drag that starts before the clip has loaded: where to put it once it has.
	const pendingRef = useRef<number | null>(null);
	// The pointer holding the playhead, from press to release; null otherwise.
	const dragRef = useRef<number | null>(null);
	const durationRef = useRef<number | null>(null);
	durationRef.current = duration;

	/** Puts the playhead and the running time at `fraction` of the clip. */
	function paint(fraction: number) {
		const clamped = Math.min(Math.max(fraction, 0), 1);
		const seconds = clamped * (durationRef.current ?? 0);
		if (playheadRef.current)
			playheadRef.current.style.transform = `translateX(${clamped * 100}%)`;
		const clock = formatClock(seconds);
		if (timeRef.current && timeRef.current.textContent !== clock) {
			timeRef.current.textContent = clock;
			sliderRef.current?.setAttribute(
				"aria-valuenow",
				String(Math.round(seconds)),
			);
			sliderRef.current?.setAttribute(
				"aria-valuetext",
				`${clock} of ${formatClock(durationRef.current ?? 0)}`,
			);
		}
	}

	function paintFromAudio() {
		const audio = audioRef.current;
		if (audio && audio.duration > 0) paint(audio.currentTime / audio.duration);
	}

	// Loading: fetch once, hand the element the blob, land wherever the machine
	// was heading.
	// biome-ignore lint/correctness/useExhaustiveDependencies: status is the trigger
	useEffect(() => {
		if (!clipNeedsLoad(state)) return;
		const audio = audioRef.current;
		if (!audio) return;
		let cancelled = false;
		fetchAudioBlob(audioUrl).then(
			(blob) => {
				if (cancelled) return;
				objectUrlRef.current = URL.createObjectURL(blob);
				audio.addEventListener(
					"loadedmetadata",
					() => {
						if (Number.isFinite(audio.duration)) setDuration(audio.duration);
						if (pendingRef.current !== null) {
							audio.currentTime = pendingRef.current * audio.duration;
							pendingRef.current = null;
						}
						if (!cancelled) dispatch({ type: "loaded" });
					},
					{ once: true },
				);
				audio.src = objectUrlRef.current;
			},
			() => {
				if (!cancelled) dispatch({ type: "loadFailed" });
			},
		);
		return () => {
			cancelled = true;
		};
	}, [state.status, audioUrl]);

	// The element follows the machine: sounding exactly when it's "playing".
	// biome-ignore lint/correctness/useExhaustiveDependencies: status is the trigger
	useEffect(() => {
		const audio = audioRef.current;
		if (!audio || !objectUrlRef.current) return;
		if (clipShouldPlay(state)) {
			if (audio.paused)
				audio.play().catch(() => dispatch({ type: "mediaPaused" }));
		} else if (!audio.paused) {
			audio.pause();
		}
		if (state.status === "ended") paint(0);
		else if (state.status !== "playing") paintFromAudio();
	}, [state.status]);

	// While playing, the playhead glides on the frame clock from the last point
	// it agreed with the element. `currentTime` itself only advances in uneven
	// 25-40ms chunks, so reading it every frame makes the line hop; instead the
	// glide eases toward it each time it reports, and snaps to it on a seek or
	// a stall.
	// biome-ignore lint/correctness/useExhaustiveDependencies: status is the trigger
	useEffect(() => {
		const audio = audioRef.current;
		if (!audio || state.status !== "playing") return;
		let anchor = { media: audio.currentTime, wall: performance.now() };
		let lastRaw = audio.currentTime;
		let frame = requestAnimationFrame(function tick(now) {
			const raw = audio.currentTime;
			let at = anchor.media + ((now - anchor.wall) / 1000) * audio.playbackRate;
			if (Math.abs(raw - at) > RESYNC_SECONDS) {
				anchor = { media: raw, wall: now };
				at = raw;
			} else if (raw !== lastRaw) {
				anchor.media += (raw - at) * 0.1;
			}
			lastRaw = raw;
			if (audio.duration > 0) paint(at / audio.duration);
			frame = requestAnimationFrame(tick);
		});
		return () => cancelAnimationFrame(frame);
	}, [state.status]);

	useEffect(() => {
		const audio = audioRef.current;
		return () => {
			audio?.pause();
			if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
		};
	}, []);

	/** Moves playback to `fraction` of the clip -- now if it's loaded, or as
	 * soon as it is. */
	function seekTo(fraction: number) {
		const clamped = Math.min(Math.max(fraction, 0), 1);
		const audio = audioRef.current;
		if (audio && audio.duration > 0)
			audio.currentTime = clamped * audio.duration;
		else pendingRef.current = clamped;
		paint(clamped);
	}

	function fractionAt(event: PointerEvent<HTMLDivElement>): number {
		const box = event.currentTarget.getBoundingClientRect();
		return (event.clientX - box.left) / box.width;
	}

	function onPointerDown(event: PointerEvent<HTMLDivElement>) {
		if (event.button !== 0) return;
		dragRef.current = event.pointerId;
		event.currentTarget.setPointerCapture(event.pointerId);
		dispatch({ type: "scrubStart" });
		seekTo(fractionAt(event));
	}

	// Only a press drags: a pointer merely passing over the plot (or one whose
	// button came up somewhere this element never heard about) moves nothing.
	function onPointerMove(event: PointerEvent<HTMLDivElement>) {
		if (dragRef.current !== event.pointerId) return;
		if ((event.buttons & 1) === 0) {
			onPointerEnd(event);
			return;
		}
		seekTo(fractionAt(event));
	}

	function onPointerEnd(event: PointerEvent<HTMLDivElement>) {
		if (dragRef.current !== event.pointerId) return;
		dragRef.current = null;
		dispatch({ type: "scrubEnd" });
	}

	function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
		const audio = audioRef.current;
		const length = duration ?? 0;
		const at =
			audio && audio.duration > 0 ? audio.currentTime / audio.duration : 0;
		// Half a second a press: clips are short enough that a whole second skips
		// most of a call.
		const step = length > 0 ? 0.5 / length : 0.05;
		const moves: Record<string, number> = {
			ArrowLeft: at - step,
			ArrowDown: at - step,
			ArrowRight: at + step,
			ArrowUp: at + step,
			PageDown: at - step * 5,
			PageUp: at + step * 5,
			Home: 0,
			End: 1,
		};
		if (event.key === " ") {
			event.preventDefault();
			dispatch({ type: "toggle" });
		} else if (event.key in moves) {
			event.preventDefault();
			seekTo(moves[event.key]);
		}
	}

	const isPlaying = state.status === "playing";
	const isLoading = state.status === "loading" && state.afterLoad === "play";
	const total = formatClock(duration ?? 0);

	return (
		<div className={fill ? "flex flex-1 flex-col" : undefined}>
			<div
				ref={sliderRef}
				role="slider"
				tabIndex={0}
				aria-label={
					speciesName ? `${speciesName} call position` : "Call position"
				}
				aria-valuemin={0}
				aria-valuemax={Math.round(duration ?? 0)}
				// The starting values only: `paint` keeps both current after mount.
				aria-valuenow={0}
				aria-valuetext={`0:00.0 of ${total}`}
				onPointerDown={onPointerDown}
				onPointerMove={onPointerMove}
				onPointerUp={onPointerEnd}
				onPointerCancel={onPointerEnd}
				onLostPointerCapture={onPointerEnd}
				onKeyDown={onKeyDown}
				className={
					fill ? `${SCRUBBER_CLASS} flex flex-1 flex-col` : SCRUBBER_CLASS
				}
			>
				<Spectrogram
					audioUrl={audioUrl}
					onDecoded={setDuration}
					className={className}
				>
					{/* A full-width layer slid along by `transform`, the line at its
					    left edge: moving it is a compositor-only change. A plain
					    line, no handle: the whole plot is what you grab. */}
					<div
						ref={playheadRef}
						aria-hidden="true"
						className={`absolute inset-0 will-change-transform ${clipShowsPlayhead(state) ? "" : "opacity-0"}`}
					>
						<div className="absolute inset-y-0 left-0 w-px -translate-x-1/2 bg-[var(--ink)]" />
					</div>
				</Spectrogram>
			</div>

			<div className={CONTROLS_CLASS}>
				<Button
					type="button"
					size="icon-sm"
					icon={isPlaying ? Pause : Play}
					loading={isLoading}
					onClick={() => dispatch({ type: "toggle" })}
					aria-label={recordingActionLabel(isPlaying, speciesName)}
				/>
				<span className={TIME_CLASS}>
					{/* Written each frame by `paint`, never by React after mount. */}
					<span ref={timeRef}>0:00.0</span> / {total}
				</span>
				{aside ? (
					<div className="ml-auto flex flex-wrap items-center gap-2">
						{aside}
					</div>
				) : null}
			</div>

			<audio
				ref={audioRef}
				preload="none"
				onPlay={() => claimPlayback(audioRef.current)}
				onPlaying={() => dispatch({ type: "mediaPlaying" })}
				onPause={() => {
					// A clip that runs out pauses too; "ended" speaks for that.
					if (!audioRef.current?.ended) dispatch({ type: "mediaPaused" });
				}}
				onEnded={() => dispatch({ type: "mediaEnded" })}
				onSeeking={() => {
					if (state.status !== "playing") paintFromAudio();
				}}
			>
				<track kind="captions" />
			</audio>
		</div>
	);
}

/**
 * The player before its clip arrives: the plot's rectangle at the player's
 * height, then the real button and time readout under shells, with `aside`
 * (its own shells) at the far end.
 */
export function SpectrogramPlayerSkeleton({
	aside,
	fill = false,
	className = DEFAULT_HEIGHT,
}: {
	aside?: ReactNode;
	fill?: boolean;
	className?: string;
}) {
	return (
		<div
			aria-hidden="true"
			className={fill ? "flex flex-1 flex-col" : undefined}
		>
			<ShellBar className={`rounded-md ${className}`} />
			<div className={CONTROLS_CLASS}>
				<ShellSized className="rounded-md">
					<Button type="button" size="icon-sm" icon={Play} disabled />
				</ShellSized>
				<ShellText className={`w-24 ${TIME_CLASS}`} barClassName="w-full" />
				{aside ? (
					<div className="ml-auto flex flex-wrap items-center gap-2">
						{aside}
					</div>
				) : null}
			</div>
		</div>
	);
}

/**
 * What a clip is, for a player's `aside`: when it was heard, then its score.
 * Every spectrogram card ends its controls row this way.
 */
export function ClipMeta({
	heardAt,
	confidence,
}: {
	/** Already formatted (`formatDateTime`). */
	heardAt: string;
	confidence: number | null;
}) {
	return (
		<>
			<span className={META_DATE_CLASS}>{heardAt}</span>
			{confidence !== null ? <ConfidencePill confidence={confidence} /> : null}
		</>
	);
}

/** `ClipMeta`'s shells, for a player skeleton's `aside`. */
export function ClipMetaSkeleton() {
	return (
		<>
			<ShellText className={`w-40 ${META_DATE_CLASS}`} barClassName="w-full" />
			<ShellSized className="rounded-full">
				<ConfidencePill confidence={0.9} />
			</ShellSized>
		</>
	);
}

/** 0:07.4, 1:32.0 -- clips run a few seconds, so tenths are what make the
 * readout move; minutes never need padding. */
function formatClock(seconds: number): string {
	const tenths = Math.max(0, Math.floor(seconds * 10));
	const whole = Math.floor(tenths / 10);
	return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}.${tenths % 10}`;
}
