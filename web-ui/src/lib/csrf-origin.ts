/**
 * Whether a browser-reported origin (an `Origin` header, or a `Referer`'s
 * origin) is this station's own, for the CSRF check on server functions.
 *
 * Only consulted when the browser sent no `Sec-Fetch-Site`, which browsers
 * send to HTTPS pages but not to a plain-HTTP LAN address -- so on the LAN this
 * is the check that does the work, and there the request URL (built from the
 * `Host` header) already carries the origin the browser saw.
 *
 * Behind a proxy that terminates TLS, the app sees `http://` while the browser
 * says `https://`, and a proxy may rewrite `Host` too. When the deployment
 * vouches for its proxy (`WEB_UI_TRUSTED_PROXY`), the origin the proxy says it
 * served is accepted as well. Untrusted, those headers are ignored: anyone can
 * send them.
 */
export function isStationOrigin(
	origin: string,
	request: Request,
	trustedProxy: boolean,
) {
	const url = new URL(request.url);
	if (origin === url.origin) return true;
	if (!trustedProxy) return false;
	const forwarded = (name: string) =>
		request.headers.get(name)?.split(",")[0]?.trim() || undefined;
	const proto = forwarded("x-forwarded-proto") ?? url.protocol.slice(0, -1);
	const host = forwarded("x-forwarded-host") ?? url.host;
	return origin === `${proto}://${host}`;
}
