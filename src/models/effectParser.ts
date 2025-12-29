import { DamageOnStack, DiceRoll, Player } from "./player";
import { type Card, LootCard, type EffectFunction, type TargetsSelector, ItemCard, MonsterCard, InplayType, BsoulCard, type EffectData, EffectOnStack, LootCardEffect } from "./cards";
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

export function parseEachTimeRollEffect(s: string, game: Game): EffectFunction {
    let rollMatch = s.match(/^each time a player rolls a (\d),? they /u);
    // If "you" is present, handling it requires having both you and they.
    // So far only "they must give you a loot card" is using it.
    if (rollMatch && !s.split(" ").includes("you")) { 
        const rollValue = Number(rollMatch[1]);
        const restOfEffect = s.substring(rollMatch[0]!.length).trim();
        const restEffectFunction = effectParser(restOfEffect, game);
        return passive.onRollEffect([rollValue], restEffectFunction, game, true);
    }

    rollMatch = s.match(/^each time a player rolls a (\d),?/u);
    if (rollMatch) {

        const rollValue = Number(rollMatch[1]);
        const restOfEffect = s.substring(rollMatch[0]!.length).trim();
        const restEffectFunction = effectParser(restOfEffect, game);
        return passive.onRollEffect([rollValue], restEffectFunction, game);
        (data:EffectData) => { passive.onRollEffect([rollValue], restEffectFunction, game)(data); return true; };
    }
    throw new Error(`Could not parse 'Each time a player rolls a X' effect: ${s}`);
}

export function parseYouMayEffect(s: string, game: Game): EffectFunction {
    const restOfEffect = s.substring("you may".length).trim();
    const restEffectFunction = effectParser(restOfEffect, game, active.addInPlayEffect(game), true);
    return (data:EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        const choice = game.select(data.issuer, 1, [data.it], true).selected.length > 0;
        if (choice) {
            return restEffectFunction(data);
        }
        return false;
    }
}

export function parseAtTheEndOfYourTurnEffect(s: string, game: Game): EffectFunction {
    const restOfEffect = s.substring("at the end of your turn, ".length).trim();
    const restEffectFunction = effectParser(restOfEffect, game, active.addInPlayEffect(game), true);
    return passive.onYourEventEffect("on:turn:end", [restEffectFunction], game);
}

export function parseWhenThisDiesEffect(s: string, game: Game): EffectFunction {
    const restOfEffect = s.substring("When this dies, ".length).trim();
    const restEffectFunction = effectParser(restOfEffect, game, (data:EffectData) => {throw new Error("Not implemented");}, true);
    return passive.onYourEventEffect("on:death:monster", [restEffectFunction], game);
}

export function parseAtTheStartOfYourTurnEffect(s: string, game: Game): EffectFunction {
    const restOfEffect = s.substring("at the start of your turn, ".length).trim();
    const restEffectFunction = effectParser(restOfEffect, game, active.addInPlayEffect(game), true);
    return passive.onYourEventEffect("on:turn:start", [restEffectFunction], game);
}

export function parseOnDamageTakenEffect(s: string, game: Game): EffectFunction {
    const restOfEffect = s.substring("each time you take damage, ".length).trim();
    const restEffectFunction = effectParser(restOfEffect, game, active.addInPlayEffect(game), true);
    return passive.onDamageTakenEffect([restEffectFunction], game);
}

export function parseEachTimeDeclareAttackEffect(s: string, game: Game): EffectFunction {
    const restOfEffect = s.substring("each time you declare an attack, ".length).trim();
    const restEffectFunction = effectParser(restOfEffect, game, active.addInPlayEffect(game), true);
    return passive.onYourEventEffect("on:attack:declared", [restEffectFunction], game);
}

export function parseEachTimeWouldRollEffect(s: string, game: Game): EffectFunction {
    const restOfEffect = s.substring("each time a player would roll a 1, ".length).trim();
    const restEffectFunction = effectParser(restOfEffect, game, active.addInPlayEffect(game), true);
    const value = parseNumber(s, /^each time a player would roll a (\d),?/u)!;
    return passive.onWouldRollEffect([restEffectFunction], [value], game);
}

export function parseCurseEffect(s: string, game: Game): EffectFunction {
    const restOfEffect = s.trim();
    const restEffectFunction = effectParser(restOfEffect, game, active.addInPlayEffect(game), true);

    return passive.curseEffect(restEffectFunction, game);
}

export function effectParser(s: string, game: Game, defaultEffect: EffectFunction = active.addInPlayEffect(game), selectionOnResolve = false): EffectFunction {
    const originalS = s;
    // if (s === "Roll-\n1-3: Take 1 Damage.\n4-5: Take 2 Damage.\n6: Search the treasure deck for a Guppy item, gain it, then shuffle the treasure deck."){
    //     console.log("parsing special roll effect:", originalS);
    // }
    s = s.replace("[Tap Effect] ", ""); // remove tap effect marker
    s = s.replace("[Curse Effect] ", ""); // remove curse effect marker
    s = s.toLowerCase();
    s = replaceDiceSymbols(s);
    if(s.startsWith("[curse] "))
        return parseCurseEffect(s.substring(8).trim(), game);
    if (s.startsWith("when you die, ") && s !== "when you die, before paying penalties, give this to another player.")
        return passive.onYourEventEffect("on:death:before-penalty", [effectParser(s.substring(s.indexOf(",") + 1).trim(), game)], game);
    if (s.startsWith("each time you deal combat damage to a monster,"))
        return passive.onYourEventEffect("on:combatdamage:dealt:to-monster", [effectParser(s.substring(s.indexOf(",") + 1).trim(), game)], game);
    if (s.startsWith("each time you die, after paying penalties, "))
        return passive.onYourEventEffect("on:death:after-penalty", [effectParser(s.substring(s.indexOf(",", s.indexOf(",")+1) + 1).trim(), game)], game);
    if (s.startsWith("at the start of your turn, "))
        return parseAtTheStartOfYourTurnEffect(s, game);
    if (s.startsWith("each time you activate an item, "))
        return passive.onYourEventEffect("on:item:activated", [effectParser(s.substring(s.indexOf(",") + 1).trim(), game)], game);
    if (s.startsWith("when you would die, ") || s.startsWith("each time you would die, "))
        return passive.onYourEventEffect("on:death:would-death",
            [effectParser(s.substring(s.indexOf(",") + 1).trim(), game)], game);
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
    if (s.startsWith("discard a loot card:"))
        return (data:EffectData) => {
            if (data.issuer instanceof Player === false) return false;
            if(data.issuer.hand.length > 0)
            {
                const toDiscard = game.select(data.issuer, 1, data.issuer.hand.cards).selected[0]!;
                const index = data.issuer.hand.cards.indexOf(toDiscard);
                game.discardFromHand(data.issuer, index + 1);
                return effectParser(s.substring(21).trim(), game)(data);
            }
            return false;
        };
    if (s.startsWith("destroy 2 items you control"))
        return (data:EffectData) => {
            const itemsToDestroy = data.targets as ItemCard[];
            // game.select(data.issuer, 2, data.issuer.inPlay.filter((card) => card instanceof ItemCard && card.eternal === false)).selected as ItemCard[];
            return game.destroyCardsOrSouls(itemsToDestroy);
        };
    if (s.startsWith("kill "))
        return (data:EffectData) => { game.kill(data.issuer, data.targets[0] as Entity, data.it); return true; };
    if (s.startsWith("destroy this."))
        return (data:EffectData) => { 
            game.destroyCardsOrSouls([data.it]); 
            return effectParser(s.substring(12).trim(), game)(data);
        };
    if (s.startsWith("put a counter on this."))
            return active.putCountersOnItemEffect(1, game);
    if(s.includes(", then")){
        const parts = s.split(", then");
        const firstTrimmed = parts[0]!.trim();
        const secondTrimmed = parts[1]!.trim();
        const firstEffect = effectParser(firstTrimmed, game);
        const secondEffect = effectParser(secondTrimmed, game);
        return (data:EffectData) => {

            // console.log("executing combined effect");
            // console.log("  targets:", targets);
            firstEffect({it: data.it, issuer: data.issuer, targets: data.targets});
            // console.log("first effect done, executing second");
            secondEffect({it: data.it, issuer: data.issuer, targets: data.targets});
            // console.log("second effect done");
            return true;
        };
    }
    if(s.includes(" if you do, ")){
        const parts = s.split(" if you do, ");
        const firstEffect = effectParser(parts[0]!.trim(), game);
        const secondEffect = effectParser(parts[1]!.trim(), game);
        return (data:EffectData) => {
            // todo verify that the first effect was successful.
            if(firstEffect({it: data.it, issuer: data.issuer, targets: data.targets[0]}))
                secondEffect({it: data.it, issuer: data.issuer, targets: data.targets[1]});
            return true;
        };
    }

    const gainAmount = parseNumber(s, /^gain\s+(\d+)\u00A2\.?,?$/u);
    if (gainAmount !== null)
        return active.gainCoinsEffect(game, gainAmount); 
    const coinStolen = parseNumber(s, /^steal\s+(\d+)\u00A2 from a(nother)? player\.?$/u);
    if (coinStolen !== null)
        return active.stealCoinsEffect(game, coinStolen);
        
    const deckName = parseText(s, /look at the top 5 cards of the (\w+) deck\. put 1 on top and the rest on the bottom\./u);
    if (deckName !== "")
    {
        return active.look5Put1TopRestBottomEffect(deckName, game);
    }

    const treasureAmount = parseNumber(s, /^gain \+(\d+) treasures?\.?$/u);
    if (treasureAmount !== null)
        return (data:EffectData) => {
            if (data.issuer instanceof Player === false) return false;
            game.gainTreasure(data.issuer, treasureAmount); return true; 
        };

    const loseAmount = parseNumber(s, /^lose\s+(\d+)\u00A2\.?$/u);
    if (loseAmount !== null)
        return active.loseCoinsEffect(game, loseAmount);
    
    const nbToLoot = parseNumber(s, /^loot\s+(\d+)\.?$/u);
    if (nbToLoot !== null)
        return active.lootCardsEffect(game, nbToLoot);
    const HPToPay = parseNumber(s, /^pay\s+(\d+) \[hp\] ?\.?$/u);
    if (HPToPay !== null)
        return (data: EffectData) => {
            return game.healthLoss(data.issuer, data.issuer, data.it, HPToPay);
        };
    const coinsToPay = parseNumber(s, /^pay\s+(\d+)\u00A2:?$/u);
    if (coinsToPay !== null)
        return (data:EffectData) => { 
            if (data.issuer instanceof Player === false) return false;
            return game.loseCoins(data.issuer, coinsToPay, false) === coinsToPay;
        };
    const eachPlayerGains = parseNumber(s, /^each player gains\s+(\d+)\u00A2\.?$/u);
    if (eachPlayerGains !== null)
        return (data:EffectData) => {
            for (const player of game.players) {
                game.gainCoins(player, eachPlayerGains);
            }
            return true;
        };
    let toDiscard =  /discard [1a] loot card\.?/.test(s) ? 1 : null;
    if (toDiscard === null)
        toDiscard = parseNumber(s, /^discard (\d+) loot cards?\.?$/u);
    if( toDiscard !== null)
        return active.discardNLootCardsEffect(toDiscard, game);
    const eachPlayerLoots = parseNumber(s, /^each player loots\s+(\d+)\.?$/u);
    if (eachPlayerLoots !== null)
        return (data:EffectData) => {
            for (const player of game.players) {
                game.loot(player, eachPlayerLoots);
            }
            return true;
        };
    const deckName1 = parseText(s, /^look at the top 4 cards of the (\w+) deck\. you may put them back in any order\.?$/u);
    if (deckName1 !== "")
        return active.lookAndOrderEffect(deckName1, 4, game);
    const damageToEachPlayer = parseNumber(s, /^each player takes (\d+) damage\.?!?$/u);
    if (damageToEachPlayer !== null)
        return (data:EffectData) => {
            for (const player of game.players) {
                game.dealDamage(data.issuer, player, data.it, damageToEachPlayer);
            }
            return true;
        };
    const damageToEachMonster = parseNumber(s, /^each monster takes (\d+) damage\.?$/u);
    if (damageToEachMonster !== null)
        return (data:EffectData) => {
            for (const player of game.monsters) {
                game.dealDamage(data.issuer, player, data.it, damageToEachMonster);
            }
            return true;
        };
    const damageToTake = parseNumber(s, /^take (\d+) damage\.?!?$/u);
    if (damageToTake !== null)
        return (data:EffectData) => {
            game.dealDamage(data.issuer, data.issuer, data.it, damageToTake);
            return true;
        };
    const damageToTake2 = parseNumber(s, /^take (\d+) damage and gain \d+\u00A2\.?$/u);
    const coins = parseNumber(s, /^take \d+ damage and gain (\d+)\u00A2\.?$/u);
    if (damageToTake2 !== null && coins !== null)
        return active.takeDamageGainCoinsEffect(s, damageToTake2, coins, game);
    let damageToDeal = parseNumber(s, /^deal (\d+) damage to a monster or player\.?$/u);
    if( damageToDeal === null )
      damageToDeal = parseNumber(s, /^deal (\d+) damage to a player\.?$/u);
    if (damageToDeal === null)
      damageToDeal = parseNumber(s, /^deal (\d+) damage to a monster\.?$/u);
    if(s === "deal 1 damage to them.")
        damageToDeal = 1;
    if (damageToDeal !== null)
        return (data:EffectData) => {
            const target = data.targets[0] as Entity;
            game.dealDamage(data.issuer, target, data.it, damageToDeal);
            return true;
        };
    const slot = parseText(s, /^expand (\w+)s? slot/u)
    if (slot !== "")
    {
        const numberToExpand = parseNumber(s, /^expand \w+ slots by (\d+)./u);
        if (numberToExpand === null)
            throw new Error(`Could not parse number of slots to expand in effect: ${s}`);
        return active.expandSlotsEffect(slot, numberToExpand, game);
    }
    let countersToRemove = parseNumber(s, /^remove (\d+) counters? from this\.?$/u);
    if (countersToRemove === null)
        countersToRemove = /remove a counter from this.?/.test(s) ? 1 : null;
    if( countersToRemove !== null)
        return active.removeCountersEffect(game, countersToRemove);
    const toAdd = parseNumber(s, /^add \+? ?(\d+) to a dice roll\.?$/u);
    if( toAdd !== null)
        return active.addToDiceRollEffect(game, toAdd);
    switch (s) {
        // passive effects
        case "the next time a player would loot, they loot from the top of the loot discard instead.":
            return passive.lootFromDiscardEffect(game);
        case "if you control this as the game starts, you go first.":
            return passive.goFirstInTurnOrderEffect(game);
        case "damage you would take is reduced to 1.":
            return passive.reduceDamageToOneEffect(game);
        case "this enters play deactivated.":
            return passive.enterPlayDeactivatedEffect(game);
        case "shop items you purchase cost 5¢ less.":
            return passive.shopItemsCostLessEffect(5, game);
        case "when you would roll a 1, you may change the result to a 6.":
            return passive.changeRollOneToSixEffect(game);
        case "when you die, before paying penalties, give this to another player.":
            return passive.giveThisToAnotherPlayerOnDeathEffect(game);
        case "each time you die, before paying penalties, gain 8¢.":
            return passive.beforeDeathPenaltyEffect([active.gainCoinsEffect(game, 8)], game);
        case "each time you die, before paying penalties, loot 3.":
            return passive.beforeDeathPenaltyEffect([active.lootCardsEffect(game, 3)], game);
        case "if this would be destroyed, it becomes a soul instead.":
            return passive.becomeSoulInsteadOfDestructionEffect(game);
        case "the first time you take damage each turn, you may recharge an item.":
            return passive.onFirstDamageEachTurnEffect([active.rechargeItemsEffect(game, true)], game);
        case "when you start the game, look at the top 3 cards of the treasure deck and choose one. it becomes your starting item and gains eternal. put the rest on the bottom of the treasure deck.":
            return passive.startingItemEffect(game);
        case "choose a monster or player. the next instance of damage they take this turn is reduced to 1.":
            return passive.setNextDamageToXEffect(1, game);
        case "loot +1 during your loot step.":
            return passive.lootStepEffect([active.lootCardsEffect(game, 1)], game);
        case "prevent the next 1 damage you would take this turn.":
            return passive.preventNextDamageUpToEffect(1, game);
        case "if another player would pay the death penalty, you choose what item they would destroy and you gain any loot cards and ¢ they would lose.":
            return passive.replaceDeathPenaltyEffect(game);
        case "while you have 0¢, you have +1 to your attack rolls.":
            return passive.ConditionalStatModifierEffect([game.addAttackDiceModifier.bind(game)], 1, (player: Player) => player.coins === 0, ["on:coin:gained:after","on:coin:lost:after"], game, false);
        case "when you have 0 loot cards in your hand, you have +1 [atk] .":
            return passive.ConditionalStatModifierEffect([game.addAttack.bind(game)], 1, (player: Player) => player.hand.length === 0, ["on:loot:added:after","on:loot:removed:after"], game);
        case "choose a player. prevent the next 1 damage they would take this turn.":
            return passive.preventNextDamageUpToEffect(1, game);
        case "choose a player or monster. prevent the next instance of damage they would take this turn.":
            return passive.preventNextDamageUpToEffect(Infinity, game);
        case "choose a player or monster. prevent the next instance of up to 2 damage they would take this turn.":
        case "choose a player. prevent the next instance of up to 2 damage they would take this turn.":
            return passive.preventNextDamageUpToEffect(2, game);
        case "choose a player. till end of turn, if they would loot any number of loot cards, they loot double that number instead.":
            return passive.lootDoubleThisTurnEffect(game);
        case "before a dice is rolled, choose a number. if the next roll is that number, loot 3.":
            return passive.lootOnNextRollEffect(game);
        case "other players can't play loot cards or activate items on your turn.":
            return passive.noPriorityPassesOnYourTurnEffect(game);
        case "the next time you play a non-trinket, non-ambush loot card this turn, copy it.":
            return passive.copyNextNonTrinketNonAmbushLootThisTurnEffect(game);
        case "you gain +1 [atk] till the end of turn.":
            return passive.temporaryStatModifierEffect([game.addAttack.bind(game)], 1, game);
        case "prevent the next 1 damage you would take this turn. when you prevent damage this way, deal 1 damage to another player.":
            return passive.preventDamageAndDealDmgOnPreventEffect(1, 1, game);
        case "choose a player or monster. they gain +1 [atk] till end of turn.":
        case "gain +1 [atk] till end of turn.":
            return passive.temporaryStatModifierEffect([game.addAttack.bind(game)], 1, game);
        case "if you would take any amount of damage, take that much damage +1 instead.":
            return passive.takeDamagePlusEffect(1, game);
        case "you gain +1 [hp] till the end of turn.":
        case "gain +1 [hp] till end of turn.":
            return passive.temporaryStatModifierEffect([game.addHealth.bind(game)], 1, game);
        case "choose a player.\nthey gain +2 [hp] till end of turn.":
            return passive.temporaryStatModifierEffect([game.addHealth.bind(game)], 2, game);
        case "choose a player.\nthey gain +1 [atk] and +1 [hp] till end of turn.":
            return passive.temporaryStatModifierEffect([game.addAttack.bind(game), game.addHealth.bind(game)], 1, game);
        case "choose a player.\nthey gain +1 [atk] and +1 to dice rolls till end of turn.":
            return passive.temporaryStatModifierEffect([game.addAttack.bind(game), game.addAttackDiceModifier.bind(game)], 1, game);
        case "choose a player.\nthey gain +1 [atk] till end of turn and may attack an additional time this turn.":
            return passive.temporaryStatModifierEffect([game.addAttack.bind(game), game.addAttackThisTurn.bind(game)], 1, game);
        case "the active player may attack an additional time this turn.":
            return passive.temporaryStatModifierEffect([game.addAttackThisTurn.bind(game)], 1, game);
        case "play an additional loot card this turn.":
            return passive.temporaryStatModifierEffect([game.addLootPlay.bind(game)], 1, game);
        case "each time a player dies, before paying penalties, loot 1.":
            return passive.lootOnPlayerDeathEffect(1, game);
        case "if you would gain any number of \u00A2, gain that much +1\u00A2 instead.":
            return passive.gainPlusCoinsEffect(1, game);
        case "this item starts with 9 counters on it.":
            return passive.startWithNCountersEffect(9, game);
        case "if you would take damage while this has counters on it, remove that many counters and prevent that much damage.":
            return passive.preventDamageByRemovingCountersEffect(game);
        case "gain +1 [atk] for your first attack roll each turn.":
            return passive.firstAttackRollStatModifierEffect(1, 0, 0, game);
        case "you have +1 [atk] for your first attack roll each turn.":
            return passive.firstAttackRollStatModifierEffect(1, 0, 0, game);
        case "each time you would take damage, roll-\n6: prevent 1 of that damage.":
            return passive.preventDamageOnRollEffect([6], 1, game);
        case "+1 [hp]":
            return passive.permanentStatModifierEffect([game.addHealth.bind(game)], 1, game);
        case "+1 [atk]":
            return passive.permanentStatModifierEffect([game.addAttack.bind(game)], 1, game);
        case "if you would gain any amount of ¢, this levels up by that much instead.":
            return passive.gainCoinsLevelUpEffect(game);
        case "[lv1 effect] you have +2 to your first attack roll each turn.":
            return passive.firstAttackRollStatModifierEffect(2, 0, 0, game);
        case "[lv10 effect] you have +1 [atk] .":
            return passive.lvlXaddListenerEffect([passive.permanentStatModifierEffect([game.addAttack.bind(game)], 1, game)], 10, game);
        case "[lv25 effect] you may attack any number of times on your turn.":
            return passive.lvlXaddListenerEffect([passive.onYourTurnModifier([game.addAttackThisTurn.bind(game)], 1, game)], 25, game);
        case "you have +1 to attack rolls.":
            return passive.permanentStatModifierEffect([game.addAttackDiceModifier.bind(game)], 1, game);
        case "monsters have +1 [dc] on your turn.":
            return passive.onYourTurnModifier([game.addDCmuliplier.bind(game)], 1, game);
        case "you may look at the top card of the treasure deck at any time on your turn.":
            return passive.onYourTurnModifier([game.addCanSeeTopOfTreasureDeck.bind(game)], 1, game);
        case "you may purchase an additional time on your turn.":
            return passive.onYourTurnModifier([game.addPurchaseThisTurn.bind(game)], 1, game);
        case "you may attack an additional time on your turn.":
            return passive.onYourTurnModifier([game.addAttackThisTurn.bind(game)], 1, game);
        case "each time a monster dies, gain 3¢.":
            return passive.gainCoinsOnMonsterDeathEffect(3, game);
        case "you may play an additional loot card on your turn.":
            return passive.onYourTurnModifier([game.addLootPlay.bind(game)], 1, game);
        case "each time you roll an attack roll of 6, deal 1 damage to each other player.":
            return passive.onAttackRollEffect([6],active.dealDamageToEachOtherPlayerEffect(game, 1), game);
        // active effects
        case "deal 1 damage to another player.":
            return active.dealDamageToAnotherPlayerEffect(game, 1);
        case "put counters on this equal to the amount of damage taken. then, if this has 6+ counters, remove 6 counters from this and gain +1 treasure.":
            return active.addCountersAndGainTreasureEffect(6, 1, game);
        case "if you have 0¢, gain 6¢.":
            return active.gainXCoinsIfYEffect(0, 6, game);
        case "if you have 8 or more loot cards in your hand, loot 2.":
            return active.lootXIfYEffect(8, true, 2, game);
        case "if you have 0 loot cards in your hand, loot 2.":
            return active.lootXIfYEffect(0, false, 2, game);
        case "choose a player or monster":
            return (data:EffectData) => { return true; };
        case "each other player takes 1 damage.":
            return active.dealDamageToEachOtherPlayerEffect(game, 1);
        case "prevent death. if it's your turn, cancel everything that hasn't resolved and end it.":
            return active.preventDeathEndTurnEffect(game);
        case "prevent death. if it's your turn, cancel everything that hasn't resolved and end your turn.":
            return active.preventDeathEndTurnEffect(game);
        case "discard any number of loot cards":
            return active.discardAnyNumberOfLootCardsEffect(game);
        case "give another non-eternal item you control to another player": 
            return (data: EffectData) => {
                if (data.issuer instanceof Player === false) return false;
                // const itemToGive = game.select(data.issuer, 1, data.issuer.inPlay.filter((card) => card instanceof ItemCard && card.eternal === false)).selected[0] as ItemCard;
                // const targetPlayer = game.select(data.issuer, 1, game.players.filter((p) => p !== data.issuer)).selected[0] as Player;
                const itemToGive = data.targets[0] as ItemCard;
                const targetPlayer = data.targets[1] as Player;
                return game.give(data.issuer, targetPlayer, itemToGive);
            };
        case "look at the top 5 cards of a deck. put them back in any order.":
            return (data:EffectData) => {
                if (data.issuer instanceof Player === false) return false;
                const deckName = data.targets[0] as string;
                const top5Cards = game.getFirstCardsOfDeck(deckName, 5);
                const selectionResult = game.select(data.issuer, 5, top5Cards, false);
                for (let i = selectionResult.selected.length - 1; i >= 0; i--) {
                    game.addTopPosition(deckName, selectionResult.selected[i]!);
                }
                return true;
            };
        case "put the top card of any discard on top of its deck.":
            return active.putTopCardFromDiscardOnTopEffect(game);
        case "choose a dice roll. its controller rerolls it.":
            return active.rerollDiceEffect();
        case "they must give you a loot card.":
            return active.makePlayerGiveLootCardEffect(game);
        case "add or subtract 1 from a roll.":
            return (data:EffectData) => {
                const choosenDiceRoll: DiceRoll = data.targets[0] as DiceRoll;
                const value = data.targets[1] as number;
                if (value === 1) 
                    choosenDiceRoll.add(1);
                else if (value === -1)
                    choosenDiceRoll.subtract(1);
                return true;
            };
        case "recharge your character.":
            return active.rechargeCharaEffect(game);
        case "put a card from your hand on top of the loot deck.":
            return active.putCardFromHandOnTopOfDeckEffect(game);
        case "recharge an item.":
            return active.rechargeItemsEffect(game, selectionOnResolve);
        case "put the top card of a deck into discard.":
            return active.discardTopOfDeckEffect(game);
        case "look at the top card of the loot deck. you may put it on the bottom.":
            return active.LookAndPutBottomEffect("loot", game);
        case "look at the top card of the monster deck. you may put it on the bottom.":
            return active.LookAndPutBottomEffect("monster", game);
        case "look at the top card of the treasure deck, you may put it on the bottom.":
            return active.LookAndPutBottomEffect("treasure", game);
        case "recharge another item.":
            return active.rechargeItemsEffect(game, selectionOnResolve);
        case "look at a player's hand. you may swap a card from your hand with one of theirs.":
            return active.lookAtPlayerHandAndSwapEffect(game);
        case "look at their hand and steal a loot card from them.":
            return active.lookAtHandAndStealLootEffect(game);
        case "force that player to reroll it.":
            return active.forcePlayerRerollDiceEffect(game);
        case "destroy a curse.":
            return active.destroyOneEffect(game);
        case "shuffle the treasure deck.":
            return active.shuffleTreasureDeckEffect(game);
        case "search the treasure deck for a guppy item, gain it":
            return active.searchGuppyItemEffect(game);
        case "choose a player at random. that player destroys an item they control.":
            return active.destroyItemOfRandomPlayerEffect(game);
        case "destroy an item or soul.":
            return active.destroyOneEffect(game);
        case "destroy another item":
            return active.destroyOneEffect(game);
        case "destroy an item you control.":
            return active.destroyOneEffect(game);
        case "destroy a soul you control.":
            return active.destroyOneEffect(game, true);
        case "Destroy 2 items you control":
            return active.destroyTwoItemsEffect(game);
        case "each player votes on an item in play. destroy the item with the most votes. if there is a tie, nothing happens.":
            return active.eachPlayersVoteToDestroyItemEffect(game);
        case "swap this with a non-eternal item another player controls.":
            return active.swapWithNonEternalItemEffect(game);
        case "this copies a ↷ ability of a non-eternal item.":
            return active.copyTapAbilityEffect(game);
        case "choose a non-eternal item. this becomes a copy of that item.\n(this change is indefinite.)":
            return active.becomesCopyOfItemIndefinitelyEffect(game);
        case "choose a non-eternal passive item. this becomes a copy of that item till end of turn.":
            return active.becomesCopyOfItemUntilEndOfTurnEffect(game);
        case "you may put any number of shop items into discard.":
            return active.discardAnyNumberOfShopItemsEffect(game);
        case "cancel the ↷ or $ ability of an item.":
            return active.cancelStackElementEffect(game);
        case "put any number of non-event monster cards in discard on top of the monster deck.":
            return active.putAnyNumberFromDiscardOnTopEffect("monster", game);
        case "steal a soul from another player.":
            return active.stealSoulEffect(game);
        case "put this into discard.": // this should be only used in events
            return (data:EffectData) => {
                if( data.it.subtype !== "event") {
                    const type = data.it.type;
                    game.decks[type]?.addDiscardTop(data.it);
                }
                return true;
            };
        case "steal a non-eternal item from a player.":
            return active.stealNonEternalItemEffect(game);
        case "steal a non-eternal item a player controls.":
            return active.stealNonEternalItemEffect(game);
        case "loot equal to the number of cards discarded in this way.":
            return active.lootEqualToCardsDiscardedEffect(game);
        case "subtract up to 2 from a roll.":
            return active.subtractUpTo2FromRollEffect(game);
        case "add up to 2 to a non-attack roll.":
            return active.addUpTo2ToNonAtkRollEffect(game);
        case "each player votes on an item in play. destroy the item with the most votes. If there is a tie, nothing happens.":
            return active.eachPlayersVoteToDestroyItemEffect(game);
        case "add 1 to a roll.":
            return active.add1ToRollEffect();
        case "swap a non-eternal item you control with a non-eternal item they control.":
            return active.swapNonEternalItemsEffect(game);
        case "choose a player. loot and gain \u00A2 until you have the same number of each as they do.":
            return active.lootAndGainAsPlayerEffect(game);
        case "you may put a monster not being attacked into discard and replace it with the top card of the monster deck.":
            return active.flushOneMonsterSlotEffect(game);
        case "you may put the top card of the monster deck in a monster slot not being attacked.":
            return active.putTopMonsterInValidSlotEffect(game);
        case "kill a monster.":
            return (data:EffectData) => {
                const targetMonster = data.targets[0] as Monster;
                game.kill(data.issuer, targetMonster, data.it);
                return true;
            };
        case "when this enters play, it becomes a soul.\n(it's no longer an item.)":
            return (data:EffectData) => {
                if (data.issuer instanceof Player === false) return false;
                game.removeInPlay(data.issuer, data.it);      
                data.it.soul = 1;
                game.addSoul(data.issuer, data.it);
                return true;
            }
        case "cancel the ↷ or $ ability of an item or a loot being played.":
            return active.cancelPreviousNonRollEffect(game);
        case "put each monster not being attacked into discard and replace each with the top card of the monster deck.":
            return active.flushMonsterSlotsEffect(game);
        case "put each monster not being attacked on the bottom of the monster deck.":
            return active.flushMonsterSlotsToBottomEffect(game);
        case "look at each player's hand":
            return active.lookAtHands(game);
        case "look at the top card of a deck. you may put that card on the bottom of that deck.":
            return active.lookAtTopCardOfDeckEffect(game, "bottom");
        case "reveal the top card of any deck. put it back or put it into discard.":
            return active.lookAtTopCardOfDeckEffect(game, "discard", true);
        case 'choose a player. they reroll each item they control.':
            return active.rerollEachItemEffect(game);
        case "choose another player. steal a loot card from them at random.":
            return active.stealRandomLootCardEffect(game);
        case "choose a monster. the active player must attack that monster this turn if able.":
            return active.forceAttackMonsterEffect(game);
        case "you may play any number of additional loot cards till end of turn.":
            return (data:EffectData) => { 
                if (data.issuer instanceof Player === false) return false;
                game.addLootPlay(data.issuer, Infinity);
                return true;
            };
        case "choose a player. recharge each item they control.":
            return active.rechargeEachItemsOfTargetEffect(game);
        case "destroy this and loot 2.":
            return active.destroyThisAndLoot2Effect(game);
        case "choose a player. that player gives you a loot card.":
            return active.makePlayerGiveLootCardEffect(game);
        case "look at the top card of a deck.":
            return active.lookAtTopCardOfDeckEffect(game, "just_watch");
        case "end the turn. cancel everything that hasn't resolved.":
            return active.endTurnAndResetStackEffect(game);
        
        case "choose the player with the most souls or tied for the most. that player destroys a soul they control.":
            return active.makeAPlayerWithMostSoulsDestroyASoulEffect(game);

        case "put the top card of each deck into discard.":
            return active.putTopCardOfEachDeckIntoDiscardEffect(game);
        case "each player gives their hand to the player to their left.":
            return active.passHandsLeftEffect(game);
        case "steal a non-eternal item from a player or from the shop.":
            return active.stealNonEternalItemFromAnywhereEffect(game);
        
        case "look at the top card of each deck. you may put any of those cards on the bottom of their deck":
            return active.look1EachDeckEffect(game);
        case "this becomes a soul and loses all abilities.":
            return active.BecomesSoulEffect(game);
        case "put this on the bottom of the loot deck.":
            return (data:EffectData) => {
                game.addBottomPosition("loot", data.it);
                return true;
            };
        case "take an extra turn after this one if it's your turn.":
            return (data:EffectData) => { 
                if (data.issuer instanceof Player === false) return false;
                if (game.currentPlayer === data.issuer){
                    game.addExtraTurn(data.issuer);
                    return true;
                }
                return false;
            };

        case "choose a dice roll. its controller rerolls it.":
            return (data:EffectData) => {
                const choosenDiceRoll:DiceRoll = data.targets[0] as DiceRoll;
                choosenDiceRoll.roll();
                return true;
            };

        case "change the result of a dice roll to a number of your choosing.":
            return active.changeRollDiceResultEffect(game);

        case "change the result of a dice roll to a 1 or 6.":
            return (data:EffectData) => {
                if (data.issuer instanceof Player === false) return false;
                const choosenDiceRoll: DiceRoll = data.targets[0] as DiceRoll;
                const selectionResult = game.select(data.issuer, 1, [1, 6]);
                const newValue = selectionResult.selected[0] as number;
                choosenDiceRoll.value = newValue;
                return true;
            };

        case "put a loot card from your hand on top of the loot deck.":
            return (data:EffectData) => {
                if (data.issuer instanceof Player === false) return false;
                const cardToPutBack = game.select(data.issuer, 1, data.issuer.hand.cards).selected[0] as LootCard;
                const card = game.getCardFromHand(data.issuer, cardToPutBack);
                game.decks["loot"]!.addTopPosition(card);
                return true;
            };
        case "reroll an item. (destroy that item and replace it with the top card of the treasure deck.)":
        case "reroll an item.\n(destroy that item and replace it with the top card of the treasure deck.)":
            return (data:EffectData) => {
                const p: Player = game.getPlayerById(data.targets[0].player)!;
                game.reroll(p, data.targets[0].card);
                return true;
            };
        case "put each shop item on the bottom of the treasure deck.":
            return (data:EffectData) => { 
                game.shop.flushToBottom();
                return true;
            }
        case "that player gives you a loot card.":
            return (data:EffectData) => { 
                if (data.issuer instanceof Player === false) return false;
                const targetPlayer = data.targets[0] as Player;
                if (targetPlayer.hand.length > 0) {
                    const cardToSteal = game.select(targetPlayer, 1, targetPlayer.hand.cards).selected[0] as LootCard;
                    game.stealLootCard(data.issuer, targetPlayer, cardToSteal);
                }
                return true;
            };
        case "put a non-event monster card in discard on top of the monster deck.":
            return (data:EffectData) => { 
                if (data.issuer instanceof Player === false) return false;
                const monsterToPutBack = game.select(data.issuer, 1, game.decks["monster"]!.discard.filter((card) => card.type !== "event")).selected[0] as Card;
                game.decks["monster"]!.remove(monsterToPutBack);
                game.decks["monster"]!.addTopPosition(monsterToPutBack);
                return true;
            }
        case "recharge this.":
            return (data:EffectData) => { 
                (data.it as ItemCard).recharge();
                return true;
            };
        case "this becomes a soul. gain it.":
            return (data:EffectData) => { 
                if (data.issuer instanceof Player === false) return false;
                game.removeInPlay(data.issuer, data.it);
                data.it.soul = 1;
                game.addSoul(data.issuer, data.it);
                return true;
            }

        default:
            break;
        }
    // multiple effects separated by ., try to parse them individually.
    // To do so, replace by ", then " and parse again.
    if (s.indexOf(".") !== s.length - 1 && s.indexOf(".") !== -1) 
    {
        s = s.replace(".", ", then ");
        return effectParser(s, game, defaultEffect, selectionOnResolve);
    }
    return defaultEffect;
}
