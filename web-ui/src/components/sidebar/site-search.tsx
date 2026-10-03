import { useNavigate } from "@tanstack/react-router";
import {
	Activity,
	CalendarRange,
	CheckCheck,
	Feather,
	Lightbulb,
	ListTree,
	type LucideIcon,
	Search,
	Settings,
	SlidersHorizontal,
	UserRound,
} from "lucide-react";
import { Popover } from "radix-ui";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { SpeciesThumbnail } from "~/components/species-row.tsx";
import { Input } from "~/components/ui/input.tsx";
import { illustrationUrlFor } from "~/lib/illustrations.ts";
import { getSearchSpecies } from "~/lib/search-species.ts";
import {
	type SearchPage,
	type SearchSpecies,
	searchSite,
} from "~/lib/site-search.ts";
import { comNameToSlug } from "~/lib/species-slug.ts";
import { cn } from "~/lib/utils.ts";

type PageEntry = SearchPage & { icon: LucideIcon };

/** Labels and icons match the sidebar's own, so a page is found by the name
 * and glyph you already know it by. */
const PAGES: PageEntry[] = [
	{ label: "Live", to: "/live", icon: Activity },
	{ label: "Timeline", to: "/timeline", icon: CalendarRange },
	{ label: "Species", to: "/species", icon: Feather },
	{ label: "Detections", to: "/detections", icon: ListTree },
	{ label: "Learn", to: "/learn", icon: Lightbulb },
	{ label: "Review", to: "/review", icon: CheckCheck },
	{ label: "Control", to: "/species-control", icon: SlidersHorizontal },
	{ label: "Settings", to: "/settings", icon: Settings },
	{ label: "Account", to: "/account", icon: UserRound },
];

type Result =
	| { kind: "species"; species: SearchSpecies }
	| { kind: "page"; page: PageEntry }
	| { kind: "detections"; query: string };

/**
 * Loaded on first focus rather than on mount: the sidebar is on every page, and
 * most visits never search. Held for the rest of the session after that -- a
 * species heard for the first time mid-visit can wait for the next page load.
 */
function useSearchSpecies() {
	const [species, setSpecies] = useState<SearchSpecies[] | null>(null);
	const requested = useRef(false);

	function load() {
		if (requested.current) return;
		requested.current = true;
		getSearchSpecies()
			.then(setSpecies)
			.catch((cause) => {
				console.error(cause);
				// Let the next focus try again.
				requested.current = false;
			});
	}

	return { species: species ?? [], load };
}

/** Typing "/" anywhere outside a text field jumps into search. */
function useSlashShortcut(input: React.RefObject<HTMLInputElement | null>) {
	useEffect(() => {
		function onKeyDown(event: KeyboardEvent) {
			if (event.key !== "/" || event.metaKey || event.ctrlKey) return;
			const target = event.target;
			if (
				target instanceof Element &&
				target.closest("input, textarea, select, [contenteditable='true']")
			) {
				return;
			}
			// The mobile drawer renders a second copy of the sidebar; only the one
			// actually on screen should take the shortcut.
			if (!input.current?.offsetParent) return;
			event.preventDefault();
			input.current.focus();
		}
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [input]);
}

/**
 * The sidebar's site-wide search: species the station has heard, the site's
 * pages, and a way into the detections table filtered by the same words.
 *
 * A combobox rather than a search page: every result is a place to go, so the
 * list only has to get you there. The popover is portalled so it can overhang
 * the sidebar card instead of being clipped by its scroll box.
 */
export function SiteSearch({ onNavigate }: { onNavigate?: () => void }) {
	const navigate = useNavigate();
	const input = useRef<HTMLInputElement>(null);
	const listId = useId();
	const [query, setQuery] = useState("");
	const [focused, setFocused] = useState(false);
	const [active, setActive] = useState(0);
	const { species, load } = useSearchSpecies();
	useSlashShortcut(input);

	const results = useMemo<Result[]>(() => {
		const trimmed = query.trim();
		if (trimmed === "") return [];
		const found = searchSite(trimmed, species, PAGES);
		return [
			...found.species.map((item) => ({
				kind: "species" as const,
				species: item,
			})),
			...found.pages.map((page) => ({ kind: "page" as const, page })),
			{ kind: "detections" as const, query: trimmed },
		];
	}, [query, species]);

	// A fresh query starts the highlight back at its best match.
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset on query change
	useEffect(() => setActive(0), [query]);

	const open = focused && results.length > 0;

	function close() {
		setQuery("");
		input.current?.blur();
	}

	function go(result: Result) {
		if (result.kind === "species") {
			navigate({
				to: "/species/$comName",
				params: { comName: comNameToSlug(result.species.comName) },
			});
		} else if (result.kind === "page") {
			navigate({ to: result.page.to });
		} else {
			navigate({
				to: "/detections",
				search: {
					page: 1,
					pageSize: 100,
					sort: "recorded",
					direction: "desc",
					species: result.query,
				},
			});
		}
		close();
		onNavigate?.();
	}

	function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
		if (event.key === "Escape") {
			event.preventDefault();
			close();
		} else if (!open) {
			return;
		} else if (event.key === "ArrowDown") {
			event.preventDefault();
			setActive((index) => (index + 1) % results.length);
		} else if (event.key === "ArrowUp") {
			event.preventDefault();
			setActive((index) => (index - 1 + results.length) % results.length);
		} else if (event.key === "Enter") {
			event.preventDefault();
			go(results[active]);
		}
	}

	const optionId = (index: number) => `${listId}-${index}`;
	const firstPage = results.findIndex((result) => result.kind === "page");
	const detectionsIndex = results.length - 1;

	return (
		<Popover.Root open={open}>
			<Popover.Anchor asChild>
				<div className="relative px-2 pb-3">
					<Search
						aria-hidden="true"
						className="pointer-events-none absolute top-1/2 left-4.5 size-3.5 -translate-y-[calc(50%+0.375rem)] text-muted-foreground"
					/>
					<Input
						ref={input}
						type="search"
						role="combobox"
						aria-label="Search the station"
						aria-expanded={open}
						aria-controls={listId}
						aria-autocomplete="list"
						aria-activedescendant={open ? optionId(active) : undefined}
						placeholder="Search"
						autoComplete="off"
						spellCheck={false}
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						onFocus={() => {
							setFocused(true);
							load();
						}}
						onBlur={() => setFocused(false)}
						onKeyDown={onKeyDown}
						className="h-8 bg-[var(--meadow)] pr-9 pl-8 [&::-webkit-search-cancel-button]:hidden"
					/>
					{/* Says how to get in while idle, and how to get out once in. */}
					<kbd className="pointer-events-none absolute top-1/2 right-4 -translate-y-[calc(50%+0.375rem)] rounded-sm border border-[var(--line)] px-1 font-sans text-[10px] text-muted-foreground leading-4">
						{focused ? "esc" : "/"}
					</kbd>
				</div>
			</Popover.Anchor>

			<Popover.Portal>
				<Popover.Content
					side="bottom"
					align="start"
					sideOffset={-6}
					alignOffset={8}
					collisionPadding={16}
					// Focus stays in the field: the list is driven from the keyboard
					// through `aria-activedescendant`, never focused itself.
					onOpenAutoFocus={(event) => event.preventDefault()}
					onCloseAutoFocus={(event) => event.preventDefault()}
					className="z-50 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-md border border-[var(--line)] bg-[var(--paper-raised)] py-1 shadow-[0_6px_18px_color-mix(in_oklab,var(--ink)_8%,transparent)]"
				>
					<div id={listId} role="listbox" aria-label="Search results">
						{results.map((result, index) => (
							<div key={resultKey(result)}>
								{index === 0 && result.kind === "species" ? (
									<GroupLabel>Species</GroupLabel>
								) : null}
								{index === firstPage ? (
									<GroupLabel divided>Pages</GroupLabel>
								) : null}
								{index === detectionsIndex ? (
									<hr className="my-1 border-0 border-[var(--line)] border-t" />
								) : null}
								<div
									id={optionId(index)}
									role="option"
									aria-selected={index === active}
									tabIndex={-1}
									// mousedown, not click: the field's blur would close the
									// list before a click ever landed.
									onMouseDown={(event) => {
										event.preventDefault();
										go(result);
									}}
									onMouseMove={() => setActive(index)}
									className={cn(
										"flex cursor-pointer items-center gap-2.5 px-3 py-1 text-sm",
										index === active && "bg-[var(--row-selected)]",
									)}
								>
									<ResultBody result={result} />
								</div>
							</div>
						))}
					</div>
				</Popover.Content>
			</Popover.Portal>
		</Popover.Root>
	);
}

function resultKey(result: Result): string {
	if (result.kind === "species") return `s:${result.species.comName}`;
	if (result.kind === "page") return `p:${result.page.to}`;
	return "detections";
}

function GroupLabel({
	divided = false,
	children,
}: {
	divided?: boolean;
	children: string;
}) {
	return (
		<div
			className={cn(
				"island-kicker px-3 pt-1.5 pb-1",
				divided && "mt-1 border-[var(--line)] border-t pt-2",
			)}
		>
			{children}
		</div>
	);
}

function ResultBody({ result }: { result: Result }) {
	if (result.kind === "species") {
		const { comName, sciName, count } = result.species;
		return (
			<>
				<SpeciesThumbnail
					imageUrl={illustrationUrlFor(sciName)}
					comName={comName}
				/>
				<span className="min-w-0 flex-1">
					<span className="block truncate">{comName}</span>
					<span className="block truncate text-muted-foreground text-xs italic">
						{sciName}
					</span>
				</span>
				<span className="count-figure">{count.toLocaleString()}</span>
			</>
		);
	}

	if (result.kind === "page") {
		const Icon = result.page.icon;
		return (
			<>
				<Icon
					aria-hidden="true"
					className="size-4 shrink-0 text-[var(--moss)]"
				/>
				<span className="py-1">{result.page.label}</span>
			</>
		);
	}

	return (
		<>
			<ListTree
				aria-hidden="true"
				className="size-4 shrink-0 text-[var(--moss)]"
			/>
			<span className="min-w-0 truncate py-1">
				Detections matching “{result.query}”
			</span>
		</>
	);
}
