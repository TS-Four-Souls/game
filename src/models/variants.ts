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
/**
 * Check whether a card is restricted by the game parameters. 
 * This function is used to determine whether a card should be included in the decks or not.
 * @param card the card to check
 * @param counters an object entirely handled by the functions. It counts the number of occurences of each type of cards.
 * @param parameters parameters to verify against
 */
export function isCardRestricted(card: GenericCardType, counters: Map<string, number>, parameters: GameParameters, numPlayers: number): boolean {
    if(card.minimumPlayers > numPlayers && parameters.nbPlayerCardRestriction.value)
        return true;
    if(["A Penny!", "2 Cents!", "3 Cents!", "4 Cents!", "A Nickel!"].includes(card.name))
    {
        if(counters.get(card.name) === undefined)
            counters.set(card.name, 0);
    }
    else return false;
    const parameterMap: {[key: string]: number} = {
        "A Penny!": parameters.nbPennies.value,
        "2 Cents!": parameters.nb2Cents.value,
        "3 Cents!": parameters.nb3Cents.value,
        "4 Cents!": parameters.nb4Cents.value,
        "A Nickel!": parameters.nbNickels.value
    };
    if(counters.get(card.name)! >= parameterMap[card.name]!)
        {
        return true;
    }
    counters.set(card.name, counters.get(card.name)! + 1);
    return false;
}