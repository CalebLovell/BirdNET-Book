import { createServerFn } from "@tanstack/react-start";
import { count, countDistinct, desc, sql } from "drizzle-orm";

import { db } from "~/db/index.ts";
import { detections } from "~/db/schema.ts";
import type { ShareCard } from "~/lib/share-card.ts";

const HOURS = 24;

/**
 * One calendar day shaped for the share card -- the day page's counterpart to
 * getShareCard's rolling window. Kept out of getDayReview so nobody pays for
 * its queries unless they open the panel.
 */
export const getDayShareCard = createServerFn({ method: "GET" })
	.validator((date: string) => date)
	.handler(async ({ data: date }): Promise<ShareCard> => {
		const onDay = sql`${detections.Date} = ${date}`;
		const hourExpr = sql<string>`strftime('%H', ${detections.Time})`;

		const [[totals], [{ speciesCount }], hourlyRows, topRows] =
			await Promise.all([
				db.select({ detectionCount: count() }).from(detections).where(onDay),
				db
					.select({ speciesCount: countDistinct(detections.Com_Name) })
					.from(detections)
					.where(onDay),
				db
					.select({ hour: hourExpr, count: count() })
					.from(detections)
					.where(onDay)
					.groupBy(hourExpr),
				db
					.select({ comName: detections.Com_Name, count: count() })
					.from(detections)
					.where(onDay)
					.groupBy(detections.Com_Name)
					.orderBy(desc(count()))
					.limit(3),
			]);

		const hourlyCounts = Array.from({ length: HOURS }, () => 0);
		for (const row of hourlyRows) {
			hourlyCounts[Number(row.hour)] = row.count;
		}

		const busiestHour = hourlyCounts.reduce<{
			hour: number;
			count: number;
		} | null>(
			(busiest, value, hour) =>
				value > 0 && (!busiest || value > busiest.count)
					? { hour, count: value }
					: busiest,
			null,
		);

		return {
			date,
			window: "day",
			species: speciesCount,
			detections: totals.detectionCount,
			topSpecies: topRows,
			busiestHour,
		};
	});
