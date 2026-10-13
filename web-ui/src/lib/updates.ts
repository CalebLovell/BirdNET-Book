import { createServerFn } from "@tanstack/react-start";

import { requireUnlocked } from "./auth.ts";
import { loadUpdateState, startUpdater } from "./updates.server.ts";

// Gated like the rest of Settings: installing software is about as owner-only
// as an action gets, and each server function is its own reachable endpoint.
export const getUpdateState = createServerFn({ method: "GET" })
	.middleware([requireUnlocked])
	.handler(() => loadUpdateState());

export const checkForUpdatesFn = createServerFn({ method: "POST" })
	.middleware([requireUnlocked])
	.handler(() => startUpdater("check"));

export const installUpdateFn = createServerFn({ method: "POST" })
	.middleware([requireUnlocked])
	.handler(() => startUpdater("install"));
