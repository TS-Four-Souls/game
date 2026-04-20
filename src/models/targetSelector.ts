import { type Card, ItemCard, MonsterCard } from "./cards";
import type { Entity } from "./entity";
import { Game } from "./game";
import { DiceRoll, Player } from "./player";
import type { StackElement } from "./stack";
import { type TargetsSelector } from "./types/cardTypes";

export function inplayUnchargedItemSelector(game: Game): (issuer: Player) => any[] {
    return (inplayItemSelector((player: Player, card: ItemCard) => card.isActiveItem(), game));
}

export function inplayCurseSelector(filter: (player: Player, card: MonsterCard) => boolean, game: Game): (issuer: Player) => any[] {
    return (issuer: Player) => {
        return game.inPlayCurses.filter(({ player, card }) => filter(player, card)).map(({ card }) => card);
    };
}
export function inplayItemSelector(filter: (player: Player, card: ItemCard) => boolean, game: Game): (issuer: Player) => any[] {
    return (issuer: Player) => {
        return game.inPlayItems.filter(({ player, card }) => filter(player, card)).map(({ card }) => card);
    };
}

export function inplayItemAndSoulSelector(filter: (player: Player, card: ItemCard) => boolean, game: Game): (issuer: Player) => any[] {
    return (issuer: Player) => {
        return [...game.inPlayItems.filter(({ player, card }) => filter(player, card)).map(({ card }) => card), ...game.players.flatMap(p => p.souls)];
    };
}

export function YourItemSelector(filter: (player: Player, card: ItemCard) => boolean, game: Game): (issuer: Player) => any[] {
    return (issuer: Player) => {
        return game.inPlayItems.filter(({ player, card }) => player === issuer &&filter(player, card)).map(({ card }) => card);
    };
}
export function inAnotherplayItemSelector(filter: (player: Player, card: ItemCard) => boolean, game: Game): (issuer: Player) => any[] {
    return (issuer: Player) => {
        return game.inPlayItems.filter(({ player, card }) => filter(player, card) && issuer.id !== player.id).map(({ card }) => card);
    };
}

export function visibleItemSelector(filter: (card: ItemCard) => boolean, game: Game): (issuer: Player) => any[] {
    return (issuer: Player) => {
        return game.visibleItems.filter((card) => filter(card));
    };
}

export function playerSelector(filter: (player: Player) => boolean = () => true, game: Game): (issuer: Player) => any[] {
    return (issuer: Player) => {
        return game.players.filter((player) => filter(player));
    };
}

export function anotherPlayerSelector(filter: (player: Player) => boolean = () => true, game: Game): (issuer: Player) => any[] {
    return (issuer: Player) => {
        return playerSelector((player) => player !== issuer && filter(player), game)(issuer);
    };
}

export function activeEntitySelector(filter: (player: Entity) => boolean = () => true, game: Game): (issuer: Player) => any[] {
    return (issuer: Player) => {
        return game.Entities.filter((entity) => filter(entity));
    }
}
export type ChooseOneOptions = {
    description: string;
    admissibleTargets: any[];
}

export const isChooseOneOptions = (x: any): x is ChooseOneOptions => {
    return typeof x === 'object' && x !== null && 'description' in x && 'admissibleTargets' in x;
};
// export function IfYouDoTargetSelector(s: string, game: Game): (issuer: Player) => any[] {
//     const options = s.split(" if you do, ").map((option) => option.trim()).filter((option) => option.length > 0);
//     return (issuer: Player) => {
//         const selectors = options.map((option) => targetSelectorParser(option, game)[0]!.selector(issuer));
//         return selectors;
//     };
// }
// export function chooseOneTargetSelector(s: string, game: Game): (issuer: Player) => any[] {
//     const options = s.substring("choose one-".length).trim().split("\n").map((option) => option.trim()).filter((option) => option.length > 0);
//     return (issuer: Player) => {
//         const selectors: ChooseOneOptions[] = options.map((option) => ({ description: option, admissibleTargets: targetSelectorParser(option, game)[0]!.selector(issuer) }));
//         return selectors;
//     };
// }
export function deckSelector(filter: (name: string) => boolean = () => true, game: Game): (issuer: Player) => any[] {
    return (issuer: Player) => {
        return [game.decks.loot, game.decks.treasure, game.decks.monster].filter((deck) => filter(deck._type));
        return Object.keys(game.decks).filter((deckName) => filter(deckName)
            && deckName !== "character"
            && deckName !== "eternal"
            && deckName !== "bsoul"
        );
    }
}

export function topAnyDiscardSelector(filter: (card: Card) => boolean = () => true, game: Game): (issuer: Player) => any[] {
    return (issuer: Player) => {
        const cards = [] as Card[];
        for (const deckName of ["loot", "treasure", "monster"] as const) {
            const deck = game.decks[deckName];
            if(deck && deck.discard.length > 0){
                const topCard = deck.discard[0];
                if(filter(topCard as Card))
                    cards.push(topCard as Card);
            }
        }
        return cards;
    }
}

export function stackElementSelector(filter: (element: StackElement) => boolean = () => true, game: Game): (issuer: Player) => any[] {
    return (issuer: Player) => {
        return game.stack.elements.filter((element) => filter(element));
    }
}

export function rollSelector(filter: (roll: DiceRoll) => boolean = () => true, game: Game): (issuer: Player) => any[] {
    return stackElementSelector((element) => element instanceof DiceRoll && filter(element), game);
}

export function attackRollSelector(game: Game): (issuer: Player) => any[] {
    return rollSelector((roll) => roll.attackRoll, game);
}

export function nonAttackRollSelector(game: Game): (issuer: Player) => any[] {
    return rollSelector((roll) => !roll.attackRoll, game);
}

export class selectorWalker{
    _targetsSelectors: TargetsSelector[];
    _currentSelectorIndex: number
    _currentChoiceIndex: number

    constructor(targetsSelectors: TargetsSelector[]){
        this._targetsSelectors = targetsSelectors;
        this._currentSelectorIndex = 0;
        this._currentChoiceIndex = 0;
    }

    walk(issuer: Player, choices: string[]): boolean | any[] {
        let selectorIndex = 0;
        let selector = this._targetsSelectors[selectorIndex];
        if(!selector) return true;
        for (let i = 0; i < choices.length; i++) {
            let possibleTargets: any[] = selector.selector(issuer);
            const choice = choices[i];
            if(!selector.description.startsWith("Choose one-")){
                if (!possibleTargets.includes(choice)) {
                    return false;
                }
                selectorIndex++;
                selector = this._targetsSelectors[selectorIndex];
                if (!selector) return true;
            }
            else {
                const index = possibleTargets.findIndex((option: ChooseOneOptions) => option.description === choice);
                selector = possibleTargets[index];
                if (!selector) return false;
            }
        }
        return false;
    }

}