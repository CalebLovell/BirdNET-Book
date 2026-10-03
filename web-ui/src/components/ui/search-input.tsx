import { Search, X } from "lucide-react";
import type * as React from "react";

import { Input } from "~/components/ui/input.tsx";
import { cn } from "~/lib/utils.ts";

type SearchInputProps = Omit<React.ComponentProps<"input">, "value"> & {
	value: string;
	onClear: () => void;
};

// Shared search field so every list page gets the same behaviour: it fills the
// row up to its sibling filters, and the X only appears once there is
// something to clear. The sidebar's site search and the review dialog draw the
// same magnifier at the same inset, so every search box in the app reads alike.
function SearchInput({
	className,
	value,
	onClear,
	...props
}: SearchInputProps) {
	return (
		<div className={cn("relative w-full min-w-0 flex-1", className)}>
			<Search
				aria-hidden="true"
				className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
			/>
			<Input type="text" value={value} className="pr-9 pl-9" {...props} />
			{value ? (
				<button
					type="button"
					aria-label="Clear search"
					onClick={onClear}
					className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
				>
					<X className="size-4" />
				</button>
			) : null}
		</div>
	);
}

export { SearchInput };
