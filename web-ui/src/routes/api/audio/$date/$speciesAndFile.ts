import { readFile } from "node:fs/promises";
import { createFileRoute } from "@tanstack/react-router";

import { sqlite } from "~/db/index.ts";
import {
	extractedDir,
	mimeTypeFor,
	resolveExtractedFile,
} from "~/lib/audio.server.ts";
import { splitSpeciesAndFile } from "~/lib/audio.ts";
import { isBestRecording } from "~/lib/best-recording.server.ts";
import { canHearEveryClip } from "~/lib/clip-access.server.ts";

export const Route = createFileRoute("/api/audio/$date/$speciesAndFile")({
	server: {
		handlers: {
			GET: async ({ params }) => {
				const [species, file] = splitSpeciesAndFile(params.speciesAndFile);
				const relativePath = `By_Date/${params.date}/${species}/${file}`;
				const resolved = resolveExtractedFile(relativePath);
				if (!resolved) {
					return new Response("Not found", { status: 404 });
				}

				// Signed out, only each species' best recording plays -- the bird
				// page, the life list and Learn. Every other clip may have caught
				// someone talking near the station.
				const signedIn = await canHearEveryClip();
				const best =
					signedIn ||
					isBestRecording(sqlite, extractedDir(), {
						date: params.date,
						speciesDir: species,
						fileName: file,
					});
				if (!best) return new Response("Locked", { status: 401 });

				try {
					const data = await readFile(resolved);
					return new Response(data, {
						headers: {
							"Content-Type": mimeTypeFor(resolved),
							// Never in a shared cache: a signed-in visitor's clip must not be
							// served on to someone else, and a best recording that gets
							// replaced or deleted must stop playing for everyone.
							"Cache-Control": "private, max-age=86400",
						},
					});
				} catch {
					return new Response("Not found", { status: 404 });
				}
			},
		},
	},
});
