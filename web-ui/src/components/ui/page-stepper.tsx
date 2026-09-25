import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "~/lib/utils.ts";

/**
 * The page a typed entry asks for, held to the pages that exist -- or null when
 * it names no page at all, so the field can fall back to the current one.
 */
export function parsePageInput(
	value: string,
	pageCount: number,
): number | null {
	const page = Number.parseInt(value.replace(/\D/g, ""), 10);
	if (Number.isNaN(page)) return null;
	return Math.min(Math.max(page, 1), Math.max(1, pageCount));
}

/**
 * Paging as one bordered control, built like the detections date range and the
 * timeline's window stepper: segments joined by hairlines rather than a row of
 * loose buttons: the step back, the page itself, and the step forward.
 *
 * The page is a field, not a label: type any page and Enter (or leaving the
 * field) goes there, clamped to the pages that exist; Escape puts back the
 * current one. A list of every page would be 2,788 options on a busy station.
 *
 * 28px tall -- the compact size of the joined controls, for a table's footer,
 * where it sits in a band the same height as the table's header.
 */
export function PageStepper({
	page,
	pageCount,
	onPageChange,
	label = "Pagination",
	className,
}: {
	page: number;
	pageCount: number;
	onPageChange: (page: number) => void;
	label?: string;
	className?: string;
}) {
	const [draft, setDraft] = useState(String(page));
	useEffect(() => setDraft(String(page)), [page]);

	function commit() {
		const next = parsePageInput(draft, pageCount);
		if (next === null || next === page) {
			setDraft(String(page));
			return;
		}
		onPageChange(next);
	}

	// The page reads as plain text -- "1 of 1,394" -- with no box around the
	// number. The field is exactly as wide as the number in it, so the words
	// always sit together, and the whole line centres in its segment. The
	// segment's floor is that line at its widest, so paging never moves the
	// arrows. Widths are counted rather than measured: `tabular-data` pins each
	// digit to 1ch, a group separator is under half that, and "of" with its
	// spaces is about 2.4ch.
	const pageTotal = pageCount.toLocaleString();
	// The field holds bare digits while it is edited and shows them grouped
	// like any other number ("1,394"), matching the total beside it.
	const shown = draft ? Number(draft).toLocaleString() : "";

	return (
		<nav
			aria-label={label}
			className={cn(
				"flex h-7 w-fit shrink-0 overflow-hidden rounded-md border border-input bg-card text-sm focus-within:border-[var(--focus-ring)]",
				className,
			)}
		>
			<StepButton
				direction="prev"
				disabled={page <= 1}
				onClick={() => onPageChange(page - 1)}
			/>
			<label
				className="flex cursor-text items-center justify-center gap-[0.5ch] px-2 text-muted-foreground"
				style={{
					minWidth: `calc(${2 * numberWidth(pageTotal) + 2.4}ch + 1rem)`,
				}}
			>
				<input
					aria-label={`Page, of ${pageTotal}`}
					inputMode="numeric"
					value={shown}
					onChange={(event) => setDraft(event.target.value.replace(/\D/g, ""))}
					onBlur={commit}
					onFocus={(event) => event.currentTarget.select()}
					onKeyDown={(event) => {
						if (event.key === "Enter") commit();
						if (event.key === "Escape") setDraft(String(page));
					}}
					className="tabular-data bg-transparent text-center font-semibold text-foreground underline-offset-4 outline-none hover:underline focus-visible:underline"
					style={{ width: `${numberWidth(shown || "0")}ch` }}
				/>
				<span className="tabular-data whitespace-nowrap">of {pageTotal}</span>
			</label>
			<StepButton
				direction="next"
				disabled={page >= pageCount}
				onClick={() => onPageChange(page + 1)}
			/>
		</nav>
	);
}

/**
 * How wide a formatted number sets in `tabular-data`, in ch: a full ch per
 * digit and a little under half one per separator, plus a hair of slack so the
 * field never clips its own last digit.
 */
function numberWidth(formatted: string): number {
	const digits = formatted.replace(/\D/g, "").length;
	return digits + (formatted.length - digits) * 0.45 + 0.1;
}

/** One end of the stepper, divided from the page by a hairline. */
function StepButton({
	direction,
	disabled,
	onClick,
}: {
	direction: "prev" | "next";
	disabled: boolean;
	onClick: () => void;
}) {
	const Icon = direction === "prev" ? ChevronLeft : ChevronRight;
	const label = direction === "prev" ? "Previous page" : "Next page";
	return (
		<button
			type="button"
			aria-label={label}
			title={label}
			disabled={disabled}
			onClick={onClick}
			className={`flex w-7 shrink-0 items-center justify-center border-input transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50 ${direction === "prev" ? "border-r" : "border-l"}`}
		>
			<Icon className="size-4" aria-hidden="true" />
		</button>
	);
}
