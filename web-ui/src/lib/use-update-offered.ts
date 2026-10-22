import { useEffect, useState } from "react";
import { getUpdateState } from "./updates.ts";
import { availableUpdate } from "./updates-data.ts";

// A minute: the files only change nightly or when someone presses Check now,
// and reading them is two small file reads, so this stays cheap while still
// clearing the dot soon after an install.
const INTERVAL_MS = 60_000;

/*
 * One poll shared by every copy of the nav (the desktop sidebar, the drawer and
 * the menu bar's button) rather than one each.
 */
let offered: string | null = null;
let timer: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<(version: string | null) => void>();

async function refresh() {
	try {
		const state = await getUpdateState();
		offered = state.managed ? availableUpdate(state) : null;
	} catch {
		// Locked out or the server is restarting mid-update: keep what we had
		// and try again on the next tick.
		return;
	}
	for (const listener of listeners) listener(offered);
}

/**
 * The newer release the station has seen and not installed, or null. Only
 * asked for while `enabled` -- the updater's state is owner-only, so a visitor's
 * nav never polls for it.
 */
export function useUpdateOffered(enabled: boolean): string | null {
	const [version, setVersion] = useState<string | null>(null);
	useEffect(() => {
		if (!enabled) return;
		listeners.add(setVersion);
		setVersion(offered);
		if (listeners.size === 1) {
			void refresh();
			timer = setInterval(refresh, INTERVAL_MS);
		}
		return () => {
			listeners.delete(setVersion);
			if (listeners.size === 0) clearInterval(timer);
		};
	}, [enabled]);
	return enabled ? version : null;
}
