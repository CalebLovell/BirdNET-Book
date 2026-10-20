import { type ReactNode, useEffect, useState } from "react";

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
/**
 * How long a part holds its last content on a new promise before its shell
 * shows (see `shellAfterMs`). Most answers land well inside it, so they swap
 * straight in; one that doesn't still shows it is loading.
 */
export const SHELL_DELAY_MS = 300;

export function Deferred<T>({
	promise,
	shell,
	inline = false,
	className,
	shellAfterMs,
	children,
}: {
	promise: Promise<T>;
	shell: ReactNode;
	/** For a part set inside running text (a header's description): the shell
	    is wrapped in a span, so it stays valid inside a <p>. */
	inline?: boolean;
	/** For the shell's wrapper, when it has to take a layout slot (flex-1). */
	className?: string;
	/** On a new promise, keep the last content up for this long before giving
	    way to the shell. A quick answer then swaps straight in, with no shell
	    flashing up for a frame or two between them; a slow one still shows
	    that something is loading. Without it the last content holds until the
	    new answer lands. */
	shellAfterMs?: number;
	children: (value: T) => ReactNode;
}) {
	const settled = useSettled(promise);
	const stale = settled !== null && !settled.current;
	const waitedOut = useWaitedOut(promise, stale, shellAfterMs);
	if (!settled || waitedOut) {
		return (
			<ShellReveal inline={inline} className={className}>
				{shell}
			</ShellReveal>
		);
	}
	return children(settled.value);
}

/** True once `promise` has been pending, with stale content up, for `ms`. */
function useWaitedOut(
	promise: Promise<unknown>,
	stale: boolean,
	ms: number | undefined,
): boolean {
	const [expired, setExpired] = useState<Promise<unknown> | null>(null);
	useEffect(() => {
		if (!stale || ms === undefined) return;
		const timeout = setTimeout(() => setExpired(promise), ms);
		return () => clearTimeout(timeout);
	}, [promise, stale, ms]);
	return stale && expired === promise;
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
