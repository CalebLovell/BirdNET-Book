import { type ReactNode, useEffect, useRef, useState } from "react";

import { fftMagnitudes } from "~/lib/fft.ts";
import { fetchAudioBlob } from "~/lib/use-playable-audio.ts";

const FFT_SIZE = 1024;
const HOP = 256;
// Bird calls live well below the Nyquist of a 48kHz clip, so the top of the
// spectrum is mostly empty. Capping the drawn range at 15kHz spends the card's
// height on the part of the signal that actually carries the call.
const MAX_HZ = 15000;
// Magnitudes are mapped from this dB window onto paper->moss. Anything quieter
// than the floor reads as blank paper; the ceiling is where the ink saturates.
const DB_FLOOR = -95;
const DB_CEIL = -25;

// Endpoints of the colour ramp, matching the detection-history heat map: near
// -white paper for silence, deep moss for the loudest bins.
const PAPER: [number, number, number] = [251, 253, 246];
const MOSS: [number, number, number] = [32, 59, 20];

type RenderState = "loading" | "ready" | "empty";

/**
 * A frequency-vs-time spectrogram of a single clip, drawn client-side from the
 * decoded audio -- no server-rendered PNGs and no audio toolchain on the host.
 * The canvas is sized to the STFT grid (frames x bins) and stretched to fit by
 * CSS, so the browser's image smoothing does the interpolation for free.
 */
export function Spectrogram({
	audioUrl,
	className,
	onDecoded,
	children,
}: {
	audioUrl: string;
	className?: string;
	/** Called with the clip's length in seconds once it's decoded. */
	onDecoded?: (seconds: number) => void;
	/** Laid over the whole plot once it's drawn -- a player's playhead. */
	children?: ReactNode;
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [state, setState] = useState<RenderState>("loading");
	const onDecodedRef = useRef(onDecoded);
	onDecodedRef.current = onDecoded;

	useEffect(() => {
		let cancelled = false;
		setState("loading");

		async function draw() {
			const canvas = canvasRef.current;
			if (!canvas) return;

			const AudioCtx =
				window.AudioContext ??
				(window as unknown as { webkitAudioContext?: typeof AudioContext })
					.webkitAudioContext;
			if (!AudioCtx) {
				setState("empty");
				return;
			}

			const context = new AudioCtx();
			try {
				// The player fetches the same clip; the shared cache makes it one
				// request between them.
				const blob = await fetchAudioBlob(audioUrl);
				const buffer = await context.decodeAudioData(await blob.arrayBuffer());
				if (cancelled) return;
				paint(canvas, buffer);
				setState("ready");
				onDecodedRef.current?.(buffer.duration);
			} catch {
				if (!cancelled) setState("empty");
			} finally {
				void context.close();
			}
		}

		void draw();
		return () => {
			cancelled = true;
		};
	}, [audioUrl]);

	return (
		<div
			className={`relative overflow-hidden rounded-md border border-[var(--line)] bg-[var(--paper)] ${className ?? ""}`}
		>
			{/* Absolutely positioned so the canvas' own intrinsic size (frames x
			    bins) never contributes to layout height -- otherwise `w-full`
			    stretches its width and the aspect ratio balloons the card. This
			    lets the card take its height from its neighbour instead. */}
			<canvas
				ref={canvasRef}
				role="img"
				aria-label="Spectrogram of the call"
				className="absolute inset-0 block h-full w-full"
				style={{
					opacity: state === "ready" ? 1 : 0,
					transition: "opacity 200ms ease",
				}}
			/>
			{children && state === "ready" ? (
				<div className="pointer-events-none absolute inset-0">{children}</div>
			) : null}
			{state !== "ready" ? (
				<div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-muted-foreground text-xs">
					{state === "loading"
						? "Rendering spectrogram…"
						: "Spectrogram unavailable"}
				</div>
			) : null}
		</div>
	);
}

function paint(canvas: HTMLCanvasElement, buffer: AudioBuffer): void {
	const samples = buffer.getChannelData(0);
	const sampleRate = buffer.sampleRate;
	const frameCount = Math.max(
		1,
		Math.floor((samples.length - FFT_SIZE) / HOP) + 1,
	);
	const nyquistBin = FFT_SIZE / 2;
	const maxBin = Math.min(
		nyquistBin,
		Math.ceil((MAX_HZ / (sampleRate / 2)) * nyquistBin),
	);

	// Precompute a Hann window so frame edges don't smear across the spectrum.
	const window = new Float32Array(FFT_SIZE);
	for (let i = 0; i < FFT_SIZE; i += 1) {
		window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1));
	}

	canvas.width = frameCount;
	canvas.height = maxBin;
	const ctx = canvas.getContext("2d");
	if (!ctx) return;
	const image = ctx.createImageData(frameCount, maxBin);

	const real = new Float32Array(FFT_SIZE);
	const imag = new Float32Array(FFT_SIZE);

	for (let frame = 0; frame < frameCount; frame += 1) {
		const offset = frame * HOP;
		for (let i = 0; i < FFT_SIZE; i += 1) {
			real[i] = (samples[offset + i] ?? 0) * window[i];
			imag[i] = 0;
		}
		fftMagnitudes(real, imag);

		for (let bin = 0; bin < maxBin; bin += 1) {
			const mag = Math.hypot(real[bin], imag[bin]) / FFT_SIZE;
			const db = 20 * Math.log10(mag + 1e-9);
			const level = clamp01((db - DB_FLOOR) / (DB_CEIL - DB_FLOOR));
			// Row 0 is the top of the canvas, so low frequencies go to the bottom.
			const y = maxBin - 1 - bin;
			const pixel = (y * frameCount + frame) * 4;
			image.data[pixel] = lerp(PAPER[0], MOSS[0], level);
			image.data[pixel + 1] = lerp(PAPER[1], MOSS[1], level);
			image.data[pixel + 2] = lerp(PAPER[2], MOSS[2], level);
			image.data[pixel + 3] = 255;
		}
	}

	ctx.putImageData(image, 0, 0);
}

function clamp01(value: number): number {
	return value < 0 ? 0 : value > 1 ? 1 : value;
}

function lerp(from: number, to: number, t: number): number {
	return Math.round(from + (to - from) * t);
}
