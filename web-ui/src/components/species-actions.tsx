import { ExternalLink } from "lucide-react";

import { RecordingButton } from "~/components/recording-button.tsx";
import { Button } from "~/components/ui/button.tsx";

type SpeciesActionsProps = {
	audioUrl?: string | null;
	ebirdUrl: string;
	comName: string;
};

function SpeciesActions({ audioUrl, ebirdUrl, comName }: SpeciesActionsProps) {
	return (
		<div
			className={
				audioUrl !== undefined
					? "relative z-10 flex w-full flex-wrap items-center justify-start gap-2"
					: "relative z-10 flex flex-wrap items-center gap-2"
			}
		>
			{audioUrl !== undefined && (
				<RecordingButton audioUrl={audioUrl} speciesName={comName} />
			)}
			<Button variant="outline" icon={ExternalLink} asChild>
				<a
					href={ebirdUrl}
					target="_blank"
					rel="noreferrer"
					aria-label={`${comName} on eBird`}
				>
					eBird
				</a>
			</Button>
		</div>
	);
}

export { SpeciesActions };
