# BirdNET-Pi-Live

The web UI lives in `web-ui/` (Vite + React + TanStack Start). Code in
`*.server.ts` runs only on the server; don't import it from client components.

## Previewing the app

- Start/open the app with the preview browser's launch config named `web-ui`
  (defined in `.claude/launch.json`). It runs `npm run dev` in `web-ui/` on a
  fixed port (5199).
- The port is fixed on purpose: every session **reuses the one running dev
  server** in the same browser tab instead of starting a second one. If a
  server is already up, reuse it — do not run `npm run dev` yourself in a
  terminal, and do not pick a different port.
- Reload the existing tab (navigate to the same URL, or `window.location.reload()`)
  rather than opening new tabs.
