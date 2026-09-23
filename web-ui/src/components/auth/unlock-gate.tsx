import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, KeyRound, LockKeyhole } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "~/components/ui/button.tsx";
import { Input } from "~/components/ui/input.tsx";
import { unlockFn } from "~/lib/auth.ts";

const MESSAGES = {
	invalid: "That password is not right.",
	throttled: "Too many attempts. Wait a few minutes and try again.",
	"default-password-remote":
		"This station still uses its default password, so it can only be unlocked from its own network. Run scripts/set_web_ui_password.sh on the Pi to set your own.",
} as const;

/**
 * The one locked card, used by every gated page. Rendered in place of a page's
 * content rather than as a redirect or a modal: the URL stays put, so unlocking
 * turns the page into itself and a bookmark to /settings still lands there.
 *
 * It carries no page name of its own -- `LockedPage` puts the page's real
 * masthead above it, so this card only ever has to explain the lock. That also
 * means adding a gate to a new page needs nothing from this file.
 */
export function UnlockGate() {
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
		<section
			aria-labelledby="unlock-title"
			className="feature-card overflow-hidden rounded-md"
		>
			<header className="flex items-center gap-3 border-b p-4">
				<div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--icon-well)]">
					<LockKeyhole
						aria-hidden="true"
						className="size-4 text-[var(--moss)]"
					/>
				</div>
				<div className="min-w-0">
					{/* Deliberately not "Settings is locked": the page's own masthead
					    sits directly above this card and has already said which page
					    you are on. Naming it again read as a second, competing title. */}
					<h2
						id="unlock-title"
						className="display-title font-semibold text-lg leading-tight"
					>
						This page is locked
					</h2>
					<p className="mt-1 text-muted-foreground text-sm leading-relaxed">
						This part of the station is only for whoever runs it. Detections,
						species and stats stay open to everyone.
					</p>
				</div>
			</header>

			<form className="flex flex-col gap-4 p-4" onSubmit={onSubmit}>
				{/* The same two-column field grid the settings cards use, so the
					    field is the width of a Station or Storage field rather than a
					    password box stretched across the whole content column. */}
				<div className="grid gap-4 sm:grid-cols-2">
					{/* Laid out like the settings cards' `Field`, but with the hint
						    outside the label and referenced by `aria-describedby`. Nesting
						    it, as `Field` does, folds the whole hint into the field's
						    accessible name -- a screen reader would announce "Station
						    password Set on the Pi with scripts/set_web_ui_password.sh"
						    as the name of the box. */}
					<div className="space-y-1.5">
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
							<code className="tabular-data">
								scripts/set_web_ui_password.sh
							</code>
							.
						</p>
					</div>
				</div>

				<div className="flex flex-wrap items-center justify-between gap-3">
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
					<Button
						type="submit"
						icon={KeyRound}
						disabled={pending || password.length === 0}
					>
						{pending ? "Unlocking…" : "Unlock"}
					</Button>
				</div>
			</form>
		</section>
	);
}
