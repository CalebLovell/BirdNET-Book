import { ExternalLink } from "lucide-react";

import { RecordingButton } from "~/components/recording-button.tsx";
import { Button } from "~/components/ui/button.tsx";
import type { SpeciesLink } from "~/lib/species-link.ts";

type SpeciesActionsProps = {
	audioUrl?: string | null;
	speciesLink: SpeciesLink | null;
	comName: string;
	/** The Birds grid's cards take the larger buttons. */
	size?: "xs" | "sm";
};

function SpeciesActions({
	audioUrl,
	speciesLink,
	comName,
	size = "xs",
}: SpeciesActionsProps) {
	return (
		<div
			className={
				audioUrl !== undefined
					? "relative z-10 flex w-full flex-wrap items-center justify-start gap-2"
					: "relative z-10 flex flex-wrap items-center gap-2"
			}
		>
			{audioUrl !== undefined && (
				<RecordingButton
					audioUrl={audioUrl}
					speciesName={comName}
					variant="default"
					size={size}
				/>
			)}
			{/* eBird for birds, iNaturalist for the frogs, insects and mammals;
			    sound classes like Dog or Engine have no page, so no button. */}
			{speciesLink && (
				<Button variant="outline" size={size} icon={ExternalLink} asChild>
					<a
						href={speciesLink.href}
						target="_blank"
						rel="noreferrer"
						aria-label={`${comName} on ${speciesLink.site}`}
					>
						{speciesLink.site}
					</a>
				</Button>
			)}
		</div>
	);
}

export { SpeciesActions };
