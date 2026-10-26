import { useRouteContext } from "@tanstack/react-router";

/**
 * Whether this visitor may hear every clip, not just each species' best
 * recording. A detection's clip can carry voices from around the station, so
 * signed out, its Listen button comes off -- and the server refuses the clip
 * either way (see /api/audio). Best recordings play for everyone.
 */
export function useCanListen(): boolean {
	return useRouteContext({ from: "__root__" }).auth.unlocked;
}
