import { ConfidencePill } from "~/components/confidence-pill.tsx";
import { EmptyNote } from "~/components/empty-state.tsx";
import { RecordingButton } from "~/components/recording-button.tsx";
import { Spectrogram } from "~/components/spectrogram.tsx";
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
			<div className="island-kicker">Best recording</div>

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
							{formatHeard(recording.date, recording.time)}
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

function formatHeard(date: string, time: string): string {
	const dateLabel = new Date(`${date}T00:00:00`).toLocaleDateString([], {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
	const timeLabel = new Date(`1970-01-01T${time}`).toLocaleTimeString([], {
		hour: "numeric",
		minute: "2-digit",
	});
	return `${dateLabel} · ${timeLabel}`;
}
