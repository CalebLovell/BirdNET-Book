import type { CSSProperties } from "react";

import { Hint } from "~/components/ui/hint.tsx";

/**
 * One pill. Every pill -- confidence, New, Returned, Rare, Vocal -- shares this
 * size, radius and weight so a cluster reads as one family; only the tint and
 * the optional icon set them apart. A `tooltip` explains what the pill means
 * on hover.
 */
export function Pill({
	icon: Icon,
	label,
	style,
	tooltip,
	tabular = false,
	className = "",
}: {
	icon?: React.ComponentType<{ className?: string }>;
	label: string;
	style: CSSProperties;
	tooltip?: string;
	tabular?: boolean;
	className?: string;
}) {
	return (
		<Hint content={tooltip}>
			<span
				className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 font-semibold text-xs leading-none ${tabular ? "tabular-data" : ""} ${className}`}
				style={style}
			>
				{Icon ? <Icon className="size-3" /> : null}
				{label}
			</span>
		</Hint>
	);
}
