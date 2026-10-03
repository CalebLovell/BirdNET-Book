import { Trash2, X } from "lucide-react";
import { Button } from "~/components/ui/button.tsx";

type DeleteDetectionsDialogProps = {
	count: number;
	pending: boolean;
	onCancel: () => void;
	onConfirm: () => void;
};

export function DeleteDetectionsDialog({
	count,
	pending,
	onCancel,
	onConfirm,
}: DeleteDetectionsDialogProps) {
	return (
		<div
			aria-labelledby="delete-detections-title"
			aria-modal="true"
			className="fixed inset-0 z-50 grid place-items-center bg-black/20 p-4"
			role="alertdialog"
		>
			<div className="feature-card w-full max-w-md rounded-md p-4 shadow-xl">
				<div className="space-y-2">
					<h2 id="delete-detections-title" className="font-semibold text-lg">
						Delete {count} detection{count === 1 ? "" : "s"}?
					</h2>
					<p className="text-muted-foreground text-sm">
						This permanently removes {count} detection record
						{count === 1 ? "" : "s"} and their unreferenced extracted audio
						files. This cannot be undone.
					</p>
				</div>
				<div className="mt-4 flex justify-end gap-2">
					<Button
						icon={X}
						variant="outline"
						onClick={onCancel}
						disabled={pending}
					>
						Cancel
					</Button>
					<Button
						variant="destructive"
						icon={Trash2}
						onClick={onConfirm}
						disabled={pending}
					>
						{pending
							? "Deleting…"
							: `Delete ${count} detection${count === 1 ? "" : "s"}`}
					</Button>
				</div>
			</div>
		</div>
	);
}
