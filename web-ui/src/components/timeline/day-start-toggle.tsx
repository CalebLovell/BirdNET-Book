import { Moon, Sunrise } from "lucide-react";

import { Hint } from "~/components/ui/hint.tsx";
import type { WindowSun } from "~/lib/sun-times.ts";
import { cn } from "~/lib/utils.ts";

export const DAY_STARTS = ["midnight", "sunrise"] as const;
export type DayStart = (typeof DAY_STARTS)[number];

const META: Record<
	DayStart,
	{ label: string; icon: React.ComponentType<{ className?: string }> }
> = {
	midnight: { label: "12a", icon: Moon },
	sunrise: { label: "Sunrise", icon: Sunrise },
};

const UNAVAILABLE: Record<
	Extract<WindowSun, { available: false }>["reason"],
	string
> = {
	"no-location": "Set the station's location in Settings to start at sunrise",
	polar: "The sun doesn't rise and set every day in this window",
	"no-data": "No days in this window to place the sun on",
};

/**
 * Where the heat map's day begins: midnight, or the window's average sunrise.
 * The same split pill as the view switcher beside it -- moss fill on the
 * chosen side -- so the two read as one family of controls. Sunrise stays in
 * place but greys out, with the reason on hover, when the station's location
 * can't place the sun; disabled by aria rather than the attribute, so the
 * hover that explains why still fires.
 */
export function DayStartToggle({
	value,
	sun,
	onChange,
}: {
	value: DayStart;
	sun: WindowSun;
	onChange: (next: DayStart) => void;
}) {
	const effective = sun.available ? value : "midnight";

	return (
		<div className="flex shrink-0 overflow-hidden rounded-full border border-[var(--line)] bg-card">
			{DAY_STARTS.map((option) => {
				const { label, icon: Icon } = META[option];
				const active = option === effective;
				const blocked = option === "sunrise" && !sun.available;
				const button = (
					<button
						key={option}
						type="button"
						aria-pressed={active}
						aria-disabled={blocked || undefined}
						onClick={() => !active && !blocked && onChange(option)}
						className={cn(
							"flex h-6 items-center justify-center gap-1.5 whitespace-nowrap px-3 font-medium text-xs transition-colors max-[520px]:px-2.5 [&+&]:border-[var(--line)] [&+&]:border-l",
							active
								? "bg-primary text-primary-foreground"
								: blocked
									? "cursor-not-allowed text-muted-foreground opacity-50"
									: "text-muted-foreground hover:bg-[var(--meadow)] hover:text-foreground",
						)}
					>
						<Icon className="size-[15.5px] shrink-0" aria-hidden="true" />
						<span className="max-[520px]:sr-only">{label}</span>
					</button>
				);
				return blocked && !sun.available ? (
					<Hint key={option} content={UNAVAILABLE[sun.reason]}>
						{button}
					</Hint>
				) : (
					button
				);
			})}
		</div>
	);
}
