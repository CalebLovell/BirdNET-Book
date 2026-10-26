import { isNotFound, isRedirect } from "@tanstack/react-router";
import {
	createCsrfMiddleware,
	createMiddleware,
	createStart,
} from "@tanstack/react-start";

import { isUnauthorizedError } from "~/lib/auth.ts";
import { isStationOrigin } from "~/lib/csrf-origin.ts";

/**
 * Headers every response carries, for a station that may face the internet.
 *
 * - No framing: another site could otherwise load Settings invisibly inside
 *   its own page and steer a signed-in owner's clicks into it.
 * - `nosniff`: a browser never second-guesses a recording's or a page's type.
 * - Referrers stop at this site's origin, so a link out doesn't carry the path.
 * - HSTS only over HTTPS: sent over plain HTTP on the LAN it would be ignored,
 *   and once a public address has it, browsers refuse to fall back to HTTP.
 */
const securityHeaders = createMiddleware({ type: "request" }).server(
	async ({ request, next }) => {
		const result = await next();
		const headers = new Headers(result.response.headers);
		headers.set("X-Frame-Options", "DENY");
		headers.set("Content-Security-Policy", "frame-ancestors 'none'");
		headers.set("X-Content-Type-Options", "nosniff");
		headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
		const https =
			request.headers.get("x-forwarded-proto") === "https" ||
			new URL(request.url).protocol === "https:";
		if (https) {
			headers.set("Strict-Transport-Security", "max-age=31536000");
		}
		// A copy rather than setting in place: some responses (redirects among
		// them) arrive with immutable headers. The body streams through as is.
		return {
			...result,
			response: new Response(result.response.body, {
				status: result.response.status,
				statusText: result.response.statusText,
				headers,
			}),
		};
	},
);

/**
 * Server functions refuse calls made from another site's page. The unlock
 * cookie is `SameSite=Lax`, which already keeps it off cross-site POSTs, but
 * not off GETs from a link, nor off requests from a sibling subdomain (same
 * site, different origin) -- and a server function is an RPC endpoint, not a
 * page anyone should reach from elsewhere.
 *
 * Browsers that send `Sec-Fetch-Site` (every current one, over HTTPS) must say
 * `same-origin`. Over plain HTTP on the LAN they don't send it, so the
 * `Origin` (or `Referer`) must match the station's own -- see
 * `isStationOrigin` for how that holds up behind a proxy. A request with none
 * of the three is refused: no browser sends a server-function call that way.
 */
const csrf = createCsrfMiddleware({
	filter: (ctx) => ctx.handlerType === "serverFn",
	origin: (origin, { request }) =>
		isStationOrigin(origin, request, Boolean(process.env.WEB_UI_TRUSTED_PROXY)),
});

/**
 * The service log is the only place a failure's cause is kept. The page that
 * hit it shows one plain card and names no cause (see `RouteError`), and the
 * framework logs nothing on its own, so without this the cause is lost. The
 * gate's refusal and the router's redirects are expected, not failures.
 */
const logFailures = createMiddleware({ type: "function" }).server(
	async ({ next }) => {
		try {
			return await next();
		} catch (error) {
			if (
				!isUnauthorizedError(error) &&
				!isRedirect(error) &&
				!isNotFound(error)
			) {
				console.error("[server] a server function failed:", error);
			}
			throw error;
		}
	},
);

export const startInstance = createStart(() => ({
	requestMiddleware: [securityHeaders, csrf],
	functionMiddleware: [logFailures],
}));
