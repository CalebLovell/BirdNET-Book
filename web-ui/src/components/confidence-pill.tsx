import { Pill } from "~/components/pill.tsx";
import {
	confidenceStyle,
	confidenceTooltip,
	formatConfidence,
} from "~/lib/confidence.ts";

/**
 * BirdNET's score as a tiered pill -- the one confidence pill everywhere, for a
 * single detection or (with `average`) a species' mean across detections. Its
 * tooltip says what the number means and which tier it falls in.
 */
export function ConfidencePill({
	confidence,
	average = false,
	className,
}: {
	confidence: number | null;
	average?: boolean;
	className?: string;
}) {
	if (confidence == null) return null;

	return (
		<Pill
			label={formatConfidence(confidence)}
			style={confidenceStyle(confidence)}
			tooltip={confidenceTooltip(confidence, { average })}
			tabular
			className={className}
		/>
	);
}
