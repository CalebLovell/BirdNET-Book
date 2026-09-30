import { Loader2, Pause, Play } from "lucide-react";

import { usePlayableAudio } from "~/lib/use-playable-audio.ts";

/**
 * The quiz's listening surface: one oversized play/pause control, since
 * replaying the clip is the whole activity on this page.
 *
 * `usePlayableAudio` caches the fetched blob for the life of the component, so
 * callers give this a `key` per question -- a remount is what swaps clips.
 */
export function ClipPlayer({ audioUrl }: { audioUrl: string }) {
	const {
		audioRef,
		isPlaying,
		isLoading,
		togglePlay,
		onPlay,
		onPause,
		onEnded,
	} = usePlayableAudio(audioUrl);

	return (
		<div className="flex flex-col items-center gap-4 max-[400px]:gap-2">
			<button
				type="button"
				onClick={togglePlay}
				disabled={isLoading}
				aria-label={isPlaying ? "Pause the recording" : "Play the recording"}
				className="flex size-24 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--meadow)] text-[var(--moss)] hover:border-[var(--hover-line)] hover:bg-[color-mix(in_oklab,var(--sage)_28%,var(--paper-raised))] disabled:opacity-60"
			>
				{isLoading ? (
					<Loader2 className="size-9 animate-spin" />
				) : isPlaying ? (
					<Pause className="size-9" />
				) : (
					<Play className="size-9 translate-x-0.5" />
				)}
			</button>

			<div className="text-muted-foreground text-xs">
				{isPlaying ? "Listening…" : "Play the recording"}
			</div>

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
