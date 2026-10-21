import { Trash2, X } from "lucide-react";
import { ConfirmDialog } from "~/components/ui/confirm-dialog.tsx";

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
	const plural = count === 1 ? "" : "s";
	return (
		<ConfirmDialog
			title={`Delete ${count} detection${plural}?`}
			description={`This permanently removes ${count} detection record${plural} and their unreferenced extracted audio files. This cannot be undone.`}
			cancelIcon={X}
			confirmIcon={Trash2}
			confirmLabel={`Delete ${count} detection${plural}`}
			destructive
			pending={pending}
			onCancel={onCancel}
			onConfirm={onConfirm}
		/>
	);
}
