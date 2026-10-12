import { Check, Copy, Share2 } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { Button } from "~/components/ui/button.tsx";

const COPIED_FEEDBACK_MS = 2_000;

/**
 * The Pi is usually reached over a bare LAN address, which is not a secure
 * context, so navigator.clipboard is genuinely undefined there. The deprecated
 * execCommand path is the only thing that works on those origins.
 */
async function copyText(text: string): Promise<boolean> {
	if (navigator.clipboard?.writeText) {
		try {
			await navigator.clipboard.writeText(text);
			return true;
		} catch {
			// Fall through to the legacy path.
		}
	}

	const field = document.createElement("textarea");
	field.value = text;
	field.setAttribute("readonly", "");
	field.style.position = "fixed";
	field.style.opacity = "0";
	document.body.append(field);
	field.select();
	const copied = document.execCommand("copy");
	field.remove();
	return copied;
}

/**
 * The pasteable summary, in two pieces so it can live inside the card that
 * carries the same figures: a `trigger` for the card's kicker row and a
 * `summary` that unfolds beneath its contents. Every page that shares does it
 * from its own summary card rather than from a control floating beside one.
 *
 * Shared by the Today page's rolling window, the day page's calendar day and
 * the Timeline's selected period -- the control reads the same on all three,
 * and only the subject and the text they build differ.
 */
export function useShareCard({
	subject = "",
	load,
}: {
	/**
	 * What the card is about, e.g. the day's date. Paging from one day to the
	 * next keeps this hook mounted, so the summary it is holding belongs to
	 * whichever subject it was fetched for -- naming it is what lets the panel
	 * notice the page moved on and fetch again.
	 *
	 * Null while the page is still loading what `load` reads. The panel waits
	 * rather than fetching early: a summary built from a page that hasn't
	 * arrived yet would be cached under the new subject and never replaced.
	 */
	subject?: string | null;
	/**
	 * The finished, pasteable text. Async because most callers fetch it; a page
	 * that already holds the figures can resolve immediately.
	 */
	load: () => Promise<string>;
}): { trigger: ReactNode; summary: ReactNode } {
	const [card, setCard] = useState<{ subject: string; text: string } | null>(
		null,
	);
	const [isOpen, setIsOpen] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [justCopied, setJustCopied] = useState(false);

	// A card fetched for a different subject is stale, but it stays on screen
	// while its replacement loads: the rest of the page changes in one step,
	// because the router waits for the loader, and blanking to a spinner here
	// would make this the only part of the day that flickers.
	const isStale = card !== null && card.subject !== subject;
	const text = card?.text ?? null;

	// `load` is a fresh closure on every render, so it travels by ref rather
	// than as a dependency that would restart the fetch on each pass.
	const loadRef = useRef(load);
	useEffect(() => {
		loadRef.current = load;
	});

	// Fetched on open rather than with the page: the card needs two all-time
	// queries that nobody should pay for unless they want to share.
	useEffect(() => {
		if (!isOpen || subject === null || card?.subject === subject) return;

		let cancelled = false;
		setIsLoading(true);
		setError(null);
		setJustCopied(false);
		loadRef
			.current()
			.then((fetched) => {
				if (!cancelled) setCard({ subject, text: fetched });
			})
			.catch(() => {
				if (!cancelled) {
					setError("Could not build the summary. Try again in a moment.");
				}
			})
			.finally(() => {
				if (!cancelled) setIsLoading(false);
			});

		return () => {
			cancelled = true;
		};
	}, [isOpen, subject, card?.subject]);

	async function copy() {
		if (text === null) return;

		setError(null);
		if (!(await copyText(text))) {
			setError("Copying was blocked. Select the text above to copy it.");
			return;
		}

		setJustCopied(true);
		setTimeout(() => setJustCopied(false), COPIED_FEEDBACK_MS);
	}

	const trigger = (
		<Button
			variant="outline"
			icon={Share2}
			className="shrink-0"
			onClick={() => setIsOpen((open) => !open)}
			aria-expanded={isOpen}
		>
			{/* Both words are the same everywhere the control appears: it is a plain
			    show/hide toggle, and naming the subject back ("Share this day")
			    only makes it longer than the card it sits on needs. */}
			{isOpen ? "Hide" : "Share"}
		</Button>
	);

	const summary = isOpen ? (
		<div className="mt-4 border-[var(--line)] border-t pt-4">
			{/* Only the very first open has nothing to show yet. */}
			{(isLoading || subject === null) && text === null && (
				<p className="text-muted-foreground text-sm">Building your summary…</p>
			)}

			{text !== null && (
				<>
					<pre className="overflow-x-auto whitespace-pre font-mono text-sm leading-relaxed">
						{text}
					</pre>

					<div className="mt-4 flex">
						{/* Copying a summary that is about to be replaced would put the
						    wrong day on the clipboard. */}
						<Button
							icon={justCopied ? Check : Copy}
							onClick={copy}
							disabled={isStale || isLoading}
						>
							{justCopied ? "Copied!" : "Copy"}
						</Button>
					</div>
				</>
			)}

			{error && (
				<p className="mt-4 text-destructive text-sm" role="alert">
					{error}
				</p>
			)}
		</div>
	) : null;

	return { trigger, summary };
}
