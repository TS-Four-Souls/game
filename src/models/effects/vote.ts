import type { SerializedTranslation } from "@/shared/api";
import type { Game } from "../game";
import type { Player } from "../entities/player";
import type { EffectData } from "../types/cardTypes";
import { toSerializedTranslation } from "@/utils/translation";

export interface VoteParams<T> {
    /** Players allowed to vote. Defaults to every player. */
    voters?: Player[];
    /** What can be voted for. Either a shared list or a list computed per voter. */
    options: T[] | ((voter: Player) => T[]);
    /** Number of (distinct) votes each voter must cast in the main ballot. Defaults to 1. */
    votesPerVoter?: number;
    /** Prompt shown for the main ballot. */
    description: SerializedTranslation;
    /** Prompt shown for each additional vote. Defaults to "pending.voteAdditional". */
    additionalDescription?: SerializedTranslation;
}

export interface VoteResult<T> {
    /** Every vote cast by each voter, additional votes included. */
    ballots: { player: Player; votes: T[] }[];
    /** Number of votes received by each option that got at least one. */
    tally: Map<T, number>;
    /** Options with the most votes (several in case of a tie, empty if nobody voted). */
    winners: T[];
    /** The single option with the most votes, or null when there is a tie or no vote. */
    winner: T | null;
}

/**
 * Runs a vote among players and counts the result.
 *
 * Every voter first casts `votesPerVoter` distinct votes simultaneously. Then, each voter with
 * additional votes (see {@link Player.additionalVotes}, e.g. "While voting, you may vote an
 * additional time.") may cast them one at a time; an additional vote may go to an option
 * already voted for.
 */
export async function vote<T>(game: Game, data: EffectData, params: VoteParams<T>): Promise<VoteResult<T>> {
    const voters = params.voters ?? game.players;
    const votesPerVoter = params.votesPerVoter ?? 1;
    const optionsFor = (voter: Player): T[] =>
        typeof params.options === "function" ? params.options(voter) : params.options;

    const ballots = new Map<Player, T[]>(voters.map(p => [p, []]));
    const cast = async (players: Player[], min: number, max: number, description: SerializedTranslation) => {
        if (players.length === 0) return;
        const results = await data.selectMultipleAndRecord(game, players.map(player => {
            const options = optionsFor(player);
            return {
                player,
                min: Math.min(min, options.length),
                max: Math.min(max, options.length),
                options,
                reason: data.serializedCardAndBox,
                description,
                canUseOnBoardSelection: true,
            };
        }));
        for (const result of results) {
            const player = players.find(p => p.id === result.playerId)!;
            ballots.get(player)!.push(...result.selected);
        }
    };

    await cast(voters, votesPerVoter, votesPerVoter, params.description);

    const additionalDescription = params.additionalDescription ?? toSerializedTranslation("pending.voteAdditional");
    const maxAdditional = Math.max(0, ...voters.map(p => p.additionalVotes));
    for (let i = 1; i <= maxAdditional; i++) {
        await cast(voters.filter(p => p.additionalVotes >= i), 0, 1, additionalDescription);
    }

    const tally = new Map<T, number>();
    for (const votes of ballots.values())
        for (const v of votes)
            tally.set(v, (tally.get(v) ?? 0) + 1);

    const maxVotes = Math.max(0, ...tally.values());
    const winners = maxVotes === 0 ? [] : [...tally.entries()].filter(([, n]) => n === maxVotes).map(([option]) => option);

    return {
        ballots: [...ballots.entries()].map(([player, votes]) => ({ player, votes })),
        tally,
        winners,
        winner: winners.length === 1 ? winners[0]! : null,
    };
}
