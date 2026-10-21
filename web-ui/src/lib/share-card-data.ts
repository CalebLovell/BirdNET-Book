import { createServerFn } from "@tanstack/react-start";
import { count, countDistinct, desc, sql } from "drizzle-orm";

import { db } from "~/db/index.ts";
import { detections } from "~/db/schema.ts";
import { isLast24h } from "~/lib/now.ts";
import type { ShareCard } from "~/lib/share-card.ts";

/**
 * The Today page's rolling 24 hours, shaped for the share card.
 *
 * Kept apart from getNowSnapshot deliberately: that snapshot re-fetches every
 * ten seconds, and the queries below have no business riding along on every
 * poll. This runs once, when the panel is first opened.
 *
 * The body sits inside .handler() rather than in a named function passed to it:
 * an exported function is a live reference the client build cannot erase, and
 * it would drag this module's database import into the browser bundle.
 */
export const getShareCard = createServerFn({ method: "GET" }).handler(
	async (): Promise<ShareCard> => {
		const generatedAt = new Date();

		const [[totals], [{ speciesCount }], topRows, [busiest]] =
			await Promise.all([
				db
					.select({ detectionCount: count() })
					.from(detections)
					.where(isLast24h),
				db
					.select({ speciesCount: countDistinct(detections.Com_Name) })
					.from(detections)
					.where(isLast24h),
				db
					.select({ comName: detections.Com_Name, count: count() })
					.from(detections)
					.where(isLast24h)
					.groupBy(detections.Com_Name)
					.orderBy(desc(count()))
					.limit(3),
				db
					.select({
						hour: sql<string>`strftime('%H', ${detections.Time})`,
						count: count(),
					})
					.from(detections)
					.where(isLast24h)
					.groupBy(sql`strftime('%H', ${detections.Time})`)
					.orderBy(desc(count()))
					.limit(1),
			]);

		return {
			date: `${generatedAt.getFullYear()}-${String(
				generatedAt.getMonth() + 1,
			).padStart(2, "0")}-${String(generatedAt.getDate()).padStart(2, "0")}`,
			window: "rolling",
			species: speciesCount,
			detections: totals.detectionCount,
			topSpecies: topRows,
			busiestHour: busiest
				? { hour: Number(busiest.hour), count: busiest.count }
				: null,
		};
	},
);
