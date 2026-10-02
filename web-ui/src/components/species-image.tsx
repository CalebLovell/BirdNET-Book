import { Bird } from "lucide-react";

import { cn } from "~/lib/utils.ts";

/**
 * A species' picture, or the stand-in when it has none. There are exactly two
 * looks: the bundled illustration, and the plain muted bird glyph -- no photos,
 * no initials, no tinted box -- so a missing illustration reads the same on
 * every page. The caller sizes the slot; the illustration fits inside it and
 * the glyph takes `glyphClassName` (a size, usually half the slot's).
 */
export function SpeciesImage({
	imageUrl,
	alt,
	glyphClassName,
	title,
	loading,
}: {
	imageUrl: string | null;
	alt: string;
	glyphClassName: string;
	title?: string;
	loading?: "lazy" | "eager";
}) {
	if (imageUrl) {
		return (
			<img
				src={imageUrl}
				alt={alt}
				title={title}
				loading={loading}
				className="size-full object-contain"
			/>
		);
	}
	return (
		<Bird
			role={alt ? "img" : undefined}
			aria-label={alt || undefined}
			aria-hidden={alt ? undefined : true}
			className={cn("shrink-0 text-muted-foreground", glyphClassName)}
		/>
	);
}
