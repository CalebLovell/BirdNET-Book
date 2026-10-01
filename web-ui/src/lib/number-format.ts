/** Plain number-to-words helpers, shared by anything that writes a sentence
 * about a count. */

/** "1st", "2nd", "11th", "23rd" -- the teens are the exception the modulo
 * would otherwise get wrong. */
export function ordinal(value: number): string {
	const lastTwo = value % 100;
	if (lastTwo >= 11 && lastTwo <= 13) return `${value}th`;

	const suffix = ["th", "st", "nd", "rd"][value % 10] ?? "th";
	return `${value}${suffix}`;
}

/** "1 detection", "1,204 detections". */
export function plural(count: number, noun: string): string {
	return `${count.toLocaleString()} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * A count squeezed to at most three digits and a suffix, for slots too small
 * for the full figure: 999, then 1k, 1.2k, 12k, 300k, then 1m, 1.5m. One
 * decimal only where it still fits in three characters, and never rounded up
 * past the next unit (999,999 reads "999k", not "1000k").
 */
export function compactCount(count: number): string {
	if (count < 1_000) return count.toString();
	const units = [
		{ size: 1_000_000_000, suffix: "b" },
		{ size: 1_000_000, suffix: "m" },
		{ size: 1_000, suffix: "k" },
	];
	for (const { size, suffix } of units) {
		if (count < size) continue;
		const value = count / size;
		const shown = value < 10 ? Math.floor(value * 10) / 10 : Math.floor(value);
		return `${shown}${suffix}`;
	}
	return count.toString();
}
