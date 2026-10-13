// What the Settings page's Updates card knows about releases: what is
// installed, what GitHub last offered, and what the updater is doing. Read from
// the two files scripts/update_birdnet.sh keeps in ~/BirdNET-Pi-web. Pure, so
// the parsing can be tested without a station.

export type UpdateRunState =
	| "idle"
	| "checking"
	| "updating"
	| "failed"
	| "updated";

export type UpdateState = {
	/** False where the web UI wasn't installed by install_web_ui.sh -- a
	    development checkout -- so there is no updater to drive. */
	managed: boolean;
	installed: { version: string; signed: boolean; installedAt: string } | null;
	latest: { version: string; signed: boolean } | null;
	/** When GitHub was last asked, as an ISO timestamp. */
	checkedAt: string | null;
	state: UpdateRunState;
	/** The updater's own sentence about its last step, e.g. "Up to date." */
	message: string | null;
	/** The version being installed while `state` is "updating". */
	target: string | null;
};

export const UNMANAGED_UPDATE_STATE: UpdateState = {
	managed: false,
	installed: null,
	latest: null,
	checkedAt: null,
	state: "idle",
	message: null,
	target: null,
};

const RUN_STATES: readonly UpdateRunState[] = [
	"idle",
	"checking",
	"updating",
	"failed",
	"updated",
];

function parseJson(text: string | null): Record<string, unknown> | null {
	if (!text) return null;
	try {
		const value: unknown = JSON.parse(text);
		return value && typeof value === "object" && !Array.isArray(value)
			? (value as Record<string, unknown>)
			: null;
	} catch {
		return null;
	}
}

const text = (value: unknown) =>
	typeof value === "string" && value.length > 0 ? value : null;

/**
 * Both files are written by a shell script and renamed into place, so they are
 * whole -- but a station mid-install may not have them yet, and a hand-edited
 * one could hold anything. Whatever doesn't parse reads as unknown rather than
 * failing the page.
 */
export function parseUpdateState(
	installedText: string | null,
	statusText: string | null,
): UpdateState {
	const installed = parseJson(installedText);
	const status = parseJson(statusText);
	const latest =
		status?.latest && typeof status.latest === "object"
			? (status.latest as Record<string, unknown>)
			: null;
	const state = RUN_STATES.find((value) => value === status?.state) ?? "idle";
	return {
		managed: true,
		installed:
			installed && text(installed.version)
				? {
						version: text(installed.version) as string,
						signed: installed.signed === true,
						installedAt: text(installed.installedAt) ?? "",
					}
				: null,
		latest:
			latest && text(latest.version)
				? {
						version: text(latest.version) as string,
						signed: latest.signed === true,
					}
				: null,
		checkedAt: text(status?.checkedAt),
		state,
		message: text(status?.message),
		target: state === "updating" ? text(status?.target) : null,
	};
}

/** True while the updater is working, so the card can hold its buttons. */
export function updateBusy(state: UpdateState): boolean {
	return state.state === "checking" || state.state === "updating";
}

/** A newer release than the one installed, if GitHub has offered one. */
export function availableUpdate(state: UpdateState): string | null {
	if (!state.latest) return null;
	return state.latest.version === state.installed?.version
		? null
		: state.latest.version;
}
