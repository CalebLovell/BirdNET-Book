import { createServerFn } from "@tanstack/react-start";

import { requireUnlocked } from "./auth.ts";
import { loadStationHealth } from "./health.server.ts";

// Gated because this is Settings-page data -- how full the recordings disk is.
// It is only ever rendered behind the unlock gate, but a server function is its
// own reachable endpoint, so the route check that hides the page does nothing
// to protect this.
export const getStationHealth = createServerFn({ method: "GET" })
	.middleware([requireUnlocked])
	.handler(() => loadStationHealth());
