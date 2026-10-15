/**
 * The spectrogram player's states, and every way between them. Pure, so each
 * path can be tested without an <audio> element; `useClipPlayer` keeps the
 * element in line with whatever state this says it's in.
 *
 *   idle ──toggle──▶ loading ──loaded──▶ playing ◀──toggle──▶ paused
 *    │                 │  ▲                 │  ▲                  ▲
 *    │             failed │                 │  └──scrubEnd(resume)│
 *    │                 ▼  │ toggle          ├──scrubStart──▶ scrubbing
 *    │               error┘                 └──mediaEnded──▶ ended
 *    └──scrubStart──▶ loading (then scrubbing)
 *
 * Scrubbing pauses the audio for the length of the drag and picks up where it
 * left off on release, so a drag never stutters audio through every point it
 * passes. The element can also stop on its own -- another clip starting
 * elsewhere pauses this one -- and the `media*` events bring the machine along.
 */

export type ClipStatus =
	| "idle"
	| "loading"
	| "paused"
	| "playing"
	| "scrubbing"
	| "ended"
	| "error";

export type ClipState = {
	status: ClipStatus;
	/** While loading: where to land once the clip is ready. */
	afterLoad: "play" | "pause" | "scrub";
	/** While scrubbing: whether to play again on release. */
	resumeAfterScrub: boolean;
};

export type ClipEvent =
	| { type: "toggle" }
	| { type: "loaded" }
	| { type: "loadFailed" }
	| { type: "scrubStart" }
	| { type: "scrubEnd" }
	| { type: "mediaPlaying" }
	| { type: "mediaPaused" }
	| { type: "mediaEnded" };

export const INITIAL_CLIP_STATE: ClipState = {
	status: "idle",
	afterLoad: "pause",
	resumeAfterScrub: false,
};

export function clipTransition(state: ClipState, event: ClipEvent): ClipState {
	const to = (
		status: ClipStatus,
		patch: Partial<ClipState> = {},
	): ClipState => ({
		...state,
		status,
		...patch,
	});

	switch (state.status) {
		case "idle":
		case "error":
			if (event.type === "toggle") return to("loading", { afterLoad: "play" });
			if (event.type === "scrubStart")
				return to("loading", { afterLoad: "scrub" });
			return state;

		case "loading":
			switch (event.type) {
				case "toggle":
					// A second press before the clip arrives takes the first back.
					return to("loading", {
						afterLoad: state.afterLoad === "play" ? "pause" : "play",
					});
				case "scrubStart":
					return to("loading", { afterLoad: "scrub" });
				case "scrubEnd":
					return state.afterLoad === "scrub"
						? to("loading", { afterLoad: "pause" })
						: state;
				case "loaded":
					if (state.afterLoad === "play") return to("playing");
					if (state.afterLoad === "scrub")
						return to("scrubbing", { resumeAfterScrub: false });
					return to("paused");
				case "loadFailed":
					return to("error");
				default:
					return state;
			}

		case "playing":
			switch (event.type) {
				case "toggle":
				case "mediaPaused":
					return to("paused");
				case "scrubStart":
					return to("scrubbing", { resumeAfterScrub: true });
				case "mediaEnded":
					return to("ended");
				default:
					return state;
			}

		case "paused":
		case "ended":
			switch (event.type) {
				case "toggle":
				case "mediaPlaying":
					return to("playing");
				case "scrubStart":
					return to("scrubbing", { resumeAfterScrub: false });
				default:
					return state;
			}

		case "scrubbing":
			// The element pauses and ends under a drag as a matter of course;
			// only letting go decides what happens next.
			if (event.type === "scrubEnd")
				return to(state.resumeAfterScrub ? "playing" : "paused");
			return state;
	}
}

/** Whether the <audio> element should be making sound in this state. */
export function clipShouldPlay(state: ClipState): boolean {
	return state.status === "playing";
}

/** Whether the clip is (or is on its way to being) in the element. */
export function clipNeedsLoad(state: ClipState): boolean {
	return state.status === "loading";
}

/** Whether a playhead belongs on the plot. */
export function clipShowsPlayhead(state: ClipState): boolean {
	return (
		state.status === "playing" ||
		state.status === "paused" ||
		state.status === "scrubbing" ||
		(state.status === "loading" && state.afterLoad === "scrub")
	);
}
