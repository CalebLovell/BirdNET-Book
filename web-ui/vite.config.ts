import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, realpathSync } from "node:fs";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, type Plugin } from "vite";

import { DEV_PASSWORD } from "./src/lib/dev-password.ts";

/**
 * Gives `npm run dev` a station password of its own: a file inside the
 * project (`.dev/`, gitignored), holding `DEV_PASSWORD`, created on start if
 * it's missing -- so delete it to test the "no password yet" screen, and
 * restart to get it back. `apply: "serve"` keeps this out of the production
 * build entirely; a real station still has no default password.
 */
function devStationPassword(): Plugin {
	return {
		name: "birdnet-dev-station-password",
		apply: "serve",
		config() {
			const file = path.resolve(".dev/auth.conf");
			process.env.BIRDNET_AUTH_CONF ??= file;
			if (process.env.BIRDNET_AUTH_CONF !== file || existsSync(file)) return;
			mkdirSync(path.dirname(file), { recursive: true });
			// The same tool the Pi sets its password with, rather than importing
			// the app's auth code here: Vite loads this file before the app's
			// import aliases exist.
			execFileSync(
				process.execPath,
				["--import", "tsx", "src/lib/set-password-cli.ts"],
				{
					input: DEV_PASSWORD,
					env: process.env,
					stdio: ["pipe", "ignore", "inherit"],
				},
			);
		},
	};
}

// Run from the real folder even when started through a link to it (the old
// BirdNET-Pi-Live path is a junction to this checkout): Vite and Nitro take
// their root from the working directory, Node resolves modules by real path,
// and when the two disagree the dev server can't load its own entry files.
process.chdir(realpathSync.native(process.cwd()));

const config = defineConfig({
	root: process.cwd(),
	// PORT lets a harness hand the dev server a free port when 3000 is taken;
	// plain `npm run dev` still lands on 3000, which is what the launch config
	// and every bookmarked localhost URL expect.
	server: { port: Number(process.env.PORT) || 3000 },
	resolve: { tsconfigPaths: true },
	plugins: [
		devStationPassword(),
		nitro({ rollupConfig: { external: [/^@sentry\//] } }),
		tailwindcss(),
		tanstackStart({
			// Every page's code ships in the first download rather than one
			// lazily-fetched chunk per route. A route's chunk was requested on the
			// first click into it, from the same Node process that runs the
			// (synchronous) SQLite queries -- so a click during a slow query waited
			// on it before the page could switch. The app is small enough that
			// loading it whole is cheaper than that wait.
			router: { codeSplittingOptions: { defaultBehavior: [] } },
		}),
		viteReact(),
	],
});

export default config;
