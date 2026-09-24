import Fuse from "fuse.js";
import {
	Check,
	CircleAlert,
	ListFilter,
	RotateCcw,
	Trash2,
	X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useDebouncedCallback } from "use-debounce";
import { PageHeaderCard } from "~/components/page-header-card.tsx";
import { Button } from "~/components/ui/button.tsx";
import { InfoTip } from "~/components/ui/info-tip.tsx";
import { SearchInput } from "~/components/ui/search-input.tsx";
import {
	type SpeciesControlPageData,
	type SpeciesControlSaveInput,
	type SpeciesStatus,
	speciesControlInputWithStatus,
	speciesControlResetInput,
	speciesStatusFor,
} from "~/lib/species-control-data.ts";
import {
	nextSpeciesControlSort,
	type SpeciesControlWorkspaceSearch,
} from "~/lib/species-control-workspace.ts";
import { SpeciesControlDialog } from "./species-control-dialogs.tsx";
import {
	SpeciesControlTable,
	type SpeciesControlViewRow,
	sortSpeciesControlRows,
} from "./species-control-table.tsx";
import { SpeciesControlTools } from "./species-control-tools.tsx";

/** Exported so the locked view of this page shows the same masthead as the
 *  unlocked one, rather than a second copy of the words that drifts. */
export const SPECIES_CONTROL_PAGE_TITLE = "Species control";
export const SPECIES_CONTROL_PAGE_DESCRIPTION =
	"Decide which installed species BirdNET may detect. Every change is confirmed before it takes effect.";

type PageAdapters = {
	search: SpeciesControlWorkspaceSearch;
	onSearchChange: (search: SpeciesControlWorkspaceSearch) => void;
	onSave?: (input: SpeciesControlSaveInput) => Promise<{ revision: string }>;
	onCommitted?: () => void | Promise<void>;
};

type ProposedDialog =
	| {
			kind: "status";
			input: SpeciesControlSaveInput;
			label: string;
			count: number;
	  }
	| { kind: "import"; input: SpeciesControlSaveInput }
	| {
			kind: "remove-unresolved";
			input: SpeciesControlSaveInput;
			raw: string;
	  }
	| { kind: "reset" };

const BULK_STATUS_ACTIONS: Array<{
	status: SpeciesStatus;
	label: string;
	className: string;
}> = [
	{
		status: "automatic",
		label: "Automatic",
		className:
			"border-[var(--line)] bg-muted text-muted-foreground shadow-[inset_0_1px_0_color-mix(in_oklab,var(--paper-raised)_70%,transparent)] hover:border-[var(--hover-line)] hover:bg-muted/80 focus-visible:border-[var(--hover-line)]",
	},
	{
		status: "custom",
		label: "Custom",
		className:
			"border-[color-mix(in_oklab,var(--sage)_65%,var(--line))] bg-[color-mix(in_oklab,var(--sage)_35%,var(--paper-raised))] text-[var(--moss)] shadow-[inset_0_1px_0_color-mix(in_oklab,var(--paper-raised)_70%,transparent)] hover:border-[color-mix(in_oklab,var(--sage)_85%,var(--line))] hover:bg-[color-mix(in_oklab,var(--sage)_45%,var(--paper-raised))] focus-visible:border-[color-mix(in_oklab,var(--sage)_85%,var(--line))]",
	},
	{
		status: "always",
		label: "Always detect",
		className:
			"border-[color-mix(in_oklab,var(--sand)_65%,var(--line))] bg-[color-mix(in_oklab,var(--sand)_30%,var(--paper-raised))] text-[var(--bark)] shadow-[inset_0_1px_0_color-mix(in_oklab,var(--paper-raised)_70%,transparent)] hover:border-[color-mix(in_oklab,var(--sand)_85%,var(--line))] hover:bg-[color-mix(in_oklab,var(--sand)_40%,var(--paper-raised))] focus-visible:border-[color-mix(in_oklab,var(--sand)_85%,var(--line))]",
	},
	{
		status: "never",
		label: "Never detect",
		className:
			"border-[color-mix(in_oklab,var(--clay)_45%,var(--line))] bg-[color-mix(in_oklab,var(--clay)_15%,var(--paper-raised))] text-destructive shadow-[inset_0_1px_0_color-mix(in_oklab,var(--paper-raised)_70%,transparent)] hover:border-[color-mix(in_oklab,var(--clay)_65%,var(--line))] hover:bg-[color-mix(in_oklab,var(--clay)_22%,var(--paper-raised))] focus-visible:border-[color-mix(in_oklab,var(--clay)_65%,var(--line))]",
	},
];

function setFrom(
	data: SpeciesControlPageData,
	key: "custom" | "excluded" | "whitelisted",
) {
	return new Set(
		data.rows
			.filter((row) =>
				key === "custom" ? speciesStatusFor(row) === "custom" : row[key],
			)
			.map((row) => row.sciName),
	);
}

export function SpeciesControlPage({
	initialData,
	search,
	onSearchChange,
	onSave,
	onCommitted,
}: { initialData: SpeciesControlPageData } & PageAdapters) {
	const initialSets = useMemo(
		() => ({
			custom: setFrom(initialData, "custom"),
			excluded: setFrom(initialData, "excluded"),
			whitelisted: setFrom(initialData, "whitelisted"),
		}),
		[initialData],
	);
	const [custom, setCustom] = useState(() => new Set(initialSets.custom));
	const [excluded, setExcluded] = useState(() => new Set(initialSets.excluded));
	const [whitelisted, setWhitelisted] = useState(
		() => new Set(initialSets.whitelisted),
	);
	const [revision, setRevision] = useState(initialData.revision);
	const [queryInput, setQueryInput] = useState(search.query ?? "");
	const [selected, setSelected] = useState(new Set<string>());
	const [removedUnresolved, setRemovedUnresolved] = useState(new Set<string>());
	const [dialog, setDialog] = useState<ProposedDialog | null>(null);
	const [pending, setPending] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	useEffect(() => setQueryInput(search.query ?? ""), [search.query]);

	const debouncedSetQuery = useDebouncedCallback((value: string) => {
		onSearchChange({
			...search,
			page: 1,
			query: value.trim() || undefined,
		});
	}, 200);

	const viewRows = useMemo<SpeciesControlViewRow[]>(
		() =>
			initialData.rows.map((row) => {
				const membership = {
					custom: custom.has(row.sciName),
					excluded: excluded.has(row.sciName),
					whitelisted: whitelisted.has(row.sciName),
				};
				return {
					...row,
					...membership,
					status: speciesStatusFor(membership),
				};
			}),
		[custom, excluded, initialData.rows, whitelisted],
	);
	const searched = useMemo(() => {
		if (!search.query) return viewRows;
		return new Fuse(viewRows, { keys: ["comName", "sciName"], threshold: 0.3 })
			.search(search.query)
			.map((result) => result.item);
	}, [search.query, viewRows]);
	const sorted = useMemo(
		() => sortSpeciesControlRows(searched, search.sort, search.direction),
		[searched, search.sort, search.direction],
	);
	const pageCount = Math.max(1, Math.ceil(sorted.length / 50));
	const safePage = Math.min(search.page, pageCount);
	const pagedRows = sorted.slice((safePage - 1) * 50, safePage * 50);
	useEffect(() => {
		if (search.page !== safePage) {
			onSearchChange({ ...search, page: safePage });
		}
	}, [onSearchChange, safePage, search]);
	const unresolvedCount =
		Object.values(initialData.unresolved).reduce(
			(sum, values) => sum + values.length,
			0,
		) - removedUnresolved.size;

	function currentSaveInput(): SpeciesControlSaveInput {
		return {
			revision,
			custom: [...custom],
			excluded: [...excluded],
			whitelisted: [...whitelisted],
			removeUnresolved: [],
		};
	}

	function proposeBulkStatus(status: SpeciesStatus) {
		const action = BULK_STATUS_ACTIONS.find((item) => item.status === status);
		if (!action || selected.size === 0) return;
		setDialog({
			kind: "status",
			input: speciesControlInputWithStatus(
				currentSaveInput(),
				[...selected],
				status,
			),
			label: action.label,
			count: selected.size,
		});
	}

	async function commit(
		input: SpeciesControlSaveInput,
		fallbackMessage: string,
		clearSelection = false,
	) {
		if (!onSave) return;
		setPending(true);
		setErrorMessage(null);
		try {
			const result = await onSave(input);
			setRevision(result.revision);
			setCustom(new Set(input.custom));
			setExcluded(new Set(input.excluded));
			setWhitelisted(new Set(input.whitelisted));
			if (input.removeUnresolved.length > 0) {
				setRemovedUnresolved((current) => {
					const next = new Set(current);
					for (const entry of input.removeUnresolved) {
						next.add(`${entry.list}\0${entry.raw}`);
					}
					return next;
				});
			}
			if (clearSelection) setSelected(new Set());
			setDialog(null);
			await onCommitted?.();
		} catch (error) {
			setErrorMessage(error instanceof Error ? error.message : fallbackMessage);
			setDialog(null);
		} finally {
			setPending(false);
		}
	}

	function importLists(text: string) {
		try {
			const known = new Set(initialData.rows.map((row) => row.sciName));
			const normalizeImported = (value: unknown) => {
				if (typeof value !== "string") return null;
				const trimmed = value.trim();
				if (known.has(trimmed)) return trimmed;
				const separator = trimmed.indexOf("_");
				const scientific = separator > 0 ? trimmed.slice(0, separator) : "";
				return known.has(scientific) ? scientific : null;
			};
			const parsed = text.trimStart().startsWith("{")
				? (JSON.parse(text) as Record<string, unknown>)
				: { custom: text.split(/\r?\n/) };
			const imported = {
				custom: Array.isArray(parsed.custom)
					? new Set(
							parsed.custom
								.map(normalizeImported)
								.filter((value): value is string => value !== null),
						)
					: new Set(custom),
				excluded: Array.isArray(parsed.excluded)
					? new Set(
							parsed.excluded
								.map(normalizeImported)
								.filter((value): value is string => value !== null),
						)
					: new Set(excluded),
				whitelisted: Array.isArray(parsed.whitelisted)
					? new Set(
							parsed.whitelisted
								.map(normalizeImported)
								.filter((value): value is string => value !== null),
						)
					: new Set(whitelisted),
			};
			for (const name of imported.excluded) {
				imported.custom.delete(name);
				imported.whitelisted.delete(name);
			}
			for (const name of imported.whitelisted) imported.custom.delete(name);
			setDialog({
				kind: "import",
				input: {
					revision,
					custom: [...imported.custom],
					excluded: [...imported.excluded],
					whitelisted: [...imported.whitelisted],
					removeUnresolved: [],
				},
			});
		} catch {
			setErrorMessage("That file is not a valid species-list export.");
		}
	}

	function exportLists() {
		const blob = new Blob(
			[
				JSON.stringify(
					{
						custom: [...custom],
						excluded: [...excluded],
						whitelisted: [...whitelisted],
					},
					null,
					2,
				),
			],
			{ type: "application/json" },
		);
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement("a");
		anchor.href = url;
		anchor.download = "birdnet-species-lists.json";
		anchor.click();
		URL.revokeObjectURL(url);
	}

	return (
		// Fills `main` exactly and never scrolls itself, so the header, toolbar and
		// the card's pager hold their place and only the rows move. `h-full`
		// measures against `main`, which the shell already bounds to the viewport.
		<div className="page-wrap flex h-full min-h-0 flex-col gap-(--page-gap) py-4">
			<div className="@container shrink-0 space-y-4">
				<PageHeaderCard
					title={SPECIES_CONTROL_PAGE_TITLE}
					description={SPECIES_CONTROL_PAGE_DESCRIPTION}
				/>

				<div
					data-layout="species-control-toolbar"
					className="flex @min-[38rem]:flex-row flex-col @min-[38rem]:flex-wrap @min-[38rem]:items-center gap-3"
				>
					<SearchInput
						aria-label="Search installed species"
						className="@min-[38rem]:min-w-64 @min-[38rem]:flex-[1_1_20rem]"
						placeholder="Search species control..."
						value={queryInput}
						onChange={(event) => {
							const value = event.target.value;
							setQueryInput(value);
							debouncedSetQuery(value);
						}}
						onClear={() => {
							setQueryInput("");
							debouncedSetQuery.cancel();
							onSearchChange({ ...search, page: 1, query: undefined });
						}}
					/>
					<SpeciesControlTools
						onImport={importLists}
						onExport={exportLists}
						onReset={() => setDialog({ kind: "reset" })}
					/>
				</div>

				{errorMessage ? (
					<p className="flex items-center gap-2 text-destructive text-sm">
						<CircleAlert className="size-4" />
						{errorMessage}
					</p>
				) : null}
			</div>

			<section
				aria-label="Installed species"
				className="@container feature-card flex min-h-0 flex-1 flex-col rounded-md p-4"
			>
				<div
					data-layout="installed-species-header"
					className="mb-3 flex shrink-0 @min-[38rem]:flex-row flex-col @min-[38rem]:items-center @min-[38rem]:justify-between gap-3"
				>
					<div className="flex items-center gap-1.5">
						<div className="island-kicker">Installed species</div>
						<InfoTip label="Installed species">
							<p>
								<strong>Automatic</strong> uses BirdNET's usual species rules.{" "}
								<strong>Custom</strong> adds the species to your custom list.{" "}
								<strong>Always detect</strong> skips its species-frequency
								check, and <strong>Never detect</strong> excludes it outright.
							</p>
						</InfoTip>
					</div>
					<div className="flex flex-wrap items-center @min-[38rem]:justify-end gap-2">
						<ListFilter className="size-4 text-muted-foreground" />
						<span className="text-muted-foreground text-xs">
							{selected.size
								? `${selected.size} selected`
								: "Select species for bulk changes"}
						</span>
						<fieldset
							aria-label="Set selected species status"
							className="flex min-w-0 flex-wrap items-center justify-end gap-1.5 border-0 p-0"
						>
							{BULK_STATUS_ACTIONS.map((action) => (
								<Button
									key={action.status}
									aria-label={`Set selected species to ${action.label}`}
									className={action.className}
									disabled={!selected.size}
									size="xs"
									variant="outline"
									onClick={() => proposeBulkStatus(action.status)}
								>
									{action.label}
								</Button>
							))}
						</fieldset>
					</div>
				</div>

				<SpeciesControlTable
					rows={pagedRows}
					page={safePage}
					pageCount={pageCount}
					total={sorted.length}
					selected={selected}
					sort={search.sort}
					direction={search.direction}
					onSortChange={(sort) => {
						setSelected(new Set());
						onSearchChange(nextSpeciesControlSort(search, sort));
					}}
					onSelectedChange={setSelected}
					onPageChange={(page) => {
						setSelected(new Set());
						onSearchChange({ ...search, page });
					}}
				/>
			</section>

			{unresolvedCount > 0 ? (
				// Keeps its natural height but never more than it is owed: the page no
				// longer scrolls, so a long list has to scroll inside its own card
				// rather than pushing the table's pager off the bottom.
				<section
					aria-label="Unmatched list entries"
					className="feature-card flex max-h-64 shrink-0 flex-col rounded-md p-4"
				>
					<div className="flex shrink-0 items-start gap-3">
						<CircleAlert className="mt-0.5 size-5 text-[var(--clay)]" />
						<div>
							<h2 className="display-title font-semibold">
								Unmatched list entries
							</h2>
							<p className="mt-1 text-muted-foreground text-sm">
								These existing lines do not match the installed model. They stay
								in place unless you remove them here.
							</p>
						</div>
					</div>
					<div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto">
						{(
							Object.entries(initialData.unresolved) as [
								"custom" | "excluded" | "whitelisted",
								string[],
							][]
						).flatMap(([list, values]) =>
							values.map((raw) => {
								const key = `${list}\0${raw}`;
								return removedUnresolved.has(key) ? null : (
									<div
										key={key}
										className="flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-2"
									>
										<div>
											<span className="island-kicker">{list}</span>
											<code className="ml-2">{raw}</code>
										</div>
										<Button
											aria-label={`Remove ${raw}`}
											size="icon-xs"
											variant="ghost"
											onClick={() =>
												setDialog({
													kind: "remove-unresolved",
													raw,
													input: {
														...currentSaveInput(),
														removeUnresolved: [{ list, raw }],
													},
												})
											}
										>
											<X />
										</Button>
									</div>
								);
							}),
						)}
					</div>
				</section>
			) : null}

			{dialog?.kind === "status" ? (
				<SpeciesControlDialog
					title={`Set ${dialog.count} species to ${dialog.label}?`}
					description="The selected species will use this status immediately."
					cancelIcon={<X />}
					confirmIcon={<Check />}
					confirmLabel={`Apply ${dialog.label}`}
					pending={pending}
					onCancel={() => setDialog(null)}
					onConfirm={() =>
						commit(dialog.input, "Species statuses could not be saved.", true)
					}
				/>
			) : null}
			{dialog?.kind === "import" ? (
				<SpeciesControlDialog
					title="Import these species lists?"
					description="The imported statuses will replace the current lists immediately."
					cancelIcon={<X />}
					confirmIcon={<Check />}
					confirmLabel="Import lists"
					pending={pending}
					onCancel={() => setDialog(null)}
					onConfirm={() =>
						commit(dialog.input, "Species lists could not be imported.", true)
					}
				/>
			) : null}
			{dialog?.kind === "remove-unresolved" ? (
				<SpeciesControlDialog
					title="Remove this unmatched entry?"
					description={`${dialog.raw} will be removed from its species list immediately.`}
					cancelIcon={<X />}
					confirmIcon={<Trash2 />}
					confirmLabel="Remove entry"
					destructive
					pending={pending}
					onCancel={() => setDialog(null)}
					onConfirm={() =>
						commit(dialog.input, "The unmatched entry could not be removed.")
					}
				/>
			) : null}
			{dialog?.kind === "reset" ? (
				<SpeciesControlDialog
					title="Reset all species lists?"
					description="This immediately clears the Custom, Never detect, and Always detect lists. This action cannot be undone."
					cancelIcon={<X />}
					confirmIcon={<RotateCcw />}
					confirmLabel="Reset lists"
					destructive
					pending={pending}
					onCancel={() => setDialog(null)}
					onConfirm={() =>
						commit(
							speciesControlResetInput(revision),
							"Species lists could not be reset.",
							true,
						)
					}
				/>
			) : null}
		</div>
	);
}
