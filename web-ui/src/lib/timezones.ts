// The timezone names the Station card offers. Node's ICU still reports a
// handful of zones under names the tz database retired years ago (Asia/Calcutta
// for Asia/Kolkata, Europe/Kiev for Europe/Kyiv), and leaves out UTC. The
// station's `timedatectl` takes the current names, so those are what the list
// shows and what gets saved.

const RENAMED: Record<string, string> = {
	"Africa/Asmera": "Africa/Asmara",
	"America/Buenos_Aires": "America/Argentina/Buenos_Aires",
	"America/Catamarca": "America/Argentina/Catamarca",
	"America/Coral_Harbour": "America/Atikokan",
	"America/Cordoba": "America/Argentina/Cordoba",
	"America/Godthab": "America/Nuuk",
	"America/Indianapolis": "America/Indiana/Indianapolis",
	"America/Jujuy": "America/Argentina/Jujuy",
	"America/Louisville": "America/Kentucky/Louisville",
	"America/Mendoza": "America/Argentina/Mendoza",
	"Asia/Calcutta": "Asia/Kolkata",
	"Asia/Katmandu": "Asia/Kathmandu",
	"Asia/Rangoon": "Asia/Yangon",
	"Asia/Saigon": "Asia/Ho_Chi_Minh",
	"Atlantic/Faeroe": "Atlantic/Faroe",
	"Europe/Kiev": "Europe/Kyiv",
	"Pacific/Enderbury": "Pacific/Kanton",
	"Pacific/Ponape": "Pacific/Pohnpei",
	"Pacific/Truk": "Pacific/Chuuk",
};

/** The current tz database name for `name`, which may be a retired alias. */
export function modernTimezone(name: string): string {
	return RENAMED[name] ?? name;
}

/** Every zone the station can be set to, current names only, A→Z. */
export function timezoneOptions(): string[] {
	return [
		...new Set([
			"UTC",
			...Intl.supportedValuesOf("timeZone").map(modernTimezone),
		]),
	].sort();
}

/** Whether `name` is a zone this runtime can actually resolve. */
export function isKnownTimezone(name: string): boolean {
	if (!/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)*$/.test(name)) return false;
	try {
		new Intl.DateTimeFormat("en-US", { timeZone: name });
		return true;
	} catch {
		return false;
	}
}
