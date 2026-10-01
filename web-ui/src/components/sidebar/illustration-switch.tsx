import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group.tsx";
import {
	type IllustrationSet,
	setIllustrationSet,
	useIllustrationSet,
} from "~/lib/illustration-set.ts";

/**
 * Flips every species picture between the bundled illustrations and the new
 * set, to compare them in place while the new set is being painted.
 */
export function IllustrationSwitch() {
	const set = useIllustrationSet();

	return (
		<section className="flex items-center justify-between gap-2 px-4 py-3">
			<span className="island-kicker">Illustrations</span>
			<ToggleGroup
				type="single"
				variant="outline"
				size="sm"
				value={set}
				onValueChange={(value) => {
					if (value) setIllustrationSet(value as IllustrationSet);
				}}
				aria-label="Illustration set"
			>
				<ToggleGroupItem value="old" className="h-6 px-2 text-xs">
					Old
				</ToggleGroupItem>
				<ToggleGroupItem value="new" className="h-6 px-2 text-xs">
					New
				</ToggleGroupItem>
			</ToggleGroup>
		</section>
	);
}
