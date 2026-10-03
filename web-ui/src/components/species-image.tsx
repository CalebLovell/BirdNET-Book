import { Bird } from "lucide-react";

import { paintedBoundsFor } from "~/lib/illustrations.ts";
import { cn } from "~/lib/utils.ts";

/**
 * A species' picture, or the stand-in when it has none. There are exactly two
 * looks: the bundled illustration, and the plain muted bird glyph -- no photos,
 * no initials, no tinted box -- so a missing illustration reads the same on
 * every page. The caller sizes the slot; the illustration fits inside it and
 * the glyph takes `glyphClassName` (a size, usually half the slot's).
 *
 * `cropToPainting` fits the animal itself rather than its whole canvas, so a
 * large slot isn't left holding each bird at a different size in a different
 * amount of empty margin. An SVG viewBox does the crop, and the SVG takes the
 * bird's own shape -- the slot's full height, as wide as that makes it, no
 * wider than the slot -- so the slot's flex alignment places the bird itself.
 */
export function SpeciesImage({
	imageUrl,
	alt,
	glyphClassName,
	title,
	loading,
	cropToPainting = false,
}: {
	imageUrl: string | null;
	alt: string;
	glyphClassName: string;
	title?: string;
	loading?: "lazy" | "eager";
	cropToPainting?: boolean;
}) {
	const bounds = imageUrl && cropToPainting ? paintedBoundsFor(imageUrl) : null;
	if (imageUrl && bounds) {
		return (
			<svg
				viewBox={bounds.join(" ")}
				role={alt ? "img" : undefined}
				aria-label={alt || undefined}
				aria-hidden={alt ? undefined : true}
				className="h-full w-auto max-w-full"
			>
				{title ? <title>{title}</title> : null}
				<image href={imageUrl} width={800} height={800} />
			</svg>
		);
	}
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
