import {
	createRouter as createTanStackRouter,
	parseSearchWith,
	stringifySearchWith,
} from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
	const router = createTanStackRouter({
		routeTree,
		// The default stringifier is `stringifySearchWith(JSON.stringify, JSON.parse)`,
		// and that second argument is what quotes a string whose text happens to
		// be valid JSON -- so a year anchor went out as `?date=%222026%22`. Dropping
		// the parser leaves strings alone; everything else still serializes as JSON,
		// so numbers, booleans and objects are unchanged.
		//
		// Parsing stays JSON, which means `?date=2026` now comes back as the number
		// 2026. Every search schema that can receive a numeric-looking string
		// coerces (`z.coerce.string()`) or stringifies by hand, which is what makes
		// the round trip safe.
		stringifySearch: stringifySearchWith(JSON.stringify),
		parseSearch: parseSearchWith(JSON.parse),
		scrollRestoration: true,
		// The window never scrolls: `<main>` does (see __root.tsx), and a table
		// with its own scrolling body marks it `data-scroll-reset`. Without these
		// the reset on navigation hits only the window, so turning a page left
		// you at the pager at the bottom of the new one. Controls that reshape a
		// view in place opt out with `resetScroll: false`.
		scrollToTopSelectors: ["#app-scroll", "[data-scroll-reset]"],
		defaultPreload: "intent",
		defaultPreloadStaleTime: 0,
	});

	return router;
}

declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof getRouter>;
	}
}
