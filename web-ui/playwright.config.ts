import { defineConfig, devices } from "@playwright/test";

/**
 * Browser smoke test: every page loads in a real browser without an error.
 * It runs against the shared dev server on the fixed port (see CLAUDE.md),
 * reusing it when it is already up rather than starting a second one.
 */
export default defineConfig({
	testDir: "./e2e",
	fullyParallel: false,
	workers: 1,
	reporter: "list",
	timeout: 60_000,
	use: {
		baseURL: "http://localhost:5199",
		...devices["Desktop Chrome"],
	},
	webServer: {
		command: "npm run dev -- --port 5199 --strictPort",
		url: "http://localhost:5199/live",
		reuseExistingServer: true,
		timeout: 120_000,
	},
});
