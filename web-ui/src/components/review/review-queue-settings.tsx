import { Save, SlidersHorizontal, X } from "lucide-react";
import { useState } from "react";

import { Button } from "~/components/ui/button.tsx";
import { Input } from "~/components/ui/input.tsx";

/**
 * The one station setting that only describes this page: how rare a species has
 * to be to land in the queue. It lives here rather than on Settings so the
 * number can be adjusted while looking at the queue it decides, and it opens as
 * a dialog like the page's other decisions rather than unfolding the masthead.
 */
export function ReviewQueueSettings({
	rareSpeciesMax,
	onSave,
}: {
	rareSpeciesMax: number;
	onSave: (rareSpeciesMax: number) => Promise<void>;
}) {
	const [open, setOpen] = useState(false);
	const [value, setValue] = useState(rareSpeciesMax);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	function show() {
		// Reopening always starts from what the station currently uses, not from
		// whatever a cancelled edit left behind.
		setValue(rareSpeciesMax);
		setError(null);
		setOpen(true);
	}

	async function submit() {
		setSaving(true);
		setError(null);
		try {
			await onSave(value);
			setOpen(false);
		} catch {
			setError("The threshold could not be saved. Try again.");
		} finally {
			setSaving(false);
		}
	}

	return (
		<>
			<Button variant="outline" size="xs" onClick={show}>
				<SlidersHorizontal />
				Queue settings
			</Button>
			{open ? (
				<div
					role="dialog"
					aria-modal="true"
					aria-labelledby="review-queue-settings-title"
					className="fixed inset-0 z-50 grid place-items-center bg-black/20 p-4"
				>
					<form
						className="feature-card w-full max-w-md rounded-md p-4 shadow-xl"
						onSubmit={(event) => {
							event.preventDefault();
							void submit();
						}}
					>
						<h2
							id="review-queue-settings-title"
							className="font-semibold text-lg"
						>
							Review queue settings
						</h2>
						<p className="mt-2 text-muted-foreground text-sm">
							Which uncommon species appear here for manual confirmation.
						</p>
						{/* The control is nested, so the label association is native HTML
						    even though Biome cannot see through the component boundary. */}
						{/* biome-ignore lint/a11y/noLabelWithoutControl: nested labeled control */}
						<label className="mt-4 block space-y-1.5">
							<span className="font-medium text-sm">
								Rare species threshold
							</span>
							<Input
								type="number"
								min={1}
								max={10000}
								required
								autoFocus
								value={value}
								onChange={(event) =>
									setValue(
										Number.isNaN(event.target.valueAsNumber)
											? value
											: event.target.valueAsNumber,
									)
								}
							/>
						</label>
						<p className="mt-4 rounded-md bg-muted p-4 text-muted-foreground text-xs leading-relaxed">
							The queue includes species with strictly fewer lifetime detections
							than this number — a threshold of {value} covers species heard{" "}
							{value - 1} {value - 1 === 1 ? "time" : "times"} or fewer.
						</p>
						{error ? (
							<p className="mt-4 text-destructive text-sm">{error}</p>
						) : null}
						<div className="mt-4 flex justify-end gap-2">
							<Button
								type="button"
								variant="outline"
								icon={X}
								disabled={saving}
								onClick={() => setOpen(false)}
							>
								Cancel
							</Button>
							<Button type="submit" icon={Save} disabled={saving}>
								{saving ? "Saving…" : "Save threshold"}
							</Button>
						</div>
					</form>
				</div>
			) : null}
		</>
	);
}
