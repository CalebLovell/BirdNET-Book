import { useEffect, useRef, useState } from "react";

// The browser's native <audio src> loading doesn't reliably reach this app's
// dynamic audio route (some Sec-Fetch-Dest-specific behavior in this dev
// stack), but a plain fetch() always does -- so fetch it ourselves and play
// from a local blob instead.
//
// The fetch is shared: a spectrogram and its player ask for the same clip, and
// a handful of recent clips stay cached so replaying one doesn't refetch it.
const CACHE_SIZE = 12;
const clipCache = new Map<string, Promise<Blob>>();

export function fetchAudioBlob(audioUrl: string): Promise<Blob> {
	const cached = clipCache.get(audioUrl);
	if (cached) {
		// Re-insert so the Map's order tracks recency.
		clipCache.delete(audioUrl);
		clipCache.set(audioUrl, cached);
		return cached;
	}
	const pending = fetch(audioUrl).then((response) => {
		if (!response.ok) throw new Error("Failed to fetch audio");
		return response.blob();
	});
	// A failed fetch isn't kept, so the next attempt tries again.
	pending.catch(() => clipCache.delete(audioUrl));
	clipCache.set(audioUrl, pending);
	while (clipCache.size > CACHE_SIZE) {
		const oldest = clipCache.keys().next().value;
		if (oldest === undefined) break;
		clipCache.delete(oldest);
	}
	return pending;
}

// One clip at a time across the whole app: starting a call pauses whichever
// one was already playing, rather than letting two rows talk over each other.
let playingClip: HTMLAudioElement | null = null;

/** Call as `audio` starts playing: pauses whichever clip had the floor. */
export function claimPlayback(audio: HTMLAudioElement | null) {
	if (playingClip && playingClip !== audio) playingClip.pause();
	playingClip = audio;
}

export function usePlayableAudio(audioUrl: string | null) {
	const audioRef = useRef<HTMLAudioElement>(null);
	const objectUrlRef = useRef<string | null>(null);
	const loadRef = useRef<Promise<boolean> | null>(null);
	const [isPlaying, setIsPlaying] = useState(false);
	const [isLoading, setIsLoading] = useState(false);

	useEffect(() => {
		return () => {
			if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
			if (playingClip === audioRef.current) playingClip = null;
		};
	}, []);

	/** Fetches the clip and hands it to the <audio> once; true when it's ready. */
	function load(): Promise<boolean> {
		const audio = audioRef.current;
		if (!audio || !audioUrl) return Promise.resolve(false);
		if (loadRef.current) return loadRef.current;

		setIsLoading(true);
		loadRef.current = fetchAudioBlob(audioUrl)
			.then((blob) => {
				objectUrlRef.current = URL.createObjectURL(blob);
				audio.src = objectUrlRef.current;
				return true;
			})
			.catch(() => {
				loadRef.current = null;
				return false;
			})
			.finally(() => setIsLoading(false));
		return loadRef.current;
	}

	async function togglePlay() {
		const audio = audioRef.current;
		if (!audio || !audioUrl) return;

		if (isPlaying) {
			audio.pause();
			return;
		}
		if (!(await load())) return;
		audio.play().catch(() => setIsPlaying(false));
	}

	return {
		audioRef,
		isPlaying,
		isLoading,
		togglePlay,
		onPlay: () => {
			claimPlayback(audioRef.current);
			setIsPlaying(true);
		},
		onPause: () => setIsPlaying(false),
		onEnded: () => setIsPlaying(false),
	};
}
