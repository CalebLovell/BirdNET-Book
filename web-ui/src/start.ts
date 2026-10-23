import { createMiddleware, createStart } from "@tanstack/react-start";

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

export const startInstance = createStart(() => ({
	requestMiddleware: [securityHeaders],
}));
