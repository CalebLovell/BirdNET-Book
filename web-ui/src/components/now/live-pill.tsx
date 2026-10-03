/**
 * The Live page's polling indicator: just the pill, with its pulsing dot.
 *
 * Borrows the confidence pills' shape so it reads as part of the same family.
 */
export function LivePill() {
	return (
		<span
			className="flex w-fit shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 font-semibold text-[10px] uppercase tracking-[0.14em]"
			style={{
				backgroundColor: "var(--live-fill)",
				color: "var(--moss)",
			}}
		>
			<span className="live-dot" aria-hidden="true" />
			Live
		</span>
	);
}
