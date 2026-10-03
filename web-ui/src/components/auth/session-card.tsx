import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Lock, LogOut } from "lucide-react";
import { useState } from "react";
import { CardHeader } from "~/components/card-header.tsx";
import { Button } from "~/components/ui/button.tsx";
import { ConfirmDialog } from "~/components/ui/confirm-dialog.tsx";
import { destructiveToast, toast } from "~/components/ui/toaster.tsx";
import { lockFn, signOutAllDevicesFn } from "~/lib/auth.ts";

/**
 * The Account page's card under the masthead while this browser is signed in.
 *
 * Nothing here is a pending edit waiting on Save; both controls act the moment
 * they are confirmed.
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

	async function onLock() {
		setLockPending(true);
		try {
			await lock({ data: undefined });
			await router.invalidate();
		} catch (cause) {
			console.error(cause);
			toast.error("This browser could not be locked.");
		} finally {
			setLockPending(false);
		}
	}

	async function onSignOutAll() {
		setSignOutPending(true);
		try {
			await signOutAll({ data: undefined });
			await router.invalidate();
			destructiveToast("Signed out every device.");
		} catch (cause) {
			console.error(cause);
			toast.error("The other devices could not be signed out.");
		} finally {
			setSignOutPending(false);
		}
	}

	return (
		<>
			<section
				aria-labelledby="account-session"
				className="feature-card flex flex-col gap-(--page-gap) rounded-md p-(--page-gap)"
			>
				<CardHeader as="h2" titleId="account-session" title="This browser" />
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

				{/* A failure arrives as a toast, so the row holds only the two
				    buttons, set to the right like the settings cards' Save. */}
				<div className="flex flex-wrap items-center justify-end gap-2">
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
			</section>

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
		</>
	);
}
