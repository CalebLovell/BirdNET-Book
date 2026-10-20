/**
 * The password `npm run dev` gives its own throwaway station (see
 * `vite.config.ts`), so signing in and out can be tested against the test
 * database without setting anything up. Only the dev server ever writes it: a
 * real station has no default password and refuses this one like any other.
 */
export const DEV_PASSWORD = "birdnet-dev-password";
