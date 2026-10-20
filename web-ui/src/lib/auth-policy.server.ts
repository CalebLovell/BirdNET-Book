import "@tanstack/react-start/server-only";

/** IPv4-mapped IPv6 (`::ffff:192.168.1.20`) is what a dual-stack listener
 *  reports for a plain IPv4 client, so it has to be unwrapped first. */
function normalize(ip: string) {
	const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
	return mapped ? mapped[1] : ip.toLowerCase();
}

export function isPrivateAddress(ip: string | undefined) {
	if (!ip) return false;
	const address = normalize(ip);

	if (address === "::1") return true;
	// fc00::/7 -- unique local addresses.
	if (/^f[cd][0-9a-f]{2}:/.test(address)) return true;

	const octets = address.split(".");
	if (octets.length !== 4) return false;
	if (!octets.every((part) => /^\d{1,3}$/.test(part))) return false;
	const values = octets.map(Number);
	if (values.some((value) => Number.isNaN(value) || value > 255)) return false;
	const [a, b] = values;

	if (a === 127 || a === 10) return true;
	if (a === 172 && b >= 16 && b <= 31) return true;
	if (a === 192 && b === 168) return true;
	return false;
}
