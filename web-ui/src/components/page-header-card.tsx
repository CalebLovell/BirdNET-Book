import type { ComponentType, ReactNode } from "react";

/**
 * One figure in a masthead: an icon, a label, and a single value. That is the
 * whole vocabulary -- no subtitle, no unit line, no state colour. Every figure
 * across the app reads the same size, in the same face, so a row of them scans
 * as one instrument rather than a set of differently-styled readouts.
 */
export type PageHeaderStat = {
	label: string;
	value: string | number;
	icon: ComponentType<{ className?: string }>;
};

/** Literal strings so Tailwind keeps every column count it might be asked for. */
const COLUMN_CLASSES: Record<number, string> = {
	1: "lg:grid-cols-1",
	2: "lg:grid-cols-2",
	3: "lg:grid-cols-3",
	4: "lg:grid-cols-4",
};

/**
 * Page masthead: what the page is, on its own card, and beneath a standard gap
 * the figures that describe whatever it's currently showing -- each its own
 * little card. A row of separate units rather than a title card stacked over a
 * divided panel, so the header and every figure read as their own thing.
 */
export function PageHeaderCard({
	title,
	description,
	stats = [],
	action,
	afterHeader,
	children,
}: {
	title: string;
	description: string;
	/** Omit for a title-only masthead; otherwise up to four figures. */
	stats?: PageHeaderStat[];
	/** A control for the page as a whole, set against the title. */
	action?: ReactNode;
	/** Sits between the title card and the figures -- a control the whole
	 * masthead answers to, like the timeline's period/date toolbar, which reads
	 * as steering the figures below it. */
	afterHeader?: ReactNode;
	/** Unfolds beneath the title -- what `action` opens, if anything. */
	children?: ReactNode;
}) {
	return (
		<section aria-label={title} className="space-y-4">
			<div className="feature-card rounded-md p-4">
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0">
						<h1 className="display-title font-bold text-xl leading-tight">
							{title}
						</h1>
						<p className="mt-1 text-muted-foreground text-sm">{description}</p>
					</div>
					{action}
				</div>

				{children}
			</div>

			{afterHeader}

			{stats.length > 0 && <PageHeaderStats stats={stats} />}
		</section>
	);
}

/**
 * The masthead's figure row: each figure its own little card, laid out in the
 * same responsive grid as the header it sits below. Rendered as a sibling of
 * the header card, not nested in it -- a row of separate units.
 *
 * `inline` keeps the older strip -- borderless figures under a hairline -- for
 * the one place a figure row still lives *inside* another card (the review
 * decision card), where turning each figure into its own card would nest cards.
 */
export function PageHeaderStats({
	stats,
	className = "",
	inline = false,
}: {
	stats: PageHeaderStat[];
	className?: string;
	/** Render the borderless in-card strip instead of standalone figure cards. */
	inline?: boolean;
}) {
	const columns = COLUMN_CLASSES[Math.min(stats.length, 4)] ?? "lg:grid-cols-4";

	if (inline) {
		return (
			<dl
				className={`mt-4 grid grid-cols-2 gap-4 border-[var(--line)] border-t pt-4 ${columns} ${className}`}
			>
				{stats.map((stat) => (
					<Figure key={stat.label} {...stat} inline />
				))}
			</dl>
		);
	}

	return (
		<dl className={`grid grid-cols-2 gap-4 ${columns} ${className}`}>
			{stats.map((stat) => (
				<Figure key={stat.label} {...stat} />
			))}
		</dl>
	);
}

function Figure({
	label,
	value,
	icon: Icon,
	inline = false,
}: PageHeaderStat & { inline?: boolean }) {
	return (
		<div
			className={
				inline
					? "flex items-center gap-4 overflow-hidden"
					: "feature-card flex items-center gap-4 overflow-hidden rounded-md p-4"
			}
		>
			<div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--icon-well)] text-[var(--moss)]">
				<Icon aria-hidden="true" className="size-4" />
			</div>
			<div className="min-w-0 flex-1">
				<dt className="island-kicker">{label}</dt>
				{/* One treatment for every value, number or string alike: sans,
				    tabular, text-xl. Floored at that line box so a figure that falls
				    back to a string -- an em dash on an empty period, say -- keeps the
				    masthead height stable and doesn't shift the page's controls up
				    under the cursor. */}
				<dd className="tabular-data mt-2 min-h-[1.75rem] truncate font-semibold text-xl leading-tight">
					{typeof value === "number" ? value.toLocaleString() : value}
				</dd>
			</div>
		</div>
	);
}
