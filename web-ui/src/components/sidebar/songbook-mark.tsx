/**
 * The site's mark: a bird perched on an open book, drawn on Lucide's 24px grid
 * with its 2px round strokes so it sits beside the nav icons as one of them.
 * public/songbook.svg is the same drawing on a moss tile, for the tab.
 */
export function SongbookMark({ className = "" }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={2}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			className={className}
		>
			<path d="M12 11v10.5" />
			<path d="M3 19a1 1 0 0 1-1-1V8.5a1 1 0 0 1 1-1h5a4 3.5 0 0 1 4 3.5 4 3.5 0 0 1 4-3.5h5a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1h-6a3 2.5 0 0 0-3 2.5 3 2.5 0 0 0-3-2.5z" />
			<path d="M6 4.5c1.6.6 4.4.6 5.8-1L13.4 2a1.7 1.7 0 0 1 2.9.8l1 .3-1 .3c-.3 1.5-1.7 2.6-3.5 3-2.4.6-5.2.1-6.8-1.9z" />
		</svg>
	);
}
