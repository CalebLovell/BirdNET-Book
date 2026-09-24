import { Pause, Volume2 } from "lucide-react";

import { Button } from "~/components/ui/button.tsx";
import { usePlayableAudio } from "~/lib/use-playable-audio.ts";

/**
 * Plays a single detection's extracted clip. The label stays fixed while the
 * icon carries play/pause state, so the button holds its width mid-playback.
 * `iconOnly` drops the label for tight rows; the accessible name comes from
 * aria-label either way.
 */
export function RecordingButton({
	audioUrl,
	iconOnly = false,
	label = "Bird Call",
	speciesName,
	iconSize = "icon-xs",
	labelClassName,
	className = "",
}: {
	audioUrl: string | null;
	iconOnly?: boolean;
	/** The visible text, dropped entirely when `iconOnly`. */
	label?: string;
	/** Names the bird in the accessible label. Worth passing from a list, where
	 * a row of identical "Play bird call" buttons says nothing about which bird
	 * each one belongs to. */
	speciesName?: string;
	/** Tap targets in a dense table want more than the default. */
	iconSize?: "icon-xs" | "icon-lg";
	/** Lets a responsive row hide the label at some widths (e.g. under a
	 * container query) while the button, and its one <audio>, stay mounted. */
	labelClassName?: string;
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

	return (
		<>
			<Button
				variant="outline"
				size={iconOnly ? iconSize : "xs"}
				className={`shrink-0 ${className}`}
				icon={isPlaying ? Pause : Volume2}
				loading={isLoading}
				disabled={!audioUrl}
				onClick={togglePlay}
				aria-label={`${isPlaying ? "Pause" : "Play"} ${
					speciesName ? `${speciesName} recording` : "bird call"
				}`}
			>
				{iconOnly ? null : labelClassName ? (
					<span className={labelClassName}>{label}</span>
				) : (
					label
				)}
			</Button>
			{audioUrl && (
				<audio
					ref={audioRef}
					preload="none"
					onPlay={onPlay}
					onPause={onPause}
					onEnded={onEnded}
				>
					<track kind="captions" />
				</audio>
			)}
		</>
	);
}
