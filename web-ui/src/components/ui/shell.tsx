import type { CSSProperties, ReactNode } from "react";

import { CardHeader } from "~/components/card-header.tsx";
import { cn } from "~/lib/utils.ts";

/**
 * Loading shells: the soft bars a component shows in place of figures it is
 * still waiting on. Sized like what they stand in for, so the page keeps its
 * shape when the data lands.
 */

/** One soft bar -- a line of text, a figure, a pill. Size it with classes. */
export function ShellBar({ className }: { className?: string }) {
	return (
		<span
			aria-hidden="true"
			className={cn("block animate-pulse rounded bg-muted", className)}
		/>
	);
}

/**
 * A figure set in running text that hasn't arrived yet: a small rectangle in
 * its place, as wide as `placeholder` would set and a little under the line's
 * height, so the sentence around it reads in full from the first frame and
 * the line keeps its height.
 */
export function ShellFigure({
	placeholder = "00,000",
	className,
}: {
	/** Only its length is used: one character width per character. */
	placeholder?: string;
	className?: string;
}) {
	return (
		<span
			aria-hidden="true"
			style={{ width: `${placeholder.length}ch` }}
			className={cn(
				"inline-block h-[0.8em] animate-pulse rounded-sm bg-muted align-[-0.05em]",
				className,
			)}
		/>
	);
}

/**
 * One line of text that hasn't arrived, as a bar. Give it the real text's
 * type classes: the line itself is an empty one set in that type, so it is
 * exactly the real line's height, and the bar is drawn over it -- a shell
 * built from these can't be a pixel off the loaded layout.
 */
export function ShellText({
	className,
	barClassName,
	strut,
}: {
	/** The real text's type: size, leading, font. */
	className?: string;
	/** The bar's width. */
	barClassName?: string;
	/** What holds the line open, when the real line's height is set by
	    something taller than its own type (a count figure, say). A plain
	    space in the line's type by default. */
	strut?: ReactNode;
}) {
	return (
		<span aria-hidden="true" className={cn("relative block", className)}>
			{strut ?? <>&nbsp;</>}
			<ShellBar
				className={cn("absolute top-[18%] bottom-[18%] left-0", barClassName)}
			/>
		</span>
	);
}

/**
 * A control that hasn't got its data yet, as a solid shell of its exact size:
 * the real control is laid out but invisible, and the bar covers its box.
 */
export function ShellSized({
	children,
	className,
}: {
	children: ReactNode;
	/** The bar's shape -- rounded-full for a pill. */
	className?: string;
}) {
	return (
		<span
			aria-hidden="true"
			// Top-aligned, so it sits in the line without the gap a baseline
			// leaves under it -- the box is the control's, to the pixel.
			className="pointer-events-none relative inline-flex align-top"
		>
			<span className="invisible inline-flex">{children}</span>
			<ShellBar className={cn("absolute inset-0", className)} />
		</span>
	);
}

/** Lines of text: one bar per width, at body-text height. */
export function ShellLines({
	widths = ["w-4/5", "w-3/5", "w-2/3"],
	className,
}: {
	widths?: string[];
	className?: string;
}) {
	return (
		<span className={cn("flex flex-col gap-3 py-2", className)}>
			{widths.map((width, index) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: static decoration
				<ShellBar key={index} className={cn("h-3.5", width)} />
			))}
		</span>
	);
}

/**
 * A card waiting on its data: the real card frame and title -- those never
 * depend on the data -- with shells for its body.
 */
export function ShellCard({
	title,
	children,
	className,
	style,
}: {
	title?: ReactNode;
	children?: ReactNode;
	className?: string;
	style?: CSSProperties;
}) {
	return (
		<section
			aria-busy="true"
			className={cn("feature-card rounded-md p-4", className)}
			style={style}
		>
			{title ? <CardHeader title={title} /> : null}
			{children ?? <ShellLines className="mt-2" />}
		</section>
	);
}

/**
 * A chart card before its counts arrive: the card at the chart's own size
 * (min-h-72, a 220px plot) with one plain rectangle where the chart will be.
 * No axis-label shells -- their places depend on the counts, and a guess is
 * worse than none.
 */
export function ShellChartCard({
	title,
	ariaLabel,
	className = "",
}: {
	title: string;
	ariaLabel: string;
	className?: string;
}) {
	return (
		<section
			aria-busy="true"
			aria-label={ariaLabel}
			className={cn(
				"feature-card flex min-h-72 flex-col rounded-md p-4",
				className,
			)}
		>
			<CardHeader title={title} />
			<ShellBar className="mt-(--page-gap) min-h-[220px] w-full flex-1 rounded-md" />
		</section>
	);
}
