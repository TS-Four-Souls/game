import { DamageOnStack, DiceRoll, Player } from "./player";
import { type Card, LootCard, type EffectFunction, type TargetsSelector, ItemCard, MonsterCard, InplayType, BsoulCard, EffectData, EffectOnStack, LootCardEffect } from "./cards";
import { Game } from "./game";
import type { Entity } from "./entity";
import { effect } from "zod/v3";
import type { Stack, StackElement } from "./stack";
import { it } from "zod/locales";
import *  as passive from "./passiveEffect";
import * as active from "./activeEffect";
import type { BonusSoulCardType } from "@/types/cardTypes";
import { parse } from "zod";
import type { Monster } from "./monster";
import { inAnotherplayItemSelector, anotherPlayerSelector, playerSelector, activeEntitySelector, deckSelector, rollSelector, inplayUnchargedItemSelector, inplayCurseSelector, inplayItemSelector, visibleItemSelector, stackElementSelector, YourItemSelector } from "./targetSelector";

/**
 * Represents a parsed effect with both its execution function and target selectors.
 * This unified structure eliminates the need to parse effect strings twice.
 */
export type ParsedEffect = {
    effectFunction: EffectFunction;
    targetSelectors: TargetsSelector[];
};

/**
 * Common selector helpers for effect parsing.
 * These are module-scope functions that create selector arrays on demand.
 */

/**
 * Helper function to create a TargetsSelector with default values.
 */
const createSelector = (
    description: string,
    selector: (player: Player) => any[],
    count: number = 1,
    asMany: boolean = false
): TargetsSelector => ({ description, selector, count, asMany });

const noTargets: TargetsSelector[] = [];

const selectPlayer = (game: Game, count: number = 1, asMany: boolean = false): TargetsSelector[] => 
    [createSelector("Choose a player", playerSelector(() => true, game), count, asMany)];

const selectAnotherPlayer = (game: Game, count: number = 1, asMany: boolean = false): TargetsSelector[] => 
    [createSelector("Choose another player", anotherPlayerSelector(() => true, game), count, asMany)];

const selectMonster = (game: Game, count: number = 1, asMany: boolean = false): TargetsSelector[] => 
    [createSelector("Choose a monster", (issuer: Player) => game.monsters, count, asMany)];

const selectPlayerOrMonster = (game: Game, count: number = 1, asMany: boolean = false): TargetsSelector[] => 
    [createSelector("Choose a player or monster", activeEntitySelector(() => true, game), count, asMany)];

const selectDeck = (game: Game, count: number = 1, asMany: boolean = false): TargetsSelector[] => 
    [createSelector("Select a deck", deckSelector(() => true, game), count, asMany)];

const selectRoll = (game: Game, count: number = 1, asMany: boolean = false): TargetsSelector[] => 
    [createSelector("Choose a dice roll", rollSelector(() => true, game), count, asMany)];

const selectItem = (game: Game, count: number = 1, asMany: boolean = false): TargetsSelector[] => 
    [createSelector("Select a rechargeable item", inplayUnchargedItemSelector(game), count, asMany)];

const selectCurse = (game: Game, count: number = 1, asMany: boolean = false): TargetsSelector[] => 
    [createSelector("Select a curse", inplayCurseSelector((player, card) => true, game), count, asMany)];

const selectNonEternalItem = (game: Game, count: number = 1, asMany: boolean = false): TargetsSelector[] => 
    [createSelector("Choose any non-eternal item", inplayItemSelector((player: Player, card: ItemCard) => card.eternal === false, game), count, asMany)];

const selectAnotherPlayerNonEternalItem = (game: Game, count: number = 1, asMany: boolean = false): TargetsSelector[] => 
    [createSelector("Choose another player's non-eternal item", inAnotherplayItemSelector((player: Player, card: ItemCard) => card.eternal === false, game), count, asMany)];

const selectNonEternalPassiveItem = (game: Game, count: number = 1, asMany: boolean = false): TargetsSelector[] => 
    [createSelector("Choose a non-eternal passive item", inplayItemSelector((player: Player, card: ItemCard) => card.eternal === false && card.activeEffectList.length === 0, game), count, asMany)];

const selectItemYouControl = (game: Game, count: number = 1, asMany: boolean = false): TargetsSelector[] => 
    [createSelector("Destroy an item you control", YourItemSelector((player: Player, card: ItemCard) => card.eternal === false, game), count, asMany)];

const selectSoulYouControl = (game: Game, count: number = 1, asMany: boolean = false): TargetsSelector[] => 
    [createSelector("Destroy a soul you control", (issuer: Player) => issuer.souls, count, asMany)];

const selectNonEternalItemFromAnywhere = (game: Game, count: number = 1, asMany: boolean = false): TargetsSelector[] => 
    [createSelector("Select a non-eternal item from a player or from the shop", visibleItemSelector((card: ItemCard) => card.eternal === false, game), count, asMany)];

const selectPlayerWithMostSouls = (game: Game, count: number = 1, asMany: boolean = false): TargetsSelector[] => 
    [createSelector("Choose a player with the most souls or tied for the most", playerSelector((p) => p.souls.length === Math.max(...game.players.map(p => p.souls.length)), game), count, asMany)];

const selectRollAddOrSubtract = (game: Game): TargetsSelector[] => [
    createSelector("Choose a dice roll", rollSelector(() => true, game)),
    createSelector("Choose to add or subtract 1", (issuer: Player) => [1, -1])
];

const selectLootInYourHand = (game: Game, toDiscard: number = 1, asMany: boolean = false): TargetsSelector[] => 
    [createSelector("Select a loot card in your hand", (issuer: Player) => issuer.hand.cards, toDiscard, asMany)];

const selectUsableAbilityStackElement = (game: Game, count: number = 1, asMany: boolean = false): TargetsSelector[] => 
    [createSelector("Select a loot card on the stack", stackElementSelector((element) => element instanceof EffectOnStack && element.data.it instanceof ItemCard, game), count, asMany)];

const selectStackElementOrLoot = (game: Game, count: number = 1, asMany: boolean = false): TargetsSelector[] => 
    [createSelector("Select a loot card on the stack", stackElementSelector((element) => element instanceof LootCardEffect || element instanceof EffectOnStack, game), count, asMany)];
const selectLootOnStack = (game: Game, count: number = 1, asMany: boolean = false): TargetsSelector[] =>
    [createSelector("Select a loot card on the stack", stackElementSelector((element) => element instanceof EffectOnStack && element.data.it instanceof LootCard, game), count, asMany)];
const selectNumber1to6 = (): TargetsSelector[] => 
    [createSelector("Choose a number (1-6)", () => [1, 2, 3, 4, 5, 6], 1, false)];

function prepareEffectString(s: string): string {
    s.replace("[Tap Effect]", ""); // remove tap effect marker
    s.replace("Paid Effect]", ""); // remove paid effect marker
    s.trim();
    s.toLowerCase();

    return s;
}

function replaceDiceSymbols(s: string): string {
    return s
        .replace(/[❶➀]/g, "1")
        .replace(/[❷➁]/g, "2")
        .replace(/[❸➂]/g, "3")
        .replace(/[❹➃]/g, "4")
        .replace(/[❺➄]/g, "5")
        .replace(/[❻➅]/g, "6");
}

// Returns the numeric amount if matched, otherwise null
export function parseNumber(text: string, re: RegExp): number | null {
    const m = text.trim().match(re);
    return m ? Number(m[1]) : null;
}
export function parseText(text: string, re: RegExp): string {
    const m = text.trim().match(re);
    return m ? m[1]! : "";
}

export type ChooseOneResult = {
    description: string;
    chosenOptions: any[];
};

export const isChooseOneResult = (x: any): x is ChooseOneResult => {
    return typeof x === 'object' && x !== null && 'description' in x && 'chosenOptions' in x;
};

export function parseEachTimeRollEffect(s: string, game: Game): ParsedEffect {
    let rollMatch = s.match(/^each time a player rolls a (\d),? they /u);
    // If "you" is present, handling it requires having both you and they.
    // So far only "they must give you a loot card" is using it.
    if (rollMatch && !s.split(" ").includes("you")) { 
        const rollValue = Number(rollMatch[1]);
        const restOfEffect = s.substring(rollMatch[0]!.length).trim();
        const restParsed = effectParser(restOfEffect, game);
        return {
            effectFunction: passive.onRollEffect([rollValue], restParsed.effectFunction, game, true),
            targetSelectors: restParsed.targetSelectors
        };
    }

    rollMatch = s.match(/^each time a player rolls a (\d),?/u);
    if (rollMatch) {

        const rollValue = Number(rollMatch[1]);
        const restOfEffect = s.substring(rollMatch[0]!.length).trim();
        const restParsed = effectParser(restOfEffect, game);
        return {
            effectFunction: passive.onRollEffect([rollValue], restParsed.effectFunction, game),
            targetSelectors: restParsed.targetSelectors
        };
    }
    throw new Error(`Could not parse 'Each time a player rolls a X' effect: ${s}`);
}

export function parseYouMayEffect(s: string, game: Game): ParsedEffect {
    const restOfEffect = s.substring("you may".length).trim();
    const restParsed = effectParser(restOfEffect, game, active.addInPlayEffect(game), true);
    return {
        effectFunction: async (data:EffectData) => {
            if (data.issuer instanceof Player === false) return false;
            const selection = await game.select(data.issuer, 1, [data.it], true)
            const choice = selection.selected.length > 0;
            if (choice) {
                return restParsed.effectFunction(data);
            }
            return false;
        },
        targetSelectors: restParsed.targetSelectors
    };
}

export function parseAtTheEndOfYourTurnEffect(s: string, game: Game): ParsedEffect {
    const restOfEffect = s.substring("at the end of your turn, ".length).trim();
    const restParsed = effectParser(restOfEffect, game, active.addInPlayEffect(game), true);
    return {
        effectFunction: passive.onYourEventEffect("on:turn:end", [restParsed.effectFunction], game),
        targetSelectors: restParsed.targetSelectors
    };
}

export function parseWhenThisDiesEffect(s: string, game: Game): ParsedEffect {
    const restOfEffect = s.substring("When this dies, ".length).trim();
    const restParsed = effectParser(restOfEffect, game, (data:EffectData) => {throw new Error("Not implemented");}, true);
    return {
        effectFunction: passive.onYourEventEffect("on:death:monster", [restParsed.effectFunction], game),
        targetSelectors: restParsed.targetSelectors
    };
}

export function parseAtTheStartOfYourTurnEffect(s: string, game: Game): ParsedEffect {
    const restOfEffect = s.substring("at the start of your turn, ".length).trim();
    const restParsed = effectParser(restOfEffect, game, active.addInPlayEffect(game), true);
    return {
        effectFunction: passive.onYourEventEffect("on:turn:start", [restParsed.effectFunction], game),
        targetSelectors: restParsed.targetSelectors
    };
}

export function parseOnDamageTakenEffect(s: string, game: Game): ParsedEffect {
    const restOfEffect = s.substring("each time you take damage, ".length).trim();
    const restParsed = effectParser(restOfEffect, game, active.addInPlayEffect(game), true);
    return {
        effectFunction: passive.onDamageTakenEffect([restParsed.effectFunction], game),
        targetSelectors: restParsed.targetSelectors
    };
}

export function parseEachTimeDeclareAttackEffect(s: string, game: Game): ParsedEffect {
    const restOfEffect = s.substring("each time you declare an attack, ".length).trim();
    const restParsed = effectParser(restOfEffect, game, active.addInPlayEffect(game), true);
    return {
        effectFunction: passive.onYourEventEffect("on:attack:declared", [restParsed.effectFunction], game),
        targetSelectors: restParsed.targetSelectors
    };
}

export function parseEachTimeWouldRollEffect(s: string, game: Game): ParsedEffect {
    const restOfEffect = s.substring("each time a player would roll a 1, ".length).trim();
    const restParsed = effectParser(restOfEffect, game, active.addInPlayEffect(game), true);
    const value = parseNumber(s, /^each time a player would roll a (\d),?/u)!;
    return {
        effectFunction: passive.onWouldRollEffect([restParsed.effectFunction], [value], game),
        targetSelectors: restParsed.targetSelectors
    };
}

export function parseCurseEffect(s: string, game: Game): ParsedEffect {
    const restOfEffect = s.trim();
    const restParsed = effectParser(restOfEffect, game, active.addInPlayEffect(game), true);
    return {
        effectFunction: passive.curseEffect(restParsed.effectFunction, game),
        targetSelectors: restParsed.targetSelectors
    };
}

export function effectParser(s: string, game: Game, defaultEffect: EffectFunction = active.addInPlayEffect(game), selectionOnResolve = false): ParsedEffect {
    const originalS = s;
    // if (s === "[Paid Effect] Destroy 2 items you control:\nsteal a non-eternal item from a player."){
    //     console.log("parsing special roll effect:", originalS);
    // }
    s = s.replace("[Tap Effect] ", ""); // remove tap effect marker
    s = s.replace("[Curse Effect] ", ""); // remove curse effect marker
    s = s.toLowerCase();
    s = replaceDiceSymbols(s);
    if(s.startsWith("[curse] "))
        return parseCurseEffect(s.substring(8).trim(), game);
    if (s.startsWith("when you die, ") && s !== "when you die, before paying penalties, give this to another player.") {
        const restParsed = effectParser(s.substring(s.indexOf(",") + 1).trim(), game);
        return {
            effectFunction: passive.onYourEventEffect("on:death:before-penalty", [restParsed.effectFunction], game),
            targetSelectors: restParsed.targetSelectors
        };
    }
    if (s.startsWith("each time you deal combat damage to a monster,")) {
        const restParsed = effectParser(s.substring(s.indexOf(",") + 1).trim(), game);
        return {
            effectFunction: passive.onYourEventEffect("on:combatdamage:dealt:to-monster", [restParsed.effectFunction], game),
            targetSelectors: restParsed.targetSelectors
        };
    }
    if (s.startsWith("each time you die, after paying penalties, ")) {
        const restParsed = effectParser(s.substring(s.indexOf(",", s.indexOf(",")+1) + 1).trim(), game);
        return {
            effectFunction: passive.onYourEventEffect("on:death:after-penalty", [restParsed.effectFunction], game),
            targetSelectors: restParsed.targetSelectors
        };
    }
    if (s.startsWith("at the start of your turn, "))
        return parseAtTheStartOfYourTurnEffect(s, game);
    if (s.startsWith("each time you activate an item, ")) {
        const restParsed = effectParser(s.substring(s.indexOf(",") + 1).trim(), game);
        return {
            effectFunction: passive.onYourEventEffect("on:item:activated", [restParsed.effectFunction], game),
            targetSelectors: restParsed.targetSelectors
        };
    }
    if (s.startsWith("when you would die, ") || s.startsWith("each time you would die, ")) {
        const restParsed = effectParser(s.substring(s.indexOf(",") + 1).trim(), game);
        return {
            effectFunction: passive.onYourEventEffect("on:death:would-death", [restParsed.effectFunction], game),
            targetSelectors: restParsed.targetSelectors
        };
    }
    if (s.startsWith("each time you declare an attack, "))
        return parseEachTimeDeclareAttackEffect(s, game);
    if (s.startsWith("each time a player would roll a "))
        return parseEachTimeWouldRollEffect(s, game);
    if (s.startsWith("at the end of your turn, "))
        return parseAtTheEndOfYourTurnEffect(s, game);
    if (s.startsWith("when this dies, "))
        return parseWhenThisDiesEffect(s, game);
    if (s.startsWith("each time a player rolls a"))
        return parseEachTimeRollEffect(s, game);
    if (s.startsWith("each time you take damage, "))
        return parseOnDamageTakenEffect(s, game);
    if (s.startsWith("you may") &&
    // exceptions where "you may" is not a choice, but an extra action
        !s.startsWith("you may put") &&
        !s.startsWith("you may purchase") && 
        s !== "you may play an additional loot card on your turn." &&
        s !== "you may attack an additional time on your turn." &&
        s !== "you may look at the top card of the treasure deck at any time on your turn."
        )
        return parseYouMayEffect(s, game);
    if (s.startsWith("choose one-"))
        return active.chooseOneEffect(s, game);
    if (s.startsWith("roll-"))
        return active.rollEffect(s, game);
    // if (s.startsWith("discard a loot card:")) {
    //     const restParsed = effectParser(s.substring(21).trim(), game);
    //     return {
    //         effectFunction: (data:EffectData) => {
    //             if (data.issuer instanceof Player === false) return false;
    //             if(data.issuer.hand.length > 0)
    //             {
    //                 const toDiscard = game.select(data.issuer, 1, data.issuer.hand.cards).selected[0]!;
    //                 const index = data.issuer.hand.cards.indexOf(toDiscard);
    //                 game.discardFromHand(data.issuer, index + 1);
    //                 return restParsed.effectFunction(data);
    //             }
    //             return false;
    //         },
    //         targetSelectors: restParsed.targetSelectors
    //     };
    // }
    if (s.startsWith("destroy 2 items you control")) {
        return { effectFunction: active.destroyTwoItemsEffect(game), targetSelectors: selectItemYouControl(game, 2) };
    }
    if (s.startsWith("kill ")) {
        let selector = selectMonster(game);
        if( s.includes("player"))
        {    selector = selectPlayer(game);
            if(s.includes("monster"))
                selector = selectPlayerOrMonster(game);
        }
        return { effectFunction: active.killTargetEffect(game), targetSelectors: selector };
    }
    if (s.startsWith("destroy this.")) {
        const restParsed = effectParser(s.substring(12).trim(), game);
        return {
            effectFunction: (data:EffectData) => { 
                game.destroyCardsOrSouls([data.it]); 
                return restParsed.effectFunction(data);
            },
            targetSelectors: restParsed.targetSelectors
        };
    }
    if (s.startsWith("put a counter on this."))
        return { effectFunction: active.putCountersOnItemEffect(1, game), targetSelectors: noTargets };
    if(s.includes(", then")){
        const parts = s.split(", then");
        const firstTrimmed = parts[0]!.trim();
        const secondTrimmed = parts[1]!.trim();
        const firstParsed = effectParser(firstTrimmed, game);
        const secondParsed = effectParser(secondTrimmed, game);
        return {
            effectFunction: async (data:EffectData) => {
                await firstParsed.effectFunction(data);
                await secondParsed.effectFunction(data);
                return true;
            },
            targetSelectors: [...firstParsed.targetSelectors, ...secondParsed.targetSelectors]
        };
    }
    if(s.includes(" if you do, ")){
        const parts = s.split(" if you do, ");
        const firstParsed = effectParser(parts[0]!.trim(), game);
        const secondParsed = effectParser(parts[1]!.trim(), game);
        return {
            effectFunction: async (data:EffectData) => {
                if(await firstParsed.effectFunction(data))
                    await secondParsed.effectFunction(data);
                return true;
            },
            targetSelectors: [...firstParsed.targetSelectors, ...secondParsed.targetSelectors]
        };
    }

    const gainAmount = parseNumber(s, /^gain\s+(\d+)\u00A2\.?,?$/u);
    if (gainAmount !== null)
        return { effectFunction: active.gainCoinsEffect(game, gainAmount), targetSelectors: noTargets }; 
    const coinStolen = parseNumber(s, /^steal\s+(\d+)\u00A2 from a(nother)? player\.?$/u);
    if (coinStolen !== null)
        return { effectFunction: active.stealCoinsEffect(game, coinStolen), targetSelectors: selectAnotherPlayer(game) };
        
    const deckName = parseText(s, /look at the top 5 cards of the (\w+) deck\. put 1 on top and the rest on the bottom\./u);
    if (deckName !== "")
    {
        return { effectFunction: active.look5Put1TopRestBottomEffect(deckName, game), targetSelectors: noTargets };
    }

    const treasureAmount = parseNumber(s, /^gain \+(\d+) treasures?\.?$/u);
    if (treasureAmount !== null)
        return { effectFunction: active.gainTreasuresEffect(game, treasureAmount), targetSelectors: noTargets };

    const loseAmount = parseNumber(s, /^lose\s+(\d+)\u00A2\.?$/u);
    if (loseAmount !== null)
        return { effectFunction: active.loseCoinsEffect(game, loseAmount), targetSelectors: noTargets };
    
    const nbToLoot = parseNumber(s, /^loot\s+(\d+)\.?$/u);
    if (nbToLoot !== null)
        return { effectFunction: active.lootCardsEffect(game, nbToLoot), targetSelectors: noTargets };
    const HPToPay = parseNumber(s, /^pay\s+(\d+) \[hp\] ?\.?$/u);
    if (HPToPay !== null)
        return { effectFunction: active.payHealthEffect(game, HPToPay), targetSelectors: noTargets };
    const coinsToPay = parseNumber(s, /^pay\s+(\d+)\u00A2:?$/u);
    if (coinsToPay !== null)
        return { effectFunction: active.payCoinsEffect(game, coinsToPay), targetSelectors: noTargets };
    const eachPlayerGains = parseNumber(s, /^each player gains\s+(\d+)\u00A2\.?$/u);
    if (eachPlayerGains !== null)
        return { effectFunction: active.eachPlayerGainsCoinsEffect(game, eachPlayerGains), targetSelectors: noTargets };
    let toDiscard =  /discard [1a] loot card\.?/.test(s) ? 1 : null;
    if (toDiscard === null)
        toDiscard = parseNumber(s, /^discard (\d+) loot cards?\.?$/u);
    if( toDiscard !== null)
        return { effectFunction: active.discardNLootCardsEffect(toDiscard, game), targetSelectors: selectLootInYourHand(game, toDiscard) };
    const eachPlayerLoots = parseNumber(s, /^each player loots\s+(\d+)\.?$/u);
    if (eachPlayerLoots !== null)
        return { effectFunction: active.eachPlayerLootsEffect(game, eachPlayerLoots), targetSelectors: noTargets };
    const deckName1 = parseText(s, /^look at the top 4 cards of the (\w+) deck\. you may put them back in any order\.?$/u);
    if (deckName1 !== "")
        return { effectFunction: active.lookAndOrderEffect(deckName1, 4, game), targetSelectors: noTargets };
    const damageToEachPlayer = parseNumber(s, /^each player takes (\d+) damage\.?!?$/u);
    if (damageToEachPlayer !== null)
        return { effectFunction: active.dealDamageToEachPlayerEffect(game, damageToEachPlayer), targetSelectors: noTargets };
    const damageToEachMonster = parseNumber(s, /^each monster takes (\d+) damage\.?$/u);
    if (damageToEachMonster !== null)
        return { effectFunction: active.dealDamageToEachMonsterEffect(game, damageToEachMonster), targetSelectors: noTargets };
    const damageToTake = parseNumber(s, /^take (\d+) damage\.?!?$/u);
    if (damageToTake !== null)
        return { effectFunction: active.takeDamageEffect(game, damageToTake), targetSelectors: noTargets };
    const damageToTake2 = parseNumber(s, /^take (\d+) damage and gain \d+\u00A2\.?$/u);
    const coins = parseNumber(s, /^take \d+ damage and gain (\d+)\u00A2\.?$/u);
    if (damageToTake2 !== null && coins !== null)
        return { effectFunction: active.takeDamageGainCoinsEffect(s, damageToTake2, coins, game), targetSelectors: noTargets };
    let damageToDeal = parseNumber(s, /^deal (\d+) damage to a monster or player\.?$/u);
    if( damageToDeal === null )
      damageToDeal = parseNumber(s, /^deal (\d+) damage to a player\.?$/u);
    if (damageToDeal === null)
      damageToDeal = parseNumber(s, /^deal (\d+) damage to a monster\.?$/u);
    if(s === "deal 1 damage to them.")
        damageToDeal = 1;
    if (damageToDeal !== null)
        return { effectFunction: active.dealDamageToTargetEffect(game, damageToDeal), targetSelectors: selectPlayerOrMonster(game) };
    const slot = parseText(s, /^expand (\w+)s? slot/u)
    if (slot !== "")
    {
        const numberToExpand = parseNumber(s, /^expand \w+ slots by (\d+)./u);
        if (numberToExpand === null)
            throw new Error(`Could not parse number of slots to expand in effect: ${s}`);
        return { effectFunction: active.expandSlotsEffect(slot, numberToExpand, game), targetSelectors: noTargets };
    }
    let countersToRemove = parseNumber(s, /^remove (\d+) counters? from this\.?$/u);
    if (countersToRemove === null)
        countersToRemove = /remove a counter from this.?/.test(s) ? 1 : null;
    if( countersToRemove !== null)
        return { effectFunction: active.removeCountersEffect(game, countersToRemove), targetSelectors: noTargets };
    const toAdd = parseNumber(s, /^add \+? ?(\d+) to a dice roll\.?$/u);
    if( toAdd !== null)
        return { effectFunction: active.addToDiceRollEffect(game, toAdd), targetSelectors: selectRoll(game) };
    
    // Parse standard string-matched effects
    const standardEffect = parseStandardEffect(s, game, selectionOnResolve);
    if (standardEffect !== null) {
        return standardEffect;
    }

    // multiple effects separated by ., try to parse them individually.
    // To do so, replace by ", then " and parse again.
    if (s.indexOf(".") !== s.length - 1 && s.indexOf(".") !== -1) 
    {
        s = s.replace(".", ", then ");
        return effectParser(s, game, defaultEffect, selectionOnResolve);
    }
    return { effectFunction: defaultEffect, targetSelectors: noTargets };
}

/**
 * Parse standard string-matched effects that don't require special handling.
 * Returns null if no match is found.
 * Returns a complete ParsedEffect with inline target selectors.
 */
function parseStandardEffect(s: string, game: Game, selectionOnResolve: boolean): ParsedEffect | null {
    switch (s) {
        // passive effects
        case "the next time a player would loot, they loot from the top of the loot discard instead.":
            return { effectFunction: passive.lootFromDiscardEffect(game), targetSelectors: selectPlayer(game) };
        case "if you control this as the game starts, you go first.":
            return { effectFunction: passive.goFirstInTurnOrderEffect(game), targetSelectors: noTargets };
        case "damage you would take is reduced to 1.":
            return { effectFunction: passive.reduceDamageToOneEffect(game), targetSelectors: noTargets };
        case "this enters play deactivated.":
            return { effectFunction: passive.enterPlayDeactivatedEffect(game), targetSelectors: noTargets };
        case "shop items you purchase cost 5¢ less.":
            return { effectFunction: passive.shopItemsCostLessEffect(5, game), targetSelectors: noTargets };
        case "when you would roll a 1, you may change the result to a 6.":
            return { effectFunction: passive.changeRollOneToSixEffect(game), targetSelectors: noTargets };
        case "when you die, before paying penalties, give this to another player.":
            return { effectFunction: passive.giveThisToAnotherPlayerOnDeathEffect(game), targetSelectors: noTargets };
        case "each time you die, before paying penalties, gain 8¢.":
            return { effectFunction: passive.beforeDeathPenaltyEffect([active.gainCoinsEffect(game, 8)], game), targetSelectors: noTargets };
        case "each time you die, before paying penalties, loot 3.":
            return { effectFunction: passive.beforeDeathPenaltyEffect([active.lootCardsEffect(game, 3)], game), targetSelectors: noTargets };
        case "if this would be destroyed, it becomes a soul instead.":
            return { effectFunction: passive.becomeSoulInsteadOfDestructionEffect(game), targetSelectors: noTargets };
        case "the first time you take damage each turn, you may recharge an item.":
            return { effectFunction: passive.onFirstDamageEachTurnEffect([active.rechargeItemsEffect(game, true)], game), targetSelectors: noTargets };
        case "when you start the game, look at the top 3 cards of the treasure deck and choose one. it becomes your starting item and gains eternal. put the rest on the bottom of the treasure deck.":
            return { effectFunction: passive.startingItemEffect(game), targetSelectors: noTargets };
        case "choose a monster or player. the next instance of damage they take this turn is reduced to 1.":
            return { effectFunction: passive.setNextDamageToXEffect(1, game), targetSelectors: selectPlayerOrMonster(game) };
        case "loot +1 during your loot step.":
            return { effectFunction: passive.lootStepEffect([active.lootCardsEffect(game, 1)], game), targetSelectors: noTargets };
        case "prevent the next 1 damage you would take this turn.":
            return { effectFunction: passive.preventNextDamageUpToEffect(1, game), targetSelectors: noTargets };
        case "if another player would pay the death penalty, you choose what item they would destroy and you gain any loot cards and ¢ they would lose.":
            return { effectFunction: passive.replaceDeathPenaltyEffect(game), targetSelectors: noTargets };
        case "while you have 0¢, you have +1 to your attack rolls.":
            return { effectFunction: passive.ConditionalStatModifierEffect([game.addAttackDiceModifier.bind(game)], 1, (player: Player) => player.coins === 0, ["on:coin:gained:after","on:coin:lost:after"], game, false), targetSelectors: noTargets };
        case "when you have 0 loot cards in your hand, you have +1 [atk] .":
            return { effectFunction: passive.ConditionalStatModifierEffect([game.addAttack.bind(game)], 1, (player: Player) => player.hand.length === 0, ["on:loot:added:after","on:loot:removed:after"], game), targetSelectors: noTargets };
        case "choose a player. prevent the next 1 damage they would take this turn.":
            return { effectFunction: passive.preventNextDamageUpToEffect(1, game), targetSelectors: selectPlayer(game) };
        case "choose a player or monster. prevent the next instance of damage they would take this turn.":
            return { effectFunction: passive.preventNextDamageUpToEffect(Infinity, game), targetSelectors: selectPlayerOrMonster(game) };
        case "choose a player or monster. prevent the next instance of up to 2 damage they would take this turn.":
        case "choose a player. prevent the next instance of up to 2 damage they would take this turn.":
            return { effectFunction: passive.preventNextDamageUpToEffect(2, game), targetSelectors: selectPlayerOrMonster(game) };
        case "choose a player. till end of turn, if they would loot any number of loot cards, they loot double that number instead.":
            return { effectFunction: passive.lootDoubleThisTurnEffect(game), targetSelectors: selectPlayer(game) };
        case "before a dice is rolled, choose a number. if the next roll is that number, loot 3.":
            return { effectFunction: passive.lootOnNextRollEffect(game), targetSelectors: selectNumber1to6() };
        case "other players can't play loot cards or activate items on your turn.":
            return { effectFunction: passive.noPriorityPassesOnYourTurnEffect(game), targetSelectors: noTargets };
        case "the next time you play a non-trinket, non-ambush loot card this turn, copy it.":
            return { effectFunction: passive.copyNextNonTrinketNonAmbushLootThisTurnEffect(game), targetSelectors: noTargets };
        case "you gain +1 [atk] till the end of turn.":
            return { effectFunction: passive.temporaryStatModifierEffect([game.addAttack.bind(game)], 1, game), targetSelectors: noTargets };
        case "prevent the next 1 damage you would take this turn. when you prevent damage this way, deal 1 damage to another player.":
            return { effectFunction: passive.preventDamageAndDealDmgOnPreventEffect(1, 1, game), targetSelectors: selectAnotherPlayer(game) };
        case "choose a player or monster. they gain +1 [atk] till end of turn.":
        case "gain +1 [atk] till end of turn.":
            return { effectFunction: passive.temporaryStatModifierEffect([game.addAttack.bind(game)], 1, game), targetSelectors: selectPlayerOrMonster(game) };
        case "if you would take any amount of damage, take that much damage +1 instead.":
            return { effectFunction: passive.takeDamagePlusEffect(1, game), targetSelectors: noTargets };
        case "you gain +1 [hp] till the end of turn.":
        case "gain +1 [hp] till end of turn.":
            return { effectFunction: passive.temporaryStatModifierEffect([game.addHealth.bind(game)], 1, game), targetSelectors: noTargets };
        case "choose a player.\nthey gain +2 [hp] till end of turn.":
            return { effectFunction: passive.temporaryStatModifierEffect([game.addHealth.bind(game)], 2, game), targetSelectors: selectPlayer(game) };
        case "choose a player.\nthey gain +1 [atk] and +1 [hp] till end of turn.":
            return { effectFunction: passive.temporaryStatModifierEffect([game.addAttack.bind(game), game.addHealth.bind(game)], 1, game), targetSelectors: selectPlayer(game) };
        case "choose a player.\nthey gain +1 [atk] and +1 to dice rolls till end of turn.":
            return { effectFunction: passive.temporaryStatModifierEffect([game.addAttack.bind(game), game.addAttackDiceModifier.bind(game)], 1, game), targetSelectors: selectPlayer(game) };
        case "choose a player.\nthey gain +1 [atk] till end of turn and may attack an additional time this turn.":
            return { effectFunction: passive.temporaryStatModifierEffect([game.addAttack.bind(game), game.addAttackThisTurn.bind(game)], 1, game), targetSelectors: selectPlayer(game) };
        case "the active player may attack an additional time this turn.":
            return { effectFunction: passive.temporaryStatModifierEffect([game.addAttackThisTurn.bind(game)], 1, game), targetSelectors: noTargets };
        case "play an additional loot card this turn.":
            return { effectFunction: passive.temporaryStatModifierEffect([game.addLootPlay.bind(game)], 1, game), targetSelectors: noTargets };
        case "each time a player dies, before paying penalties, loot 1.":
            return { effectFunction: passive.lootOnPlayerDeathEffect(1, game), targetSelectors: noTargets };
        case "if you would gain any number of \u00A2, gain that much +1\u00A2 instead.":
            return { effectFunction: passive.gainPlusCoinsEffect(1, game), targetSelectors: noTargets };
        case "this item starts with 9 counters on it.":
            return { effectFunction: passive.startWithNCountersEffect(9, game), targetSelectors: noTargets };
        case "if you would take damage while this has counters on it, remove that many counters and prevent that much damage.":
            return { effectFunction: passive.preventDamageByRemovingCountersEffect(game), targetSelectors: noTargets };
        case "gain +1 [atk] for your first attack roll each turn.":
            return { effectFunction: passive.firstAttackRollStatModifierEffect(1, 0, 0, game), targetSelectors: noTargets };
        case "you have +1 [atk] for your first attack roll each turn.":
            return { effectFunction: passive.firstAttackRollStatModifierEffect(1, 0, 0, game), targetSelectors: noTargets };
        case "each time you would take damage, roll-\n6: prevent 1 of that damage.":
            return { effectFunction: passive.preventDamageOnRollEffect([6], 1, game), targetSelectors: noTargets };
        case "+1 [hp]":
            return { effectFunction: passive.permanentStatModifierEffect([game.addHealth.bind(game)], 1, game), targetSelectors: noTargets };
        case "+1 [atk]":
            return { effectFunction: passive.permanentStatModifierEffect([game.addAttack.bind(game)], 1, game), targetSelectors: noTargets };
        case "if you would gain any amount of ¢, this levels up by that much instead.":
            return { effectFunction: passive.gainCoinsLevelUpEffect(game), targetSelectors: noTargets };
        case "[lv1 effect] you have +2 to your first attack roll each turn.":
            return { effectFunction: passive.firstAttackRollStatModifierEffect(2, 0, 0, game), targetSelectors: noTargets };
        case "[lv10 effect] you have +1 [atk] .":
            return { effectFunction: passive.lvlXaddListenerEffect([passive.permanentStatModifierEffect([game.addAttack.bind(game)], 1, game)], 10, game), targetSelectors: noTargets };
        case "[lv25 effect] you may attack any number of times on your turn.":
            return { effectFunction: passive.lvlXaddListenerEffect([passive.onYourTurnModifier([game.addAttackThisTurn.bind(game)], 1, game)], 25, game), targetSelectors: noTargets };
        case "you have +1 to attack rolls.":
            return { effectFunction: passive.permanentStatModifierEffect([game.addAttackDiceModifier.bind(game)], 1, game), targetSelectors: noTargets };
        case "monsters have +1 [dc] on your turn.":
            return { effectFunction: passive.onYourTurnModifier([game.addDCmuliplier.bind(game)], 1, game), targetSelectors: noTargets };
        case "you may look at the top card of the treasure deck at any time on your turn.":
            return { effectFunction: passive.onYourTurnModifier([game.addCanSeeTopOfTreasureDeck.bind(game)], 1, game), targetSelectors: noTargets };
        case "you may purchase an additional time on your turn.":
            return { effectFunction: passive.onYourTurnModifier([game.addPurchaseThisTurn.bind(game)], 1, game), targetSelectors: noTargets };
        case "you may attack an additional time on your turn.":
            return { effectFunction: passive.onYourTurnModifier([game.addAttackThisTurn.bind(game)], 1, game), targetSelectors: noTargets };
        case "each time a monster dies, gain 3¢.":
            return { effectFunction: passive.gainCoinsOnMonsterDeathEffect(3, game), targetSelectors: noTargets };
        case "you may play an additional loot card on your turn.":
            return { effectFunction: passive.onYourTurnModifier([game.addLootPlay.bind(game)], 1, game), targetSelectors: noTargets };
        case "each time you roll an attack roll of 6, deal 1 damage to each other player.":
            return { effectFunction: passive.onAttackRollEffect([6],active.dealDamageToEachOtherPlayerEffect(game, 1), game), targetSelectors: noTargets };
        // active effects
        case "deal 1 damage to another player.":
            // Example of inline target selector specification
            return {
                effectFunction: active.dealDamageToAnotherPlayerEffect(game, 1),
                targetSelectors: selectAnotherPlayer(game)
            };
        case "put counters on this equal to the amount of damage taken. then, if this has 6+ counters, remove 6 counters from this and gain +1 treasure.":
            return { effectFunction: active.addCountersAndGainTreasureEffect(6, 1, game), targetSelectors: noTargets };
        case "if you have 0¢, gain 6¢.":
            return { effectFunction: active.gainXCoinsIfYEffect(0, 6, game), targetSelectors: noTargets };
        case "if you have 8 or more loot cards in your hand, loot 2.":
            return { effectFunction: active.lootXIfYEffect(8, true, 2, game), targetSelectors: noTargets };
        case "if you have 0 loot cards in your hand, loot 2.":
            return { effectFunction: active.lootXIfYEffect(0, false, 2, game), targetSelectors: noTargets };
        case "choose a player or monster":
            return { effectFunction: (data:EffectData) => { return true; }, targetSelectors: selectPlayerOrMonster(game) };
        case "each other player takes 1 damage.":
            return { effectFunction: active.dealDamageToEachOtherPlayerEffect(game, 1), targetSelectors: noTargets };
        case "prevent death. if it's your turn, cancel everything that hasn't resolved and end it.":
            return { effectFunction: active.preventDeathEndTurnEffect(game), targetSelectors: noTargets };
        case "prevent death. if it's your turn, cancel everything that hasn't resolved and end your turn.":
            return { effectFunction: active.preventDeathEndTurnEffect(game), targetSelectors: noTargets };
        case "discard any number of loot cards":
            return { effectFunction: active.discardAnyNumberOfLootCardsEffect(game), targetSelectors: noTargets };
        case "give another non-eternal item you control to another player": 
            return { effectFunction: active.giveItemToAnotherPlayerEffect(game), targetSelectors: [selectItemYouControl(game)[0]!, selectAnotherPlayer(game)[0]!] };
        case "look at the top 5 cards of a deck. put them back in any order.":
            return { effectFunction: active.lookAndReorderTopCardsEffect(game), targetSelectors: selectDeck(game) };
        case "put the top card of any discard on top of its deck.":
            return { effectFunction: active.putTopCardFromDiscardOnTopEffect(game), targetSelectors: selectDeck(game) };
        case "choose a dice roll. its controller rerolls it.":
            return { effectFunction: active.rerollDiceEffect(), targetSelectors: selectRoll(game) };
        case "they must give you a loot card.":
            return { effectFunction: active.makePlayerGiveLootCardEffect(game), targetSelectors: noTargets };
        case "add or subtract 1 from a roll.":
            return { effectFunction: active.addOrSubtract1FromRollEffect(game), targetSelectors: selectRollAddOrSubtract(game) };
        case "recharge your character.":
            return { effectFunction: active.rechargeCharaEffect(game), targetSelectors: noTargets };
        case "put a card from your hand on top of the loot deck.":
            return { effectFunction: active.putCardFromHandOnTopOfDeckEffect(game), targetSelectors: noTargets };
        case "recharge an item.":
            return { effectFunction: active.rechargeItemsEffect(game, selectionOnResolve), targetSelectors: selectItem(game) };
        case "put the top card of a deck into discard.":
            return { effectFunction: active.discardTopOfDeckEffect(game), targetSelectors: selectDeck(game) };
        case "look at the top card of the loot deck. you may put it on the bottom.":
            return { effectFunction: active.LookAndPutBottomEffect("loot", game), targetSelectors: noTargets };
        case "look at the top card of the monster deck. you may put it on the bottom.":
            return { effectFunction: active.LookAndPutBottomEffect("monster", game), targetSelectors: noTargets };
        case "look at the top card of the treasure deck, you may put it on the bottom.":
            return { effectFunction: active.LookAndPutBottomEffect("treasure", game), targetSelectors: noTargets };
        case "recharge another item.":
            return { effectFunction: active.rechargeItemsEffect(game, selectionOnResolve), targetSelectors: selectItem(game) };
        case "look at a player's hand. you may swap a card from your hand with one of theirs.":
            return { effectFunction: active.lookAtPlayerHandAndSwapEffect(game), targetSelectors: selectPlayer(game) };
        case "look at their hand and steal a loot card from them.":
            return { effectFunction: active.lookAtHandAndStealLootEffect(game), targetSelectors: noTargets };
        case "force that player to reroll it.":
            return { effectFunction: active.forcePlayerRerollDiceEffect(game), targetSelectors: noTargets };
        case "destroy a curse.":
            return { effectFunction: active.destroyOneEffect(game), targetSelectors: selectCurse(game) };
        case "shuffle the treasure deck.":
            return { effectFunction: active.shuffleTreasureDeckEffect(game), targetSelectors: noTargets };
        case "search the treasure deck for a guppy item, gain it":
            return { effectFunction: active.searchGuppyItemEffect(game), targetSelectors: noTargets };
        case "choose a player at random. that player destroys an item they control.":
            return { effectFunction: active.destroyItemOfRandomPlayerEffect(game), targetSelectors: noTargets };
        case "destroy an item or soul.":
            return { effectFunction: active.destroyOneEffect(game), targetSelectors: selectNonEternalItem(game) };
        case "destroy another item":
            return { effectFunction: active.destroyOneEffect(game), targetSelectors: selectNonEternalItem(game) };
        case "destroy an item you control.":
            return { effectFunction: active.destroyOneEffect(game), targetSelectors: selectItemYouControl(game) };
        case "destroy a soul you control.":
            return { effectFunction: active.destroyOneEffect(game, true), targetSelectors: selectSoulYouControl(game) };
        case "each player votes on an item in play. destroy the item with the most votes. if there is a tie, nothing happens.":
            return { effectFunction: active.eachPlayersVoteToDestroyItemEffect(game), targetSelectors: noTargets };
        case "swap this with a non-eternal item another player controls.":
            return {
              effectFunction: active.swapWithNonEternalItemEffect(game),
              targetSelectors: selectAnotherPlayerNonEternalItem(game),
            };
        case "this copies a ↷ ability of a non-eternal item.":
            return { effectFunction: active.copyTapAbilityEffect(game), targetSelectors: selectNonEternalItem(game) };
        case "choose a non-eternal item. this becomes a copy of that item.\n(this change is indefinite.)":
            return { effectFunction: active.becomesCopyOfItemIndefinitelyEffect(game), targetSelectors: selectNonEternalItem(game) };
        case "choose a non-eternal passive item. this becomes a copy of that item till end of turn.":
            return { effectFunction: active.becomesCopyOfItemUntilEndOfTurnEffect(game), targetSelectors: selectNonEternalPassiveItem(game) };
        case "you may put any number of shop items into discard.":
            return { effectFunction: active.discardAnyNumberOfShopItemsEffect(game), targetSelectors: noTargets };
        case "cancel the ↷ or $ ability of an item.":
            return { effectFunction: active.cancelStackElementEffect(game), targetSelectors: selectUsableAbilityStackElement(game) };
        case "put any number of non-event monster cards in discard on top of the monster deck.":
            return { effectFunction: active.putAnyNumberFromDiscardOnTopEffect("monster", game), targetSelectors: noTargets };
        case "steal a soul from another player.":
            return { effectFunction: active.stealSoulEffect(game), targetSelectors: selectAnotherPlayer(game) };
        case "put this into discard.": // this should be only used in events
            return { effectFunction: active.putThisIntoDiscardEffect(game), targetSelectors: noTargets };
        case "steal a non-eternal item from a player.":
            return { effectFunction: active.stealNonEternalItemEffect(game), targetSelectors: selectAnotherPlayerNonEternalItem(game) };
        case "steal a non-eternal item a player controls.":
            return { effectFunction: active.stealNonEternalItemEffect(game), targetSelectors: selectAnotherPlayerNonEternalItem(game) };
        case "loot equal to the number of cards discarded in this way.":
            return { effectFunction: active.lootEqualToCardsDiscardedEffect(game), targetSelectors: noTargets };
        case "subtract up to 2 from a roll.":
            return { effectFunction: active.subtractUpTo2FromRollEffect(game), targetSelectors: selectRoll(game) };
        case "add up to 2 to a non-attack roll.":
            return { effectFunction: active.addUpTo2ToNonAtkRollEffect(game), targetSelectors: selectRoll(game) };
        case "each player votes on an item in play. destroy the item with the most votes. If there is a tie, nothing happens.":
            return { effectFunction: active.eachPlayersVoteToDestroyItemEffect(game), targetSelectors: noTargets };
        case "add 1 to a roll.":
            return { effectFunction: active.add1ToRollEffect(), targetSelectors: selectRoll(game) };
        case "swap a non-eternal item you control with a non-eternal item they control.":
            return { effectFunction: active.swapNonEternalItemsEffect(game), targetSelectors: [selectItemYouControl(game)[0]!, selectAnotherPlayerNonEternalItem(game)[0]!] };
        case "choose a player. loot and gain ¢ until you have the same number of each as they do.":
            return { effectFunction: active.lootAndGainAsPlayerEffect(game), targetSelectors: selectPlayer(game) };
        case "you may put a monster not being attacked into discard and replace it with the top card of the monster deck.":
            return { effectFunction: active.flushOneMonsterSlotEffect(game), targetSelectors: noTargets };
        case "you may put the top card of the monster deck in a monster slot not being attacked.":
            return { effectFunction: active.putTopMonsterInValidSlotEffect(game), targetSelectors: noTargets };
        case "when this enters play, it becomes a soul.\n(it's no longer an item.)":
            return { effectFunction: active.enterPlayBecomeSoulEffect(game), targetSelectors: noTargets };
        case "cancel the ↷ or $ ability of an item or a loot being played.":
            return { effectFunction: active.cancelPreviousNonRollEffect(game), targetSelectors: selectStackElementOrLoot(game) };
        case "put each monster not being attacked into discard and replace each with the top card of the monster deck.":
            return { effectFunction: active.flushMonsterSlotsEffect(game), targetSelectors: noTargets };
        case "put each monster not being attacked on the bottom of the monster deck.":
            return { effectFunction: active.flushMonsterSlotsToBottomEffect(game), targetSelectors: noTargets };
        case "look at each player's hand":
            return { effectFunction: active.lookAtHands(game), targetSelectors: noTargets };
        case "look at the top card of a deck. you may put that card on the bottom of that deck.":
            return { effectFunction: active.lookAtTopCardOfDeckEffect(game, "bottom"), targetSelectors: selectDeck(game) };
        case "reveal the top card of any deck. put it back or put it into discard.":
            return { effectFunction: active.lookAtTopCardOfDeckEffect(game, "discard", true), targetSelectors: selectDeck(game) };
        case 'choose a player. they reroll each item they control.':
            return { effectFunction: active.rerollEachItemEffect(game), targetSelectors: selectPlayer(game) };
        case "choose another player. steal a loot card from them at random.":
            return { effectFunction: active.stealRandomLootCardEffect(game), targetSelectors: selectAnotherPlayer(game) };
        case "choose a monster. the active player must attack that monster this turn if able.":
            return { effectFunction: active.forceAttackMonsterEffect(game), targetSelectors: selectMonster(game) };
        case "you may play any number of additional loot cards till end of turn.":
            return { effectFunction: active.playUnlimitedLootCardsThisTurnEffect(game), targetSelectors: noTargets };
        case "choose a player. recharge each item they control.":
            return { effectFunction: active.rechargeEachItemsOfTargetEffect(game), targetSelectors: selectPlayer(game) };
        case "destroy this and loot 2.":
            return { effectFunction: active.destroyThisAndLoot2Effect(game), targetSelectors: noTargets };
        case "choose a player. that player gives you a loot card.":
            return { effectFunction: active.makePlayerGiveLootCardEffect(game), targetSelectors: selectPlayer(game) };
        case "look at the top card of a deck.":
            return { effectFunction: active.lookAtTopCardOfDeckEffect(game, "just_watch"), targetSelectors: selectDeck(game) };
        case "end the turn. cancel everything that hasn't resolved.":
            return { effectFunction: active.endTurnAndResetStackEffect(game), targetSelectors: noTargets };
        
        case "choose the player with the most souls or tied for the most. that player destroys a soul they control.":
            return { effectFunction: active.makeAPlayerWithMostSoulsDestroyASoulEffect(game), targetSelectors: selectPlayerWithMostSouls(game) };

        case "put the top card of each deck into discard.":
            return { effectFunction: active.putTopCardOfEachDeckIntoDiscardEffect(game), targetSelectors: noTargets };
        case "each player gives their hand to the player to their left.":
            return { effectFunction: active.passHandsLeftEffect(game), targetSelectors: noTargets };
        case "steal a non-eternal item from a player or from the shop.":
            return { effectFunction: active.stealNonEternalItemFromAnywhereEffect(game), targetSelectors: noTargets };
        
        case "look at the top card of each deck. you may put any of those cards on the bottom of their deck":
            return { effectFunction: active.look1EachDeckEffect(game), targetSelectors: noTargets };
        case "this becomes a soul and loses all abilities.":
            return { effectFunction: active.BecomesSoulEffect(game), targetSelectors: noTargets };
        case "put this on the bottom of the loot deck.":
            return { effectFunction: active.putThisOnBottomOfLootDeckEffect(game), targetSelectors: noTargets };
        case "take an extra turn after this one if it's your turn.":
            return { effectFunction: active.takeExtraTurnEffect(game), targetSelectors: noTargets };

        case "choose a dice roll. its controller rerolls it.":
            return { effectFunction: active.rerollDiceByControllerEffect(game), targetSelectors: selectRoll(game) };

        case "change the result of a dice roll to a number of your choosing.":
            return { effectFunction: active.changeRollDiceResultEffect(game), targetSelectors: selectRoll(game) };

        case "change the result of a dice roll to a 1 or 6.":
            return { effectFunction: active.changeRollTo1Or6Effect(game), targetSelectors: selectRoll(game) };

        case "put a loot card from your hand on top of the loot deck.":
            return { effectFunction: active.putLootCardFromHandOnTopOfDeckEffect(game), targetSelectors: noTargets };
        case "reroll an item. (destroy that item and replace it with the top card of the treasure deck.)":
        case "reroll an item.\n(destroy that item and replace it with the top card of the treasure deck.)":
            return { effectFunction: active.rerollItemEffect(game), targetSelectors: selectNonEternalItem(game) };
        case "put each shop item on the bottom of the treasure deck.":
            return { effectFunction: active.flushShopToBottomEffect(game), targetSelectors: noTargets };
        case "that player gives you a loot card.":
            return { effectFunction: active.playerGivesLootCardEffect(game), targetSelectors: noTargets };
        case "put a non-event monster card in discard on top of the monster deck.":
            return { effectFunction: active.putMonsterFromDiscardOnTopEffect(game), targetSelectors: noTargets };
        case "recharge this.":
            return { effectFunction: active.rechargeThisEffect(game), targetSelectors: noTargets };
        case "this becomes a soul. gain it.":
            return { effectFunction: active.thisBecomeSoulGainItEffect(game), targetSelectors: noTargets };
        default:
            return null; // No match found
        }
}
