import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, KeyRound, Lock, LogOut } from "lucide-react";
import { useState } from "react";

import { Button } from "~/components/ui/button.tsx";
import { ConfirmDialog } from "~/components/ui/confirm-dialog.tsx";
import { lockFn, signOutAllDevicesFn } from "~/lib/auth.ts";

/**
 * Access sits in the settings flow as one of the cards rather than above the
 * masthead: it configures who may open this page at all, which is a peer of the
 * other cards, not a banner over them.
 *
 * It borrows `SettingsCard`'s chrome -- tinted left edge, disc-and-title header,
 * message beside the controls -- without borrowing the form. Nothing here is a
 * pending edit waiting on Save; both controls act the moment they are confirmed.
 */
export function SessionCard({
	isDefaultPassword,
}: {
	isDefaultPassword: boolean;
}) {
	const lock = useServerFn(lockFn);
	const signOutAll = useServerFn(signOutAllDevicesFn);
	const router = useRouter();
	const [lockPending, setLockPending] = useState(false);
	const [signOutPending, setSignOutPending] = useState(false);
	const [confirming, setConfirming] = useState(false);
	const [error, setError] = useState<string | undefined>();

	async function onLock() {
		setError(undefined);
		setLockPending(true);
		try {
			await lock({ data: undefined });
			await router.invalidate();
		} catch (cause) {
			console.error(cause);
			setError("This browser could not be locked.");
		} finally {
			setLockPending(false);
		}
	}

	async function onSignOutAll() {
		setError(undefined);
		setSignOutPending(true);
		try {
			await signOutAll({ data: undefined });
			await router.invalidate();
		} catch (cause) {
			console.error(cause);
			setError("The other devices could not be signed out.");
		} finally {
			setSignOutPending(false);
		}
	}

	return (
		<section
			aria-labelledby="settings-access"
			className="feature-card overflow-hidden rounded-md"
		>
			<header className="flex items-center gap-3 border-b p-4">
				<div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--icon-well)]">
					<KeyRound aria-hidden="true" className="size-4 text-[var(--moss)]" />
				</div>
				<div className="min-w-0">
					<h2
						id="settings-access"
						className="display-title font-semibold text-lg leading-tight"
					>
						Access
					</h2>
					<p className="mt-1 text-muted-foreground text-sm leading-relaxed">
						Who can open Settings, Species control and Review. Everything else
						on this station stays public.
					</p>
				</div>
			</header>

			<div className="flex flex-1 flex-col gap-4 p-4">
				{isDefaultPassword ? (
					// biome-ignore lint/a11y/useSemanticElements: <output> means the result of a calculation; this is a persistent configuration warning
					<div
						role="status"
						className="flex items-start gap-2 text-[var(--bark)] text-sm"
					>
						<AlertTriangle
							aria-hidden="true"
							className="mt-0.5 size-4 shrink-0"
						/>
						<p>
							This station still uses its default password, so it can only be
							unlocked from your local network. Run{" "}
							<code className="tabular-data text-[0.8125rem]">
								scripts/set_web_ui_password.sh
							</code>{" "}
							on the Pi to set your own.
						</p>
					</div>
				) : null}

				{/* Wraps, unlike the settings cards' equivalent row: two buttons
				    rather than one leave a failure message about 40px on a phone,
				    so it takes its own line instead of being crushed. */}
				<div className="flex flex-wrap items-center justify-between gap-3">
					{/* Nothing at rest, like the settings cards: the consequence of
					    signing every device out is stated in its confirmation, where it
					    is actually load-bearing, rather than standing here permanently. */}
					<p
						aria-live="polite"
						className="flex min-w-0 items-center gap-2 text-destructive text-xs"
					>
						{error ? (
							<>
								<AlertTriangle aria-hidden="true" className="size-3.5" />
								<span>{error}</span>
							</>
						) : null}
					</p>
					<div className="flex shrink-0 items-center gap-2">
						<Button
							type="button"
							variant="outline"
							icon={Lock}
							disabled={lockPending}
							onClick={onLock}
						>
							{lockPending ? "Locking…" : "Lock this browser"}
						</Button>
						<Button
							type="button"
							variant="outline"
							icon={LogOut}
							disabled={signOutPending}
							onClick={() => setConfirming(true)}
						>
							{signOutPending ? "Signing out…" : "Sign out all devices"}
						</Button>
					</div>
				</div>
			</div>

			{confirming ? (
				<ConfirmDialog
					title="Sign out all devices?"
					description="Every browser signed in to this station is signed out, including this one. The password itself does not change, so you can sign back in with it."
					confirmLabel="Sign out everywhere"
					destructive
					onCancel={() => setConfirming(false)}
					onConfirm={() => {
						setConfirming(false);
						void onSignOutAll();
					}}
				/>
			) : null}
		</section>
	);
}
