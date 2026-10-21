import { Check, Share2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "~/components/ui/button.tsx";
import { toast } from "~/components/ui/toaster.tsx";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "~/components/ui/tooltip.tsx";
import { cn } from "~/lib/utils.ts";

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

export type ShareState = {
	/** Copies the summary and toasts the outcome. */
	share: () => Promise<void>;
	/** False while the page is still loading what the summary reads. */
	isReady: boolean;
	isBusy: boolean;
	justCopied: boolean;
};

/**
 * The pasteable summary, held ready to copy. Kept apart from the button so a
 * page can draw the button in more than one place -- the page header on a wide
 * screen, the menu bar on a narrow one -- over the one summary.
 */
export function useShare({
	subject,
	load,
}: {
	/**
	 * What the summary is about, e.g. the window's period and date. Paging to
	 * the next day keeps this mounted, so naming the subject is what tells it
	 * the summary it holds is stale and must be built again.
	 *
	 * Null while the page is still loading what `load` reads: a summary built
	 * from a page that hasn't arrived would be cached under the new subject and
	 * never replaced.
	 */
	subject: string | null;
	/** The finished, pasteable text. Async because the day card fetches it. */
	load: () => Promise<string>;
}): ShareState {
	const [isBusy, setIsBusy] = useState(false);
	const [justCopied, setJustCopied] = useState(false);

	// `load` is a fresh closure on every render, so it travels by ref rather
	// than as a dependency that would restart the fetch on each pass.
	const loadRef = useRef(load);
	useEffect(() => {
		loadRef.current = load;
	});

	// Built as soon as the subject is known rather than on the press: a
	// clipboard write has to follow the click closely, and Safari refuses one
	// that waits on a network round trip.
	const pending = useRef<{ subject: string; text: Promise<string> } | null>(
		null,
	);
	useEffect(() => {
		if (subject === null || pending.current?.subject === subject) return;
		const text = loadRef.current();
		// Caught here so a failed build doesn't surface as an unhandled
		// rejection; the press reports it.
		text.catch(() => {});
		pending.current = { subject, text };
	}, [subject]);

	useEffect(() => {
		if (!justCopied) return;
		const timer = setTimeout(() => setJustCopied(false), COPIED_FEEDBACK_MS);
		return () => clearTimeout(timer);
	}, [justCopied]);

	async function share() {
		const current = pending.current;
		if (subject === null || current?.subject !== subject) return;

		setIsBusy(true);
		try {
			const text = await current.text;
			if (!(await copyText(text))) {
				toast.error("Copying was blocked by the browser.");
				return;
			}
			setJustCopied(true);
			toast.success("Copied to clipboard");
		} catch {
			toast.error("Could not build the summary. Try again in a moment.");
		} finally {
			setIsBusy(false);
		}
	}

	return { share, isReady: subject !== null, isBusy, justCopied };
}

/**
 * The summary as one button: a press copies it and a toast says so. Nothing
 * unfolds on the page -- the emoji card is for the chat it is pasted into, not
 * for reading here.
 *
 * `pill` is the page header's: round-ended, as tall as the page icon across
 * from it (the caller sets the height). `plain` is an ordinary button at the
 * `default` size, for the menu bar.
 */
export function ShareButton({
	state,
	shape = "pill",
	className,
}: {
	state: ShareState;
	shape?: "pill" | "plain";
	className?: string;
}) {
	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						variant="outline"
						size={shape === "pill" ? "lg" : "default"}
						icon={state.justCopied ? Check : Share2}
						loading={state.isBusy}
						disabled={!state.isReady}
						onClick={state.share}
						className={cn(
							shape === "pill" &&
								"self-center rounded-full px-4 text-[var(--moss)] transition-colors duration-[180ms] hover:border-[var(--hover-line)] hover:bg-[var(--icon-well)] hover:text-[var(--moss)] [&_svg]:size-5!",
							className,
						)}
					>
						Share
					</Button>
				</TooltipTrigger>
				<TooltipContent>Copy summary</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}
