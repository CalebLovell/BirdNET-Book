import { Download, RotateCcw, Upload } from "lucide-react";
import { useRef } from "react";
import { Button } from "~/components/ui/button.tsx";

// The toolbar's 36px buttons, dropped to the compact 28px size on the smallest
// phones (under 400px, where the page gap halves too) so all three share one
// line under the search rather than wrapping onto two.
const SMALLEST_SCREEN =
	"h-9 max-[400px]:h-7 max-[400px]:gap-1.5 max-[400px]:px-2.5 max-[400px]:text-xs max-[400px]:[&_svg]:size-3.5";

export function SpeciesControlTools({
	onImport,
	onExport,
	onReset,
}: {
	onImport: (text: string) => void;
	onExport: () => void;
	onReset: () => void;
}) {
	const inputRef = useRef<HTMLInputElement>(null);
	return (
		<div className="flex shrink-0 flex-wrap @min-[38rem]:justify-end gap-2 lg:ml-auto">
			<input
				ref={inputRef}
				className="sr-only"
				type="file"
				accept=".txt,.json,text/plain,application/json"
				onChange={async (event) => {
					const file = event.target.files?.[0];
					if (file) onImport(await file.text());
					event.target.value = "";
				}}
			/>
			<Button
				className={SMALLEST_SCREEN}
				size="default"
				variant="outline"
				onClick={() => inputRef.current?.click()}
			>
				<Upload />
				Import lists
			</Button>
			<Button
				className={SMALLEST_SCREEN}
				size="default"
				variant="outline"
				onClick={onExport}
			>
				<Download />
				Export lists
			</Button>
			<Button
				className={SMALLEST_SCREEN}
				size="default"
				variant="outline"
				onClick={onReset}
			>
				<RotateCcw />
				Reset lists
			</Button>
		</div>
	);
}
