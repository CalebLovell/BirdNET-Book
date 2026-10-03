import { createServerFn } from "@tanstack/react-start";
import { count, desc } from "drizzle-orm";

import { db } from "~/db/index.ts";
import { detections } from "~/db/schema.ts";
import type { SearchSpecies } from "~/lib/site-search.ts";

/**
 * Every species the station has heard, with its all-time total, for the
 * sidebar search.
 *
 * One grouped query and nothing else -- no latest detection, audio or hourly
 * fold like `getLifeListCards` -- since the sidebar asks for it from whatever
 * page you happen to be on. Busiest first, so equally good matches list the
 * bird you're likeliest to mean.
 */
export const getSearchSpecies = createServerFn({ method: "GET" }).handler(
	async (): Promise<SearchSpecies[]> =>
		db
			.select({
				comName: detections.Com_Name,
				sciName: detections.Sci_Name,
				count: count(),
			})
			.from(detections)
			.groupBy(detections.Com_Name, detections.Sci_Name)
			.orderBy(desc(count())),
);
