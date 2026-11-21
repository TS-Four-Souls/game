import type { Game } from "@/models/game";
import type { StackElement } from "../stackElement";
import { toSerializedTranslation } from "@/utils/translation";

/** Number of times the same stack element resolves, with nothing but resolutions in between, before players vote. */
export const LOOP_REPETITIONS_BEFORE_VOTE = 10;

/** Fields of a stack element that change on every loop iteration without making the loop different. */
const VOLATILE_FIELDS = new Set(["id", "reordering", "diceRoll", "modifier"]);

/**
 * Detects infinite loops (e.g. Laser Eye + Fanny Pack): when the same stack element resolves too many times
 * while players only resolve, players vote whether to reset the stack.
 * The game state changes on every iteration (cards looted, HP lost…), so only the shape of the resolving element is compared.
 */
export class LoopHandler {
    private _game: Game;
    private _resolved: Map<string, number> = new Map();
    private _resolving: number = 0;

    constructor(game: Game) { this._game = game; }

    /** A player did something else than resolving: what resolved before is not a loop. */
    reset(): void {
        this._resolved.clear();
    }

    /** Runs a resolution: what it adds to the stack can be part of a loop. */
    async whileResolving<T>(resolution: () => Promise<T>): Promise<T> {
        this._resolving++;
        try {
            return await resolution();
        } finally {
            this._resolving--;
        }
    }

    /** Only a player action (activating, playing a loot, attacking…) adds to the stack outside a resolution. */
    onAddedToStack(): void {
        if (this._resolving === 0)
            this.reset();
    }

    /**
     * Records the element about to resolve. Once it repeated enough, players vote.
     * @returns true if the players voted to reset the stack (the element must not resolve).
     */
    async onResolve(element: StackElement): Promise<boolean> {
        const signature = JSON.stringify(element.json, (key, value) => VOLATILE_FIELDS.has(key) ? undefined : value);
        const count = (this._resolved.get(signature) ?? 0) + 1;
        this._resolved.set(signature, count);
        if (count < LOOP_REPETITIONS_BEFORE_VOTE)
            return false;
        // Voting to continue asks again after the same number of repetitions.
        this.reset();
        if (!await this.voteResetStack())
            return false;
        this._game.resetStack();
        this._game.resetCallbacks();
        await this._game.resolveCallbacks(); // finish what already resolved (e.g. a dead monster leaving play).
        this._game.dispatch();
        return true;
    }

    /** Every player votes; the stack resets unless most players vote to continue. */
    private async voteResetStack(): Promise<boolean> {
        const results = await this._game.selectMultiple(this._game.players.map(player => ({
            player,
            min: 1,
            max: 1,
            options: [true, false],
            description: toSerializedTranslation("pending.infiniteLoopResetStack"),
            reason: "infiniteLoop" as const,
            canUseOnBoardSelection: false,
        })));
        const resets = results.filter(r => r.selected[0] === true).length;
        return resets * 2 >= results.length;
    }
}
