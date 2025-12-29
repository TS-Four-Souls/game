import { DamageOnStack, DiceRoll, Player } from "./player";
import { type Card, LootCard, type EffectFunction, type TargetsSelector, ItemCard, MonsterCard, InplayType, BsoulCard, type EffectData, EffectOnStack, LootCardEffect } from "./cards";
import { Game } from "./game";
import type { Entity } from "./entity";
import type { StackElement } from "./stack";
import { parseNumber } from "./effectParser";

export function targetSelectorParser(s: string, game: Game): TargetsSelector[] {
    s = s.replace("[Tap Effect]", ""); // remove tap effect marker
    s = s.replace("Paid Effect]", ""); // remove paid effect marker
    s = s.trim();
    s = s.toLowerCase();
    // if (s === "kill a player.")
    // {
    //     console.log("parsing target selector for:", s);
    // }
    const coinStolen = parseNumber(s, /^steal\s+(\d+)\u00A2 from a player\.?$/u);
    // if (s.startsWith("you gain"))
    if (s.includes(" if you do, "))
        return [{ description: "If you do,", selector: IfYouDoTargetSelector(s, game) }];
    if (s.startsWith("choose one-"))
        return [{ description: "Choose one-", selector: chooseOneTargetSelector(s, game) }];
    if (s === "give another non-eternal item you control to another player:" ||
        s === "choose another player. steal a loot card from them at random." ||
        coinStolen !== null) {
        return [{ description: "Choose another player", selector: anotherPlayerSelector(undefined, game) }];
    }
    if (s === "cancel the ↷ or $ ability of an item.")
        return [{ description: "Select a loot card on the stack.", selector: stackElementSelector((element) => element instanceof EffectOnStack, game) }];
    if (s === "cancel the ↷ or $ ability of an item or a loot being played.")
        return [{ description: "Select a loot card on the stack.", selector: stackElementSelector((element) => element instanceof LootCardEffect || element instanceof EffectOnStack, game) }];
    if (s.startsWith("choose a player.") ||
        s === "kill a player.") {
        return [{ description: "Choose a player", selector: playerSelector(undefined, game) }];
    }
    if (s === "[paid effect] remove 3 counters from this:\nkill a player or monster.")
        return [{ description: "Choose a player or monster", selector: activeEntitySelector(undefined, game) }];
    if (s === "choose the player with the most souls or tied for the most. that player destroys a soul they control.") {
        return [{ description: "Choose a player with the most souls or tied for the most.", selector: playerSelector((p) => p.souls.length === Math.max(...game.players.map(p => p.souls.length)), game) }];
    }
    if (s === "choose a dice roll. its controller rerolls it." ||
        s === "change the result of a dice roll to a 1 or 6." ||
        s === "change the result of a dice roll to a number of your choosing." ||
        s === "choose a dice roll. its controller rerolls it.") {
        return [{ description: "Choose a dice roll", selector: rollSelector(undefined, game) }];
    }
    if (s === "add or subtract 1 from a roll.") {
        return [{ description: "Choose a dice roll", selector: rollSelector(undefined, game) },
        { description: "Choose to add or subtract 1", selector: (issuer: Player) => [1, -1] }
        ];
    }
    if (s === "choose a monster. the active player must attack that monster this turn if able.") {
        return [{ description: "Choose a monster", selector: (issuer: Player) => game.monsters }];
    }
    if (s === "choose a non-eternal passive item.")
        return [{ description: "Choose a non-eternal passive item", selector: inplayItemSelector((player: Player, card: ItemCard) => card.eternal === false && card.subtype === "passive", game) }];
    if (s === "choose a non-eternal item. this becomes a copy of that item.\n(this change is indefinite.)")
        return [{ description: "Choose a non-eternal item", selector: inplayItemSelector((player: Player, card: ItemCard) => card.eternal === false, game) }];
    if (s === "choose a non-eternal passive item. this becomes a copy of that item till end of turn.")
        return [{ description: "Choose a non-eternal passive item", selector: inplayItemSelector((player: Player, card: ItemCard) => card.eternal === false && card.subtype === "passive", game) }];
    if (s === "choose a player or monster, then roll- deal damage to them equal to the result." ||
        s === "choose a player or monster, then roll-\ndeal damage to them equal to the result." ||
        s === "choose a player or monster. prevent the next instance of up to 2 damage they would take this turn." ||
        s === "choose a player. prevent the next instance of up to 2 damage they would take this turn." ||
        s === "choose a player or monster. they gain +1 [atk] till end of turn." ||
        s.match(/^deal \d+ damage to a monster or player\.?$/u)
    ) {
        return [{ description: "Choose a player or monster", selector: activeEntitySelector(undefined, game) }];
    }
    if (s === "destroy an item you control.") {
        return [{ description: "Destroy an item you control", selector: inplayItemSelector((player: Player, card: ItemCard) => card.eternal === false && player == game.getOwner(card), game) }];
    }
    if (s === "destroy a curse.")
        return [{ description: "Select a curse.", selector: inplayCurseSelector((player, card) => true, game) }];
    if (s === "recharge an item.") {
        return [{ description: "Select a rechargeable item", selector: inplayUnchargedItemSelector(game) }];
    }
    if (s === "steal a non-eternal item from a player or from the shop.") {
        return [{ description: "Select a non-eternal item from a player or from the shop", selector: visibleItemSelector((card: ItemCard) => card.eternal === false, game) }];
    }
    if (s === "destroy a soul you control.") {
        return [{ description: "Destroy a soul you control", selector: (issuer: Player) => issuer.souls }];
    }
    if (s === "look at the top 5 cards of a deck. put them back in any order."
        || s === "put the top card of any discard on top of its deck."
    )
        return [{ description: "Select a deck", selector: deckSelector(undefined, game) }];
    // if (s === "put the top card of any discard on top of its deck.")
    //     return [{description: "Select a discard top card", selector: 
    //         (issuer: Player) => {
    //             return deckSelector((deckName: string) => game.decks[deckName]!.discard.length > 0, game)(issuer).map(({ deckName }) => game.decks[deckName]!.discard[0]);
    //         }}];
    return [{ description: "", selector: (issuer: Player) => [] }];
}
// export function eachPlayerSelector(game: Game): TargetsSelector {
// }


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

export function visibleItemSelector(filter: (card: ItemCard) => boolean, game: Game): (issuer: Player) => any[] {
    return (issuer: Player) => {
        return game.visibleItems.filter((card) => filter(card));
    };
}

export function playerSelector(filter: (player: Player) => boolean = () => true, game: Game): (issuer: Player) => any[] {
    return (issuer: Player) => {
        return game.players.filter((player) => filter(player)).map(p => p.id);
    };
}

export function anotherPlayerSelector(filter: (player: Player) => boolean = () => true, game: Game): (issuer: Player) => any[] {
    return (issuer: Player) => {
        return playerSelector((player) => player !== issuer && filter(player), game)(issuer);
    };
}

export function activeEntitySelector(filter: (player: Entity) => boolean = () => true, game: Game): (issuer: Player) => any[] {
    return (issuer: Player) => {
        return game.Entities.filter((entity) => filter(entity)).map(e => e.id);
    }
}
export type ChooseOneOptions = {
    description: string;
    admissibleTargets: any[];
}

export const isChooseOneOptions = (x: any): x is ChooseOneOptions => {
    return typeof x === 'object' && x !== null && 'description' in x && 'admissibleTargets' in x;
};
export function IfYouDoTargetSelector(s: string, game: Game): (issuer: Player) => any[] {
    const options = s.split(" if you do, ").map((option) => option.trim()).filter((option) => option.length > 0);
    return (issuer: Player) => {
        const selectors = options.map((option) => targetSelectorParser(option, game)[0]!.selector(issuer));
        return selectors;
    };
}
export function chooseOneTargetSelector(s: string, game: Game): (issuer: Player) => any[] {
    const options = s.substring("choose one-".length).trim().split("\n").map((option) => option.trim()).filter((option) => option.length > 0);
    return (issuer: Player) => {
        const selectors: ChooseOneOptions[] = options.map((option) => ({ description: option, admissibleTargets: targetSelectorParser(option, game)[0]!.selector(issuer) }));
        return selectors;
    };
}
export function deckSelector(filter: (deckName: string) => boolean = () => true, game: Game): (issuer: Player) => any[] {
    return (issuer: Player) => {
        return Object.keys(game.decks).filter((deckName) => filter(deckName)
            && deckName !== "character"
            && deckName !== "eternal"
            && deckName !== "bsoul"
        );
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