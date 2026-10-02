// Highlights: the rules that decide what a window of detections is worth
// remarking on, shared by the Live page (the rolling last 24 hours) and the
// timeline (whichever calendar window is selected). Pure on purpose -- the SQL
// that gathers the evidence lives in lib/live-highlights.ts and lib/timeline.ts,
// and both hand it over in the same day-by-day shape, so the judgement can be
// tested against hand-written tallies and the two pages can never disagree
// about what counts.
//
// The thresholds live in lib/highlight-thresholds.ts, beside the guide the
// card's info tip shows. A bird gets every tag it qualifies for.

import {
	type HighlightPeriod,
	type HighlightThresholds,
	lookbackFor,
} from "~/lib/highlight-thresholds.ts";

/** Birds a line names before summing up the rest, so a migration week doesn't
    turn one line into a paragraph. */
export const MAX_NAMED_BIRDS = 10;

/** A bird as a line names it, plus what earned it its place ("23 days away"). */
export type HighlightBird = { comName: string; note: string | null };

export type SpeciesHighlightKind =
	| "new"
	| "rare"
	| "consistent"
	| "routine"
	| "returned"
	| "vocal";

export type Highlight =
	| {
			kind: "activity";
			direction: "up" | "down" | "level";
			/** How far the window's detections sit from the period before's,
			    rounded. Zero reads as "The same as". */
			percent: number;
			/** The period before, as the sentence names it: "yesterday",
			    "last week", "last month", "last year". */
			baselineLabel: string;
			/** The window's detections. */
			count: number;
			/** The window's detections against the period before's. */
			delta: number;
	  }
	| { kind: "busiest-hour"; hour: number }
	| {
			kind: SpeciesHighlightKind;
			/** Every qualifying species counts toward this... */
			total: number;
			/** ...but only the first MAX_NAMED_BIRDS are named. */
			birds: HighlightBird[];
	  };

/** One day's detections by species -- for the Live page, one 24-hour slice.
    An empty tally is a day the station recorded nothing, which the rules
    treat as the station being down rather than every bird going silent. */
export type DayTally = Map<string, number>;

/**
 * A window and its history, day by day, as both pages gather it. Every
 * comparison is between whole calendar periods, even while the window is
 * still running.
 */
export type HighlightEvidence = {
	period: HighlightPeriod;
	/** The window's days, oldest first -- through today for a window still
	    running, every recorded day for all time. */
	window: DayTally[];
	/** Whether the window is still running, so a note can say "so far". */
	inProgress: boolean;
	/** Whole periods before the window, nearest first, each its own days oldest
	    first: as many as the longest lookback any rule asks for, fewer for a
	    station younger than that. Empty for all time. */
	before: DayTally[][];
	/** For Live and Day: every day before the window, nearest first, back to
	    the station's first -- the species heard on each -- so a Regular bird's
	    streak is counted to its true start. An empty set is a day the station
	    recorded nothing. Empty for every other period. */
	daysBefore: Set<string>[];
	/** 24 counts, midnight first, across every species in the window. */
	hourCounts: number[];
	/** Records ever per species, the window included. */
	lifetime: Map<string, number>;
	/** Species heard at any point before the window. */
	heardBefore: Set<string>;
	/** For a species heard in the window that had been heard before: days from
	    its last record before the window to its first in it. */
	awayDays: Map<string, number>;
	/** For a species heard before but not in the window: days since its last
	    record. */
	silentDays: Map<string, number>;
};

/** A species heard far more than usual: its detections a day in the window,
    its usual detections a day, and the multiple between. Daily on both sides,
    so the figures mean the same thing for a day, a week, a month or a year. */
export type VocalJump = {
	/** Detections in the window. */
	count: number;
	/** Its usual detections per period over the lookback: per day for Live and
	    Day, per week for a week, per month for a month, per year for a year. */
	usual: number;
	ratio: number;
	/** The window it was judged in, so the badge can say "today" or "this
	    week". */
	period: HighlightPeriod;
};

/** Every tag a species heard in the window carries. They stack. */
export type SpeciesFlags = {
	isNew: boolean;
	isRare: boolean;
	isConsistent: boolean;
	/** How much of the window a Regular bird filled: "14 of 18 hours", "every
	    day this week", "every day so far this month", "93% of days". Null
	    unless isConsistent. */
	regularNote: string | null;
	isReturned: boolean;
	/** How long a Returned bird was away, in the window's own unit: "12 days",
	    "3 weeks", "2 months". Null unless isReturned. */
	away: string | null;
	vocal: VocalJump | null;
};

export type HighlightJudgement = {
	highlights: Highlight[];
	/** Tags for every species heard in the window. */
	flags: Map<string, SpeciesFlags>;
};

const AWAY_UNITS: Partial<
	Record<HighlightPeriod, { size: number; one: string; many: string }>
> = {
	week: { size: 7, one: "week", many: "weeks" },
	month: { size: 30.44, one: "month", many: "months" },
	year: { size: 365.25, one: "year", many: "years" },
};

/**
 * How long a returning bird was away, counted in the window's own unit so it
 * reads against the period on screen: days for Live and Day, weeks for a week,
 * months for a month, years for a year. Never less than one of them -- a bird
 * back on the weekly view was away at least the week before.
 */
export function formatAwayIn(days: number, period: HighlightPeriod): string {
	const unit = AWAY_UNITS[period];
	if (!unit) return `${days} ${plural(days, "day", "days")}`;
	const count = Math.max(1, Math.round(days / unit.size));
	return `${count} ${plural(count, unit.one, unit.many)}`;
}

/** A vocal figure as the card prints it: a whole number ("5", "1,234"),
    or "under 1" for a usual too small to round to one -- never a bare 0. */
export function formatRate(rate: number): string {
	const whole = Math.round(rate);
	return whole === 0 && rate > 0 ? "under 1" : whole.toLocaleString();
}

/** The window as a sentence names it: "today", "this week". */
export function windowPhrase(period: HighlightPeriod): string {
	return period === "live" || period === "day"
		? "today"
		: period === "all"
			? "all time"
			: `this ${period}`;
}

/** "300 this week, usually 40" -- the window's count against its usual. */
export function formatVocal({
	count,
	usual,
	period,
}: Pick<VocalJump, "count" | "usual" | "period">): string {
	return `${formatRate(count)} ${windowPhrase(period)}, usually ${formatRate(usual)}`;
}

/** The period just before the window, as everyday speech names it. Live's
    previous 24 hours read as yesterday, like a Day's. */
export const PREVIOUS_PERIOD: Record<HighlightPeriod, string> = {
	live: "yesterday",
	day: "yesterday",
	week: "last week",
	month: "last month",
	year: "last year",
	all: "",
};

function plural(count: number, one: string, many: string): string {
	return count === 1 ? one : many;
}

const recorded = (day: DayTally) => day.size > 0;

function total(days: DayTally[], comName?: string): number {
	let sum = 0;
	for (const day of days) {
		if (comName == null) for (const n of day.values()) sum += n;
		else sum += day.get(comName) ?? 0;
	}
	return sum;
}

function speciesIn(days: DayTally[]): Set<string> {
	const names = new Set<string>();
	for (const day of days) for (const name of day.keys()) names.add(name);
	return names;
}

function speciesLine<Row extends { comName: string }>(
	kind: SpeciesHighlightKind,
	rows: Row[],
	noteFor: (row: Row) => string | null,
): Highlight | null {
	if (rows.length === 0) return null;
	return {
		kind,
		total: rows.length,
		birds: rows
			.slice(0, MAX_NAMED_BIRDS)
			.map((row) => ({ comName: row.comName, note: noteFor(row) })),
	};
}

/**
 * The window's highlights and every heard species' tags, in the order the card
 * reads them: how the window compared with the period before, when it was
 * busiest, then the birds -- new, rare, vocal, returned, regular, and gone
 * quiet always last. Empty for a window with no detections, which the card reports with
 * its empty note instead: a silent window is almost always the station being
 * down, not every bird falling silent at once.
 */
export function judgeHighlights(
	evidence: HighlightEvidence,
	settings: HighlightThresholds,
): HighlightJudgement {
	const { period, window, before } = evidence;
	const flags = new Map<string, SpeciesFlags>();
	const windowTotal = total(window);
	if (windowTotal === 0) return { highlights: [], flags };

	const isAll = period === "all";
	const units = (n: number) => before.slice(0, n);
	// A lookback only means something once the station was listening from its
	// start: a station two days old has no regulars to lose. Periods it was
	// down for in between are skipped, not held against a bird.
	const watched = (n: number) => {
		const span = units(n);
		return span.length === n && (span.at(-1)?.some(recorded) ?? false);
	};
	const windowCount = new Map<string, number>();
	for (const day of window)
		for (const [name, n] of day)
			windowCount.set(name, (windowCount.get(name) ?? 0) + n);
	const heard = Array.from(windowCount.keys());

	// New: its first record ever is in the window. Rare: heard before, with
	// only a handful of records ever. All time has neither -- every species is
	// trivially first heard in it, and its list is lifetime counts already.
	const isNew = (name: string) => !isAll && !evidence.heardBefore.has(name);
	const isRare = (name: string) =>
		!isAll &&
		evidence.heardBefore.has(name) &&
		(evidence.lifetime.get(name) ?? 0) <= settings.rareMax;

	// Regular: for Live and Day, on a streak -- heard every day for at least
	// `streakDays` days straight, this one included, counted back through the
	// station's whole history; for a week or month, heard on every recorded
	// day of it; for a year or all time, on more than a share of its days.
	// Days the station recorded nothing are stepped over, not held against a
	// bird.
	const windowRecordedDays = window.filter(recorded);
	const regularShare = new Map<string, number>();
	const regularNote = new Map<string, string>();
	const streakOf = (name: string) => {
		let count = 1;
		for (const species of evidence.daysBefore) {
			if (species.size === 0) continue;
			if (!species.has(name)) break;
			count++;
		}
		return count;
	};
	const isConsistent = (name: string) => {
		if (period === "live" || period === "day") {
			const streak = streakOf(name);
			regularShare.set(name, streak);
			regularNote.set(
				name,
				`${streak} ${plural(streak, "day", "days")} straight`,
			);
			return streak >= settings.consistent.streakDays;
		}
		if (windowRecordedDays.length === 0) return false;
		const daysHeard = windowRecordedDays.filter((day) => day.has(name)).length;
		const share = daysHeard / windowRecordedDays.length;
		regularShare.set(name, share);
		if (period === "week" || period === "month") {
			regularNote.set(
				name,
				`every day${evidence.inProgress ? " so far" : ""} ${windowPhrase(period)}`,
			);
			return daysHeard === windowRecordedDays.length;
		}
		regularNote.set(name, `${Math.round(share * 100)}% of days`);
		const bar =
			period === "year"
				? settings.consistent.yearShare
				: settings.consistent.allTimeShare;
		return daysHeard * 100 > bar * windowRecordedDays.length;
	};

	// Returned: heard before, silent for every unit of the lookback, back now.
	const returnedUnits = units(lookbackFor(settings.returned, period));
	const returnedSilentIn = speciesIn(returnedUnits.flat());
	const isReturned = (name: string) =>
		!isAll && evidence.heardBefore.has(name) && !returnedSilentIn.has(name);

	// Vocal: far above its usual count per period over the lookback -- a week
	// against its usual week, a day against its usual day -- for a bird that
	// was properly around in it, heard plenty in the window.
	const vocalN = lookbackFor(settings.vocal, period);
	const vocalUnits = units(vocalN).filter((unit) => unit.some(recorded));
	const vocalDays = vocalUnits.flat().filter(recorded);
	const vocalJump = (name: string): VocalJump | null => {
		if (isAll || vocalDays.length === 0) return null;
		const count = windowCount.get(name) ?? 0;
		if (count < settings.vocal.minDetections) return null;
		const daysHeard = vocalDays.filter((day) => day.has(name)).length;
		if (daysHeard === 0) return null;
		if ((daysHeard / vocalDays.length) * 100 < settings.vocal.presence)
			return null;
		const usual = total(vocalDays, name) / vocalUnits.length;
		const ratio = count / usual;
		return ratio >= settings.vocal.ratio
			? { count, usual, ratio, period }
			: null;
	};

	const awayFor = (name: string) => {
		const days = evidence.awayDays.get(name);
		return isReturned(name) && days != null ? formatAwayIn(days, period) : null;
	};

	for (const name of heard) {
		const returned = isReturned(name);
		const consistent = isConsistent(name);
		flags.set(name, {
			isNew: isNew(name),
			isRare: isRare(name),
			isConsistent: consistent,
			regularNote: consistent ? (regularNote.get(name) ?? null) : null,
			isReturned: returned,
			away: awayFor(name),
			vocal: vocalJump(name),
		});
	}

	// Gone quiet: heard in each unit of the lookback, not once in the window.
	const quietN = lookbackFor(settings.goneQuiet, period);
	const quietUnits = units(quietN).filter((unit) => unit.some(recorded));
	const goneQuiet =
		isAll || !watched(quietN)
			? []
			: Array.from(speciesIn(quietUnits.flat()))
					.filter(
						(name) =>
							!windowCount.has(name) &&
							quietUnits.every((unit) => unit.some((day) => day.has(name))),
					)
					.map((name) => ({
						comName: name,
						daysSilent: evidence.silentDays.get(name) ?? null,
						before: total(quietUnits.flat(), name),
					}))
					.sort((a, b) => b.before - a.before);

	const lines: Highlight[] = [];

	// Up or down on the period just before, whatever the size of the change --
	// unless that period recorded nothing to compare with.
	const previous = before[0] ?? [];
	const previousTotal = total(previous);
	if (previousTotal > 0) {
		const percent = Math.round(
			(Math.abs(windowTotal - previousTotal) / previousTotal) * 100,
		);
		lines.push({
			kind: "activity",
			direction:
				percent === 0 ? "level" : windowTotal > previousTotal ? "up" : "down",
			percent,
			baselineLabel: PREVIOUS_PERIOD[period],
			count: windowTotal,
			delta: windowTotal - previousTotal,
		});
	}

	lines.push({
		kind: "busiest-hour",
		hour: evidence.hourCounts.indexOf(Math.max(...evidence.hourCounts)),
	});

	const byCount = (a: string, b: string) =>
		(windowCount.get(b) ?? 0) - (windowCount.get(a) ?? 0);
	const tagged = (pick: (f: SpeciesFlags) => boolean) =>
		heard.filter((name) => pick(flags.get(name) as SpeciesFlags));

	for (const line of [
		speciesLine(
			"new",
			tagged((f) => f.isNew)
				.sort(byCount)
				.map((comName) => ({ comName })),
			() => null,
		),
		speciesLine(
			"rare",
			tagged((f) => f.isRare)
				.map((comName) => ({
					comName,
					lifetime: evidence.lifetime.get(comName) ?? 0,
				}))
				.sort((a, b) => a.lifetime - b.lifetime),
			(row) => `${row.lifetime} total`,
		),
		speciesLine(
			"vocal",
			heard
				.flatMap((comName) => {
					const jump = flags.get(comName)?.vocal;
					return jump ? [{ comName, ...jump }] : [];
				})
				.sort((a, b) => b.ratio - a.ratio),
			formatVocal,
		),
		speciesLine(
			"returned",
			tagged((f) => f.isReturned)
				.map((comName) => ({
					comName,
					daysAway: evidence.awayDays.get(comName) ?? null,
				}))
				.sort((a, b) => (b.daysAway ?? 0) - (a.daysAway ?? 0)),
			(row) =>
				row.daysAway == null
					? null
					: `${formatAwayIn(row.daysAway, period)} missing`,
		),
		speciesLine(
			"consistent",
			tagged((f) => f.isConsistent)
				.sort(
					(a, b) =>
						(regularShare.get(b) ?? 0) - (regularShare.get(a) ?? 0) ||
						byCount(a, b),
				)
				.map((comName) => ({ comName })),
			(row) => flags.get(row.comName)?.regularNote ?? null,
		),
		speciesLine("routine", goneQuiet, (row) =>
			row.daysSilent == null
				? null
				: `${formatAwayIn(row.daysSilent, period)} silent`,
		),
	])
		if (line) lines.push(line);

	return { highlights: lines, flags };
}
