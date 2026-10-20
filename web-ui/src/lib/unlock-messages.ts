import type { UnlockResult } from "./auth.server.ts";

type FailureReason = Extract<UnlockResult, { ok: false }>["reason"];

/** What the sign-in form says for each way the station can turn it down. */
export const UNLOCK_MESSAGES: Record<FailureReason, string> = {
	invalid: "That password is not right.",
	throttled: "Too many attempts. Wait a few minutes and try again.",
	"not-set-up":
		"This station has no password yet. Set one on the Pi with scripts/set_web_ui_password.sh.",
	misconfigured:
		"The station can't read its password file, so nobody can sign in. Its log says why.",
};

export const UNREACHABLE_MESSAGE =
	"The station could not be reached. Check that it's on and that you're connected.";

export const STATION_ERROR_MESSAGE =
	"Something went wrong on the station. Try again; if it keeps happening, its log says why.";

/**
 * For a sign-in request that threw instead of answering. `fetch` rejects with a
 * TypeError only when no response arrived at all; anything else is the station
 * answering with an error, and calling that "unreachable" sends the owner off
 * checking their Wi-Fi for a problem on the Pi.
 */
export function messageForThrown(cause: unknown) {
	return cause instanceof TypeError
		? UNREACHABLE_MESSAGE
		: STATION_ERROR_MESSAGE;
}
