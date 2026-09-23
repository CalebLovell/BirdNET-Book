import { AudioWaveform, LockKeyhole, Pause, Play } from "lucide-react";
import { useEffect, useRef } from "react";

import { Button } from "~/components/ui/button.tsx";
import { Toggle } from "~/components/ui/toggle.tsx";
import { type Rgb, rampColor } from "~/lib/spectrogram.ts";
import { useLiveAudio } from "~/lib/use-live-audio.ts";

const STREAM_URL = "/api/live-stream";

/**
 * Live listening for the station's feed. Gated: a locked station sees the
 * prompt below and never opens the (also-gated) stream. Unlocked, it plays the
 * proxied Icecast MP3 through a WebAudio graph and paints a scrolling
 * spectrogram in the site palette.
 */
export function LiveAudioCard({ unlocked }: { unlocked: boolean }) {
	if (!unlocked) return <LockedPanel />;
	return <PlayerPanel />;
}

function CardShell({ children }: { children: React.ReactNode }) {
	return (
		<section aria-label="Live audio" className="feature-card rounded-md p-4">
			<div className="island-kicker">Listen</div>
			<div className="mt-4">{children}</div>
		</section>
	);
}

function LockedPanel() {
	return (
		<CardShell>
			<div className="flex items-center gap-3">
				<div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--icon-well)]">
					<LockKeyhole
						aria-hidden="true"
						className="size-4 text-[var(--moss)]"
					/>
				</div>
				<p className="text-muted-foreground text-sm">
					Unlock the station to listen to the live feed.
				</p>
			</div>
		</CardShell>
	);
}

function PlayerPanel() {
	const live = useLiveAudio(STREAM_URL);
	const isPlaying = live.state === "playing";
	const isOffline = live.state === "offline";

	return (
		<CardShell>
			<Spectrogram analyser={live.analyser} active={isPlaying} />

			{isOffline ? (
				<p className="mt-3 text-destructive text-sm">
					The live stream is offline. Check that the audio service is running,
					then try again.
				</p>
			) : null}

			<div className="mt-4 flex flex-wrap items-center gap-4">
				<Button
					type="button"
					icon={isPlaying ? Pause : Play}
					onClick={() => (isPlaying ? live.pause() : live.play())}
				>
					{live.state === "connecting"
						? "Connecting…"
						: isPlaying
							? "Pause"
							: isOffline
								? "Retry"
								: "Listen live"}
				</Button>

				<label className="flex items-center gap-2 text-sm">
					<span className="text-muted-foreground">Gain</span>
					<input
						type="range"
						min={100}
						max={400}
						step={5}
						value={live.gainPercent}
						onChange={(e) => live.setGainPercent(Number(e.target.value))}
						className="accent-[var(--moss)]"
						aria-label="Gain"
					/>
					<span className="tabular-data w-10 text-right">
						{live.gainPercent}%
					</span>
				</label>

				<Toggle
					variant="outline"
					size="sm"
					pressed={live.compression}
					onPressedChange={live.setCompression}
					aria-label="Compression"
				>
					<AudioWaveform aria-hidden="true" />
					Compression
				</Toggle>
			</div>

			{/* The graph reads samples from this element; it carries no controls of
			    its own. src is set in the hook on first play so a locked/idle
			    visitor never opens the proxy connection. */}
			{/* biome-ignore lint/a11y/useMediaCaption: a live station feed has no captions track */}
			<audio
				ref={live.audioRef}
				onPlaying={live.onPlaying}
				onPause={live.onPause}
				onError={live.onError}
				onWaiting={live.onWaiting}
				crossOrigin="anonymous"
			/>
		</CardShell>
	);
}

const SPECTROGRAM_HEIGHT = 160;

/** Scrolling waterfall: one new column per frame at the right edge, prior image
    shifted left. Colors come from the live tokens so it tracks the theme. */
function Spectrogram({
	analyser,
	active,
}: {
	analyser: AnalyserNode | null;
	active: boolean;
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas || !analyser || !active) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const styles = getComputedStyle(canvas);
		const stops: Rgb[] = [
			readRgb(styles.getPropertyValue("--sage"), [197, 204, 182]),
			readRgb(styles.getPropertyValue("--moss"), [32, 59, 20]),
			readRgb(styles.getPropertyValue("--clay"), [156, 74, 52]),
		];
		const background = readRgb(
			styles.getPropertyValue("--paper"),
			[251, 253, 246],
		);

		const bins = analyser.frequencyBinCount;
		const data = new Uint8Array(bins);
		let raf = 0;

		const draw = () => {
			raf = requestAnimationFrame(draw);
			const w = canvas.width;
			const h = canvas.height;
			// Shift everything one column left, then draw the new column at the edge.
			ctx.drawImage(canvas, -1, 0);
			analyser.getByteFrequencyData(data);
			for (let y = 0; y < h; y++) {
				// Low frequencies at the bottom, like the reference spectrogram.
				const bin = Math.floor(((h - 1 - y) / h) * bins);
				const magnitude = data[bin] / 255;
				const [r, g, b] =
					magnitude <= 0.02 ? background : rampColor(stops, magnitude);
				ctx.fillStyle = `rgb(${r},${g},${b})`;
				ctx.fillRect(w - 1, y, 1, 1);
			}
		};
		raf = requestAnimationFrame(draw);
		return () => cancelAnimationFrame(raf);
	}, [analyser, active]);

	return (
		// biome-ignore lint/a11y/noAriaHiddenOnFocusable: the spectrogram is a purely decorative live visualization with no accessible content
		<canvas
			ref={canvasRef}
			width={640}
			height={SPECTROGRAM_HEIGHT}
			className="h-40 w-full rounded-md border border-[var(--line)] bg-[var(--paper)]"
			aria-hidden="true"
		/>
	);
}

/** Parses `#rrggbb` (the raw form our palette tokens use) to an Rgb triple. */
function readRgb(value: string, fallback: Rgb): Rgb {
	const hex = value.trim().replace("#", "");
	if (hex.length !== 6) return fallback;
	const n = Number.parseInt(hex, 16);
	if (Number.isNaN(n)) return fallback;
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
