import { type ParsedLocation, redirect } from "@tanstack/react-router";

/**
 * A gated route's `beforeLoad`: a locked visitor goes to /account to sign in,
 * carrying where they were headed so signing in takes them on there. Settings,
 * Review and Control share it, so every gate behaves the same way.
 *
 * The gated server functions refuse on their own as well -- this only decides
 * what a visitor sees, never what they can reach.
 */
export function requireUnlocked(
	auth: { unlocked: boolean },
	location: ParsedLocation,
): void {
	if (auth.unlocked) return;
	throw redirect({ to: "/account", search: { next: location.href } });
}

/**
 * `next` as /account may act on it: a path on this site, or nothing. A full
 * URL, or a protocol-relative `//host` one, would turn the sign-in form into a
 * way to send someone elsewhere straight after they typed the password.
 */
export function safeNext(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	if (!value.startsWith("/") || value.startsWith("//")) return undefined;
	if (value.startsWith("/\\")) return undefined;
	return value;
}
