import tailwindcss from "@tailwindcss/vite";

import { tanstackStart } from "@tanstack/react-start/plugin/vite";

import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

const config = defineConfig({
	// PORT lets a harness hand the dev server a free port when 3000 is taken;
	// plain `npm run dev` still lands on 3000, which is what the launch config
	// and every bookmarked localhost URL expect.
	server: { port: Number(process.env.PORT) || 3000 },
	resolve: { tsconfigPaths: true },
	plugins: [
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
