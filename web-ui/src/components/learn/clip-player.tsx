import { Loader2, Pause, Play } from "lucide-react";
import { type RefObject, useEffect, useState } from "react";

import { Spectrogram } from "~/components/spectrogram.tsx";
import { usePlayableAudio } from "~/lib/use-playable-audio.ts";

/**
 * The quiz's listening surface: the clip's spectrogram with the play/pause
 * control sat in the middle of it. The spectrogram is drawn before the first
 * play on purpose -- the shape of a call is a fair hint -- and a playhead
 * tracks the audio once it's running. While playing, the button fades back so
 * the playhead can be followed through it.
 *
 * `usePlayableAudio` caches the fetched blob for the life of the component, so
 * callers give this a `key` per question -- a remount is what swaps clips.
 */
export function ClipPlayer({
	audioUrl,
	className = "h-36 max-[400px]:h-28",
}: {
	audioUrl: string;
	/** Sizes the spectrogram; the quiz's height is the default. */
	className?: string;
}) {
	const {
		audioRef,
		isPlaying,
		isLoading,
		togglePlay,
		onPlay,
		onPause,
		onEnded,
	} = usePlayableAudio(audioUrl);
	const progress = usePlaybackProgress(audioRef, isPlaying);

	return (
		<div>
			<Spectrogram
				audioUrl={audioUrl}
				progress={progress}
				className={className}
			>
				<button
					type="button"
					onClick={togglePlay}
					disabled={isLoading}
					aria-label={isPlaying ? "Pause the recording" : "Play the recording"}
					className={`flex size-16 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--paper-raised)] text-[var(--moss)] transition-opacity duration-[180ms] hover:border-[var(--hover-line)] hover:bg-[var(--meadow)] hover:opacity-100 disabled:opacity-60 max-[400px]:size-12 ${isPlaying ? "opacity-40" : ""}`}
				>
					{isLoading ? (
						<Loader2 className="size-7 animate-spin max-[400px]:size-6" />
					) : isPlaying ? (
						<Pause className="size-7 max-[400px]:size-6" />
					) : (
						<Play className="size-7 translate-x-0.5 max-[400px]:size-6" />
					)}
				</button>
			</Spectrogram>

			<audio
				ref={audioRef}
				preload="none"
				onPlay={onPlay}
				onPause={onPause}
				onEnded={onEnded}
			>
				<track kind="captions" />
			</audio>
		</div>
	);
}

/**
 * Where playback is, 0-1, or null before the clip has started. Sampled every
 * frame while playing -- `timeupdate` only fires a few times a second, which
 * makes a playhead stutter across the spectrogram -- but `timeupdate` is kept
 * as a floor for tabs where animation frames are paused.
 */
function usePlaybackProgress(
	audioRef: RefObject<HTMLAudioElement | null>,
	isPlaying: boolean,
): number | null {
	const [progress, setProgress] = useState<number | null>(null);

	useEffect(() => {
		const audio = audioRef.current;
		if (!audio) return;

		const sample = () => {
			if (audio.duration > 0) setProgress(audio.currentTime / audio.duration);
		};
		if (!isPlaying) {
			// Paused mid-clip keeps its place; a clip that ran out clears the line.
			if (audio.ended) setProgress(null);
			return;
		}

		sample();
		audio.addEventListener("timeupdate", sample);
		let frame = requestAnimationFrame(function tick() {
			sample();
			frame = requestAnimationFrame(tick);
		});
		return () => {
			audio.removeEventListener("timeupdate", sample);
			cancelAnimationFrame(frame);
		};
	}, [audioRef, isPlaying]);

	return progress;
}
