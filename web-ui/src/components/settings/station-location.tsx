import { Crosshair } from "lucide-react";
import { useState } from "react";

import { Button } from "~/components/ui/button.tsx";

/**
 * birdnet.conf asks for four decimal places, which is roughly 11 metres -- past
 * that the extra digits do nothing for species filtering and only pin down the
 * household more precisely than the setting needs.
 */
const COORDINATE_PLACES = 4;

function round(value: number) {
	return Number(value.toFixed(COORDINATE_PLACES));
}

export type Coordinates = { latitude: number; longitude: number };

type State =
	| { kind: "idle" }
	| { kind: "locating" }
	| { kind: "found"; coordinates: Coordinates; accuracy: number | null }
	| { kind: "error"; message: string };

/**
 * Browsers only expose geolocation in a secure context, and a station reached
 * over plain http at a LAN address is not one -- a common way to reach this
 * page. Saying so beats a permission prompt that never appears.
 */
function unavailableReason(): string | null {
	if (typeof window === "undefined") return null;
	if (!window.isSecureContext)
		return "Your browser only shares location over a secure connection. Reach this station over HTTPS or at localhost, or enter the coordinates by hand.";
	if (!("geolocation" in navigator))
		return "This browser cannot report a location. Enter the coordinates by hand.";
	return null;
}

function describe(error: GeolocationPositionError): string {
	if (error.code === error.PERMISSION_DENIED)
		return "Your browser refused to share a location. Allow location access for this site and try again.";
	if (error.code === error.POSITION_UNAVAILABLE)
		return "No location could be determined. Check that location services are switched on.";
	return "Finding your location took too long. Try again.";
}

/**
 * Fills the Station card's coordinates from the browser's own location. It
 * offers the reading first and applies it only once accepted: the number it
 * replaces is one nobody can retype from memory, and a device indoors can be
 * kilometres out.
 *
 * The values are written into the form, not saved -- the card still saves on
 * its own Save button, like every other change made to it.
 */
export function StationLocation({
	current,
	onApply,
}: {
	current: Coordinates;
	onApply: (coordinates: Coordinates) => void;
}) {
	const [state, setState] = useState<State>({ kind: "idle" });

	function locate() {
		const unavailable = unavailableReason();
		if (unavailable) {
			setState({ kind: "error", message: unavailable });
			return;
		}
		setState({ kind: "locating" });
		navigator.geolocation.getCurrentPosition(
			(position) =>
				setState({
					kind: "found",
					coordinates: {
						latitude: round(position.coords.latitude),
						longitude: round(position.coords.longitude),
					},
					accuracy: Number.isFinite(position.coords.accuracy)
						? Math.round(position.coords.accuracy)
						: null,
				}),
			(error) => setState({ kind: "error", message: describe(error) }),
			{ enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
		);
	}

	const open = state.kind === "found" || state.kind === "error";
	return (
		<>
			<Button
				type="button"
				variant="outline"
				icon={Crosshair}
				loading={state.kind === "locating"}
				onClick={locate}
				// Icon-only on the smallest phones: beside it, the label squeezed
				// the card's title to a word per line.
				className="max-[400px]:w-6 max-[400px]:px-0"
			>
				<span className="max-[400px]:sr-only">
					{state.kind === "locating" ? "Locating…" : "Use my location"}
				</span>
			</Button>
			{open ? (
				<div
					role="dialog"
					aria-modal="true"
					aria-labelledby="station-location-title"
					className="fixed inset-0 z-50 grid place-items-center bg-black/20 p-(--page-gap)"
				>
					<div className="feature-card w-full max-w-md rounded-md p-4 text-left shadow-xl">
						<h2 id="station-location-title" className="font-semibold text-lg">
							{state.kind === "found"
								? "Use this location?"
								: "Location unavailable"}
						</h2>
						{state.kind === "found" ? (
							<>
								<dl className="tabular-data mt-4 grid grid-cols-2 gap-4 rounded-md bg-muted p-(--page-gap) text-sm">
									<div>
										<dt className="island-kicker">Latitude</dt>
										<dd className="mt-1 font-semibold">
											{state.coordinates.latitude}
										</dd>
									</div>
									<div>
										<dt className="island-kicker">Longitude</dt>
										<dd className="mt-1 font-semibold">
											{state.coordinates.longitude}
										</dd>
									</div>
								</dl>
								<p className="mt-4 text-muted-foreground text-sm leading-relaxed">
									This replaces {current.latitude}, {current.longitude} in the
									form. Nothing is written to the station until you save the
									Station card.
								</p>
								{state.accuracy !== null ? (
									<p className="mt-4 text-muted-foreground text-xs leading-relaxed">
										Your browser puts this within about {state.accuracy} m. It
										reports the location of the device you are reading this on,
										which may not be where the microphone is.
									</p>
								) : null}
							</>
						) : (
							<p className="mt-2 text-muted-foreground text-sm leading-relaxed">
								{state.message}
							</p>
						)}
						<div className="mt-4 flex justify-end gap-2">
							<Button
								type="button"
								variant="outline"
								onClick={() => setState({ kind: "idle" })}
							>
								{state.kind === "found" ? "Cancel" : "Close"}
							</Button>
							{state.kind === "found" ? (
								<Button
									type="button"
									onClick={() => {
										onApply(state.coordinates);
										setState({ kind: "idle" });
									}}
								>
									Use these coordinates
								</Button>
							) : null}
						</div>
					</div>
				</div>
			) : null}
		</>
	);
}
