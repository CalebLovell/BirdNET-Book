import type { ReactNode } from "react";

import { useSettled } from "~/lib/use-settled.ts";
import { cn } from "~/lib/utils.ts";

/**
 * One component's share of a deferred loader: the route renders at once, and
 * this part shows `shell` until `promise` settles, then `children` with its
 * value. Waits through useSettled rather than Suspense -- see there for why --
 * which also gives every part the same steadiness on a reload: a new promise
 * for the same part (an action's refetch) keeps the current content until its
 * answer lands, while a part remounted under a new `key` (a new period, a new
 * page of rows) starts from its shell.
 *
 * No animation either way: the shell is there from the first frame, and the
 * content replaces it in place the moment it lands -- the same on every page.
 */
export function Deferred<T>({
	promise,
	shell,
	inline = false,
	className,
	children,
}: {
	promise: Promise<T>;
	shell: ReactNode;
	/** For a part set inside running text (a header's description): the shell
	    is wrapped in a span, so it stays valid inside a <p>. */
	inline?: boolean;
	/** For the shell's wrapper, when it has to take a layout slot (flex-1). */
	className?: string;
	children: (value: T) => ReactNode;
}) {
	const settled = useSettled(promise);
	if (!settled) {
		return (
			<ShellReveal inline={inline} className={className}>
				{shell}
			</ShellReveal>
		);
	}
	return children(settled.value);
}

/**
 * The wrapper Deferred sets a shell in -- a span inside running text, a div
 * elsewhere -- for a shell that needs a layout slot (flex-1) or has to stay
 * valid inside a <p>. Use it directly for a part that waits some other way,
 * like a polled snapshot that has not arrived yet.
 */
export function ShellReveal({
	inline = false,
	className,
	children,
}: {
	inline?: boolean;
	className?: string;
	children: ReactNode;
}) {
	const Wrapper = inline ? "span" : "div";
	return (
		<Wrapper className={cn(inline && "inline-block", className)}>
			{children}
		</Wrapper>
	);
}
