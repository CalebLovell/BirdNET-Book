import { useState } from "react";

import type { LearnPool } from "~/lib/learn-pools.ts";
import type { LearnRound } from "~/lib/learn-round.ts";

type HeldRound = { round: LearnRound; pool: LearnPool };

/**
 * Whether a round fresh from the loader should replace the one being played:
 * only when it is actually new and the player asked for it, by switching pools
 * or pressing "play again". Anything else is an incidental reload.
 */
export function shouldAdoptRound(
	held: HeldRound,
	incoming: HeldRound,
	wantsNextRound: boolean,
): boolean {
	if (incoming.round.id === held.round.id) return false;
	return incoming.pool !== held.pool || wantsNextRound;
}

/**
 * The round actually being played, which only changes when the player asks it
 * to.
 *
 * The Learn loader shuffles a fresh round every time it runs, and it runs for
 * reasons the player never chose: any `router.invalidate()`, and in dev every
 * HMR update to the route. Handing each of those straight to the game swapped
 * the birds mid-question. So the page holds on to the round it has and adopts a
 * newer one from the loader only after a pool switch or a "play again".
 */
export function useHeldRound(round: LearnRound, pool: LearnPool) {
	const [held, setHeld] = useState<HeldRound>({ round, pool });
	const [wantsNextRound, setWantsNextRound] = useState(false);
	const requestNextRound = () => setWantsNextRound(true);

	// Adjusting state during render rather than in an effect, so the new round
	// paints in the same pass as the pool switch instead of a frame after it.
	if (shouldAdoptRound(held, { round, pool }, wantsNextRound)) {
		setHeld({ round, pool });
		setWantsNextRound(false);
		return { round, requestNextRound };
	}

	return { round: held.round, requestNextRound };
}
