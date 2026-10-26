import "@tanstack/react-start/server-only";

import { readUnlockStatus } from "~/lib/auth.server.ts";

/**
 * Whether this request may hear every clip, not just each species' best
 * recording. Clips can carry voices from around the station, so only a
 * signed-in visitor gets them; a missing or corrupt auth file reads as signed
 * out, same as every other gated call.
 */
export async function canHearEveryClip(): Promise<boolean> {
	try {
		return (await readUnlockStatus()).unlocked;
	} catch {
		return false;
	}
}
