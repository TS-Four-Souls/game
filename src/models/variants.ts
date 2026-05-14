import type { GenericCardType } from "@/types/cardTypes";
import type { CharacterCard, TreasureCard } from "./cards";
import { Game } from "./game";
import type { GameParameters } from "./gameParameters";

/**
 * At the start of the game, lay out (number of players + 1) treasure cards. Each player choose one of them and gain them, in turn order. Put the last card on the bottom of the treasure deck. Repeat this process with the order reversed.
 * @param game 
 */
export async function miniDraft(game: Game): Promise<void> {
    for( const players of [game.players, game.players.toReversed()]) {
        const drawn: TreasureCard[] = game.decks.treasure.drawSeveral(game.players.length + 1);
        for(const player of players) {
            const card = (await game.select(player, 1, 1, drawn, "Select an item to obtain (mini-draft)")).selected[0]!;
            game.addInPlay(player, card);
            drawn.splice(drawn.indexOf(card), 1);
        }
    }
}

/**
 * Each player starts with an Eden character card instead of a random one.
 * @param game 
 * @returns Set of eden character cards for each player.
 */
export function edenGame(game: Game): CharacterCard[] {
    const edens = [game.obtainCard("b2-eden")] as CharacterCard[];
    let first = true;
    for(const player of game.players) {
        if(first)
        {
            first = false;
        }
        else
            edens.push(game.copyCard(edens[0]!) as CharacterCard);
    }
    return edens;
}