import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, KeyRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CardHeader } from "~/components/card-header.tsx";
import { Button } from "~/components/ui/button.tsx";
import { Input } from "~/components/ui/input.tsx";
import { unlockFn } from "~/lib/auth.ts";
import { SITE_NAME } from "~/lib/page-title.ts";

const MESSAGES = {
	invalid: "That password is not right.",
	throttled: "Too many attempts. Wait a few minutes and try again.",
	"default-password-remote":
		"This station still uses its default password, so it can only be unlocked from its own network. Run scripts/set_web_ui_password.sh on the Pi to set your own.",
} as const;

/**
 * The station's sign-in form, its own card under the Account masthead.
 * Gated pages redirect there rather than locking in place, and `onUnlock` is
 * how the page sends you on to the one you were headed for.
 */
export function UnlockGate({
	onUnlock,
}: {
	/** Runs once the session is live and the router has picked it up. */
	onUnlock?: () => void;
}) {
	const unlock = useServerFn(unlockFn);
	const router = useRouter();
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | undefined>();
	const [pending, setPending] = useState(false);
	const field = useRef<HTMLInputElement>(null);

	// Focused from an effect rather than with `autoFocus`, which React does not
	// apply when hydrating a server-rendered page -- the attribute alone worked
	// on a client-side transition to this screen and silently did nothing on a
	// full page load, which is the more common way to arrive here.
	useEffect(() => {
		field.current?.focus();
	}, []);

	async function onSubmit(event: React.FormEvent) {
		event.preventDefault();
		setPending(true);
		setError(undefined);
		try {
			const result = await unlock({ data: { password } });
			if (result.ok) {
				setPassword("");
				await router.invalidate();
				onUnlock?.();
				return;
			}
			setError(MESSAGES[result.reason]);
		} catch (cause) {
			console.error(cause);
			setError("The station could not be reached.");
		} finally {
			setPending(false);
		}
	}

	return (
		<form
			aria-labelledby="unlock-title"
			className="feature-card flex flex-col gap-4 rounded-md p-(--page-gap)"
			onSubmit={onSubmit}
		>
			<CardHeader as="h2" titleId="unlock-title" title="Sign in" />
			{/* The same two-column field grid the settings cards use, so the
					    field is the width of a Station or Storage field rather than a
					    password box stretched across the whole content column. */}
			<div className="grid gap-4 sm:grid-cols-2">
				{/* There is no username -- the station has one password -- but a
				    password manager files a login under one, and a form with only a
				    password left them unsure what they were saving. A fixed,
				    read-only name gives them that. It's the public site name, not
				    the station's own SITE_NAME: that one is only readable once
				    signed in, and renaming the station would orphan saved logins.
				    The server never sees it. */}
				<div className="space-y-1.5 sm:col-start-1">
					<label
						htmlFor="station-username"
						className="block font-medium text-sm"
					>
						Username
					</label>
					<Input
						id="station-username"
						name="username"
						type="text"
						autoComplete="username"
						value={SITE_NAME}
						readOnly
						className="bg-[var(--meadow)] text-muted-foreground hover:bg-[var(--meadow)] hover:text-muted-foreground"
					/>
				</div>
				{/* Laid out like the settings cards' `Field`, but with the hint
				    outside the label and referenced by `aria-describedby`. Nesting
				    it, as `Field` does, folds the whole hint into the field's
				    accessible name -- a screen reader would announce "Station
				    password Set on the Pi with scripts/set_web_ui_password.sh"
				    as the name of the box. */}
				<div className="space-y-1.5 sm:col-start-1">
					<label
						htmlFor="station-password"
						className="block font-medium text-sm"
					>
						Station password
					</label>
					<Input
						ref={field}
						id="station-password"
						aria-describedby="station-password-hint"
						name="password"
						type="password"
						autoComplete="current-password"
						value={password}
						onChange={(event) => setPassword(event.target.value)}
					/>
					<p
						id="station-password-hint"
						className="text-muted-foreground text-xs leading-relaxed"
					>
						Set on the Pi with{" "}
						<code className="tabular-data">scripts/set_web_ui_password.sh</code>
						.
					</p>
				</div>
			</div>

			{/* Button first, on the left under the fields it submits, with any
			    failure beside it. `sm`, like the timeline's jump-to-nearest link
			    button, rather than the site's default `xs`. */}
			<div className="flex flex-wrap items-center gap-3">
				<Button
					type="submit"
					size="sm"
					icon={KeyRound}
					disabled={pending || password.length === 0}
				>
					{pending ? "Unlocking…" : "Unlock"}
				</Button>
				<p
					aria-live="polite"
					role="alert"
					className="flex min-w-0 items-start gap-2 text-destructive text-xs"
				>
					{error ? (
						<>
							<AlertTriangle
								aria-hidden="true"
								className="mt-px size-3.5 shrink-0"
							/>
							<span>{error}</span>
						</>
					) : null}
				</p>
			</div>
		</form>
	);
}
