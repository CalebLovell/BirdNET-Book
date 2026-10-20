import { AlertTriangle } from "lucide-react";
import { CardHeader } from "~/components/card-header.tsx";

const COPY = {
	"not-set-up": {
		title: "No password yet",
		body: "This station doesn't have a password yet, so nobody can sign in. Set one on the Pi, then reload this page:",
	},
	misconfigured: {
		title: "Sign-in unavailable",
		body: "The station can't read its password file, so nobody can sign in. Its log says why. Setting the password again on the Pi writes a fresh file:",
	},
} as const;

/**
 * Takes the sign-in form's place on the Account page while signing in can't
 * work at all, so the owner sees what to fix rather than a form that refuses
 * every password.
 */
export function StationNotReadyCard({ state }: { state: keyof typeof COPY }) {
	const { title, body } = COPY[state];
	return (
		<section
			aria-labelledby="station-not-ready"
			className="feature-card flex flex-col gap-(--page-gap) rounded-md p-(--page-gap)"
		>
			<CardHeader as="h2" titleId="station-not-ready" title={title} />
			{/* biome-ignore lint/a11y/useSemanticElements: <output> means the result of a calculation; this is a persistent configuration warning */}
			<div
				role="status"
				className="flex items-start gap-2 text-[var(--bark)] text-sm"
			>
				<AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
				<div className="space-y-2">
					<p>{body}</p>
					<p>
						<code className="tabular-data text-[0.8125rem]">
							sudo scripts/set_web_ui_password.sh
						</code>
					</p>
					{state === "misconfigured" ? (
						<p>
							The log:{" "}
							<code className="tabular-data text-[0.8125rem]">
								journalctl -u birdnet_web_ui
							</code>
						</p>
					) : null}
				</div>
			</div>
		</section>
	);
}
