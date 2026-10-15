import { Pause, Volume2 } from "lucide-react";

import { Button } from "~/components/ui/button.tsx";
import { usePlayableAudio } from "~/lib/use-playable-audio.ts";

/** The one word on every compact play control in the app. */
export const PLAY_LABEL = "Listen";

/**
 * The app's one compact play control: wherever a recording only has room for
 * a button (a row, a card's footer, a hero), it is this -- a moss-filled
 * button, like "Listen live", with the speaker glyph and `PLAY_LABEL`. The
 * label stays fixed while the icon carries play/pause state, so the button
 * holds its width mid-playback.
 * `iconOnly` drops the label for tight rows; the accessible name comes from
 * aria-label either way. Where there's room for a spectrogram, use
 * `SpectrogramPlayer` instead.
 */
export function RecordingButton({
	audioUrl,
	iconOnly = false,
	speciesName,
	iconSize = "icon-xs",
	labelClassName,
	className = "",
}: {
	audioUrl: string | null;
	iconOnly?: boolean;
	/** Names the bird in the accessible label, so a list of these buttons says
	 * which bird each one plays. Pass it wherever the name is known. */
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
				variant="default"
				size={iconOnly ? iconSize : "xs"}
				className={`shrink-0 ${className}`}
				icon={isPlaying ? Pause : Volume2}
				loading={isLoading}
				disabled={!audioUrl}
				onClick={togglePlay}
				aria-label={recordingActionLabel(isPlaying, speciesName)}
			>
				{iconOnly ? null : labelClassName ? (
					<span className={labelClassName}>{PLAY_LABEL}</span>
				) : (
					PLAY_LABEL
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

/** "Play Northern Cardinal call" / "Pause the call": every play control's
 * accessible name, compact or spectrogram. */
export function recordingActionLabel(
	isPlaying: boolean,
	speciesName?: string,
): string {
	return `${isPlaying ? "Pause" : "Play"} ${
		speciesName ? `${speciesName} call` : "the call"
	}`;
}
