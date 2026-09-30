// BirdNET-Pi writes one row per 3-second analysis window, so a bird that sings
// for two minutes leaves dozens of rows behind. A "visit" folds those back into
// the single arrival a person standing outside would actually have witnessed:
// consecutive detections of one species collapse into one visit, and a silence
// longer than the gap threshold starts a new one.
//
// Deliberately pure rather than a SQL window function -- the clustering rule is
// the part worth testing, and 24 hours of timestamps is a few hundred rows.

export const VISIT_GAP_MINUTES = 15;

export type DetectionMoment = {
	comName: string;
	timestamp: string;
};

/** Parses SQLite's "YYYY-MM-DD HH:MM:SS" as a local-time instant. */
export function timestampToMillis(timestamp: string): number {
	return new Date(timestamp.replace(" ", "T")).getTime();
}

/** The inverse: a Date as SQLite's local-time "YYYY-MM-DD HH:MM:SS". */
export function localTimestamp(date: Date): string {
	const pad = (value: number) => String(value).padStart(2, "0");
	return (
		`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
		` ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
	);
}

/** Counts visits within a single species' detection timestamps. */
export function countVisits(
	timestamps: string[],
	gapMinutes: number = VISIT_GAP_MINUTES,
): number {
	const times = timestamps
		.map(timestampToMillis)
		.filter((time) => Number.isFinite(time))
		.sort((a, b) => a - b);
	if (times.length === 0) return 0;

	const gapMs = gapMinutes * 60_000;
	let visits = 1;
	for (let index = 1; index < times.length; index += 1) {
		if (times[index] - times[index - 1] > gapMs) visits += 1;
	}
	return visits;
}

/**
 * Total visits across every species in `moments`. Each species is clustered
 * independently -- a chickadee and a cardinal singing in the same minute are
 * two visits, not one.
 */
export function countVisitsBySpecies(
	moments: DetectionMoment[],
	gapMinutes: number = VISIT_GAP_MINUTES,
): number {
	const timestampsByName = new Map<string, string[]>();
	for (const moment of moments) {
		const existing = timestampsByName.get(moment.comName);
		if (existing) existing.push(moment.timestamp);
		else timestampsByName.set(moment.comName, [moment.timestamp]);
	}

	let total = 0;
	for (const timestamps of timestampsByName.values()) {
		total += countVisits(timestamps, gapMinutes);
	}
	return total;
}

/** One species' unbroken stretch of detections, oldest moment first. */
export type Visit<Moment extends DetectionMoment> = {
	comName: string;
	moments: Moment[];
};

/**
 * The visits themselves rather than their count, newest first -- ranked by
 * each visit's latest detection, so a bird still singing stays at the top.
 * Species are clustered independently, as in countVisitsBySpecies, so a visit
 * interleaved with another species' calls stays one visit.
 */
export function groupVisits<Moment extends DetectionMoment>(
	moments: Moment[],
	gapMinutes: number = VISIT_GAP_MINUTES,
): Visit<Moment>[] {
	const gapMs = gapMinutes * 60_000;
	const sorted = moments
		.map((moment) => ({ moment, time: timestampToMillis(moment.timestamp) }))
		.filter(({ time }) => Number.isFinite(time))
		.sort((a, b) => a.time - b.time);

	const visits: { visit: Visit<Moment>; lastTime: number }[] = [];
	const openBySpecies = new Map<string, (typeof visits)[number]>();
	for (const { moment, time } of sorted) {
		const open = openBySpecies.get(moment.comName);
		if (open && time - open.lastTime <= gapMs) {
			open.visit.moments.push(moment);
			open.lastTime = time;
			continue;
		}
		const started = {
			visit: { comName: moment.comName, moments: [moment] },
			lastTime: time,
		};
		visits.push(started);
		openBySpecies.set(moment.comName, started);
	}

	return visits
		.sort((a, b) => b.lastTime - a.lastTime)
		.map(({ visit }) => visit);
}
