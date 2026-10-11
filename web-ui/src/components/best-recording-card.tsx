import { CardHeader } from "~/components/card-header.tsx";
import { ConfidencePill } from "~/components/confidence-pill.tsx";
import { EmptyNote } from "~/components/empty-state.tsx";
import { RecordingButton } from "~/components/recording-button.tsx";
import { Spectrogram } from "~/components/spectrogram.tsx";
import { ShellBar, ShellSized, ShellText } from "~/components/ui/shell.tsx";
import { formatDateTime } from "~/lib/date-format.ts";
import type { BestRecording } from "~/lib/species-detail.ts";

/**
 * The single cleanest clip this station has of the species -- its
 * highest-confidence detection -- featured with a spectrogram of the call and a
 * play control. Sits beside the detection-history heat map, filling the row the
 * heat map no longer needs all of.
 */
export function BestRecordingCard({
	recording,
	className = "",
}: {
	recording: BestRecording | null;
	className?: string;
}) {
	return (
		<section
			aria-label="Best recording"
			className={`feature-card flex flex-col rounded-md p-4 ${className}`}
		>
			<CardHeader title="Best recording" />

			{!recording || !recording.audioUrl ? (
				<EmptyNote>No recordings kept for this species yet.</EmptyNote>
			) : (
				<div className="mt-(--page-gap) flex flex-1 flex-col gap-3 max-[400px]:gap-2">
					<Spectrogram
						audioUrl={recording.audioUrl}
						className="min-h-32 flex-1"
					/>

					<div className="flex flex-wrap items-center justify-between gap-3 max-[400px]:gap-2">
						<div className="tabular-data text-muted-foreground text-sm">
							{formatDateTime(recording.date, recording.time)}
						</div>
						<div className="flex items-center gap-2">
							<ConfidencePill confidence={recording.confidence} />
							<RecordingButton
								audioUrl={recording.audioUrl}
								label="Play call"
							/>
						</div>
					</div>
				</div>
			)}
		</section>
	);
}

/**
 * The card before its recording arrives: the spectrogram's slot at its
 * minimum height, and the row under it -- the date, then shells the size of
 * the pill and the Play button.
 */
export function BestRecordingCardSkeleton({
	className = "",
}: {
	className?: string;
}) {
	return (
		<section
			aria-busy="true"
			aria-label="Best recording"
			className={`feature-card flex flex-col rounded-md p-4 ${className}`}
		>
			<CardHeader title="Best recording" />
			<div
				aria-hidden="true"
				className="mt-(--page-gap) flex flex-1 flex-col gap-3 max-[400px]:gap-2"
			>
				<ShellBar className="min-h-32 flex-1 rounded-md" />
				<div className="flex flex-wrap items-center justify-between gap-3 max-[400px]:gap-2">
					<ShellText className="w-40 text-sm" barClassName="w-full" />
					<div className="flex items-center gap-2">
						<ShellSized className="rounded-full">
							<ConfidencePill confidence={0.9} />
						</ShellSized>
						<ShellSized className="rounded-md">
							<RecordingButton audioUrl={null} label="Play call" />
						</ShellSized>
					</div>
				</div>
			</div>
		</section>
	);
}
