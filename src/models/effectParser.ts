import { DamageOnStack, DiceRoll, Player } from "./player";
import { type Card, LootCard, type EffectFunction, type TargetsSelector, ItemCard, MonsterCard, InplayType, BsoulCard, type EffectData } from "./cards";
import { Game } from "./game";
import type { Entity } from "./entity";
import { effect } from "zod/v3";
import type { Stack, StackElement } from "./stack";
import { it } from "zod/locales";
// import { firstAttackRollStatModifierEffect, gainCoinsOnDamageEffect, gainPlusCoinsEffect, goFirstInTurnOrderEffect, LookAndPutBottomEffect, lootOnPlayerDeathEffect, preventDamageOnRollEffect, preventNextDamageUpToEffect, rollDiceOnTriggerEffect, startingItemEffect, temporaryStatModifierEffect, gainTreasureOnDeathEffect } from "./abilities";
import *  as passive from "./passiveEffect";
import * as active from "./activeEffect";
import type { BonusSoulCardType } from "@/types/cardTypes";
import { parse } from "zod";

function prepareEffectString(s: string): string {
    s.replace("[Tap Effect]", ""); // remove tap effect marker
    s.replace("Paid Effect]", ""); // remove paid effect marker
    s.trim();
    s.toLowerCase();

    return s;
}

function replaceDiceSymbols(s: string): string {
    return s
        .replace(/❶/g, "1")
        .replace(/❷/g, "2")
        .replace(/❸/g, "3")
        .replace(/❹/g, "4")
        .replace(/❺/g, "5")
        .replace(/❻/g, "6");
}

// Returns the numeric amount if matched, otherwise null
function parseNumber(text: string, re: RegExp): number | null {
    const m = text.trim().match(re);
    return m ? Number(m[1]) : null;
}

function parseText(text: string, re: RegExp): string {
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
    const rollMatch = s.match(/^each time a player rolls a (\d),?/u);
    if (rollMatch) {

        const rollValue = Number(rollMatch[1]);
        const restOfEffect = s.substring(rollMatch[0]!.length).trim();
        const restEffectFunction = effectParser(restOfEffect, game);
        return (data:EffectData) => { passive.onRollEffect([rollValue], restEffectFunction, game)(data); return true; };
    }
    throw new Error(`Could not parse 'Each time a player rolls a X' effect: ${s}`);
}

export function parseYouMayEffect(s: string, game: Game): EffectFunction {
    const restOfEffect = s.substring("you may".length).trim();
    const restEffectFunction = effectParser(restOfEffect, game, active.addInPlayEffect(game), true);
    return (data:EffectData) => {
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
    return passive.atTheEndOfYourTurnEffect([restEffectFunction], game);
}

export function parseAtTheStartOfYourTurnEffect(s: string, game: Game): EffectFunction {
    const restOfEffect = s.substring("at the start of your turn, ".length).trim();
    const restEffectFunction = effectParser(restOfEffect, game, active.addInPlayEffect(game), true);
    return passive.atTheStartOfYourTurnEffect([restEffectFunction], game);
}

export function effectParser(s: string, game: Game, defaultEffect: EffectFunction = active.addInPlayEffect(game), selectionOnResolve = false): EffectFunction {
    const originalS = s;
    // if (s === "[Paid Effect] Remove 1 counter from this:\nAdd +1 to a dice roll."){
    //     console.log("parsing special roll effect:", originalS);
    // }
    s = s.replace("[Tap Effect] ", ""); // remove tap effect marker
    s = s.toLowerCase();
    s = replaceDiceSymbols(s);
    if (s.startsWith("at the start of your turn, "))
        return parseAtTheStartOfYourTurnEffect(s, game);
    if (s.startsWith("at the end of your turn, "))
        return parseAtTheEndOfYourTurnEffect(s, game);
    if (s.startsWith("each time a player rolls a"))
        return parseEachTimeRollEffect(s, game);
    if (s.startsWith("you may") &&
    // exceptions where "you may" is not a choice, but an extra action
        !s.startsWith("you may put") && 
        s !== "you may play an additional loot card on your turn." &&
        s !== "you may attack an additional time on your turn."
        )
        return parseYouMayEffect(s, game);
    if (s.startsWith("[paid effect] "))
        return active.paidEffect(s, game);
    if (s.startsWith("choose one-"))
        return active.chooseOneEffect(s, game);
    if (s.startsWith("roll-"))
        return active.rollEffect(s, game);
    if (s.startsWith("give another non-eternal item you control to another player:")){
        return (data:EffectData) => {
            const itemToGive = game.select(data.issuer, 1, data.issuer.inPlay.filter((card) => card instanceof ItemCard && card.eternal === false)).selected[0] as ItemCard;
            const targetPlayer = game.select(data.issuer, 1, game.players.filter((p) => p !== data.issuer)).selected[0] as Player;
            game.stealItemAnywhere(targetPlayer, itemToGive);
            return effectParser(s.substring(56).trim(), game)(data);
        }
    }
    if (s.startsWith("discard a loot card:"))
        return (data:EffectData) => {
            if(data.issuer.hand.length > 0)
            {
                const toDiscard = game.select(data.issuer, 1, data.issuer.hand.cards).selected[0]!;
                const index = data.issuer.hand.cards.indexOf(toDiscard);
                game.discardFromHand(data.issuer, index + 1);
                return effectParser(s.substring(21).trim(), game)(data);
            }
            return false;
        };
    if (s.startsWith("destroy 2 items you control:"))
        return (data:EffectData) => {
            const itemsToDestroy = game.select(data.issuer, 2, data.issuer.inPlay.filter((card) => card instanceof ItemCard && card.eternal === false)).selected as ItemCard[];
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
        return (data:EffectData) => { game.gainTreasure(data.issuer, treasureAmount); return true; };

    const loseAmount = parseNumber(s, /^lose\s+(\d+)\u00A2\.?$/u);
    if (loseAmount !== null)
        return active.loseCoinsEffect(game, loseAmount);
    
    const nbToLoot = parseNumber(s, /^loot\s+(\d+)\.?$/u);
    if (nbToLoot !== null)
        return (data:EffectData) => { game.loot(data.issuer, nbToLoot); return true;};
    const coinsToPay = parseNumber(s, /^pay\s+(\d+)\u00A2:?$/u);
    if (coinsToPay !== null)
        return (data:EffectData) => { 
            if(game.loseCoins(data.issuer, coinsToPay, false) === coinsToPay) {
                return effectParser(s.substring(s.indexOf(":") + 1).trim(), game)(data);
            }
            return false;
        };
    const eachPlayerGains = parseNumber(s, /^each player gains\s+(\d+)\u00A2\.?$/u);
    if (eachPlayerGains !== null)
        return (data:EffectData) => {
            for (const player of game.players) {
                player.gainCoins(eachPlayerGains);
            }
            return true;
        };
    
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
    const damageToEachPlayer = parseNumber(s, /^each player takes (\d+) damage\.?$/u);
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
    const damageToTake = parseNumber(s, /^take (\d+) damage\.?$/u);
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
    let countersToRemove = parseNumber(s, /^remove (\d+) counters? from this\.?$/u);
    if (countersToRemove === null)
        countersToRemove = /remove a counter from this.?/.test(s) ? 1 : null;
    if( countersToRemove !== null)
        return active.removeCountersEffect(game, countersToRemove);
    const toAdd = parseNumber(s, /^add \+? ?(\d+) to a dice roll\.?$/u);
    if( toAdd !== null)
        return active.addToDiceRollEffect(game, toAdd);
    // Match patterns like "prevent next instance of up to 2 damage this turn"
    // const preventMatch = s.match(/^choose a player. prevent (?:the )?next instance of up to (\d+) damage(?: you would take)? this turn\.?$/u);
    switch (s) {
        // passive effects
        case "if you control this as the game starts, you go first.":
            return passive.goFirstInTurnOrderEffect(game);
        case "if you have 0¢, gain 6¢.":
            return active.gainXCoinsIfYEffect(0, 6, game);
        case "if you have 8 or more loot cards in your hand, loot 2.":
            return active.lootXIfYEffect(8, true, 2, game);
        case "if you have 0 loot cards in your hand, loot 2.":
            return active.lootXIfYEffect(0, false, 2, game);
        case "when you start the game, look at the top 3 cards of the treasure deck and choose one. it becomes your starting item and gains eternal. put the rest on the bottom of the treasure deck.":
                return passive.startingItemEffect(game);
        case "prevent the next 1 damage you would take this turn.":
            return passive.preventNextDamageUpToEffect(1, game);
        case "choose a player. prevent the next 1 damage they would take this turn.":
            return passive.preventNextDamageUpToEffect(1, game);
        case "choose a player or monster. prevent the next instance of damage they would take this turn.":
            return passive.preventNextDamageUpToEffect(Infinity, game);
        case "choose a player or monster. prevent the next instance of up to 2 damage they would take this turn.":
            return passive.preventNextDamageUpToEffect(2, game);
        case "you gain +1 [atk] till the end of turn.":
            return passive.temporaryStatModifierEffect([game.addAttack], 1, game);
        case "choose a player or monster. they gain +1 [atk] till end of turn.":
            return passive.temporaryStatModifierEffect([game.addAttack], 1, game);
        case "you gain +1 [hp] till the end of turn.":
            return passive.temporaryStatModifierEffect([game.addHealth], 1, game);
        case "choose a player.\nthey gain +2 [hp] till end of turn.":
            return passive.temporaryStatModifierEffect([game.addHealth], 2, game);
        case "choose a player.\nthey gain +1 [atk] and +1 [hp] till end of turn.":
            return passive.temporaryStatModifierEffect([game.addAttack, game.addHealth], 1, game);
        case "choose a player.\nthey gain +1 [atk] and +1 to dice rolls till end of turn.":
            return passive.temporaryStatModifierEffect([game.addAttack, game.addAttackDiceModifier], 1, game);
        case "choose a player.\nthey gain +1 [atk] till end of turn and may attack an additional time this turn.":
            return passive.temporaryStatModifierEffect([game.addAttack, game.addAttackThisTurn], 1, game);
        case "play an additional loot card this turn.":
                return passive.temporaryStatModifierEffect([game.addLootPlay], 1, game);
        case "each time you die, after paying penalties, gain +1 treasure.":
            return passive.gainTreasureOnDeathEffect(1, game);
        case "each time you take damage, gain 1\u00A2.":
            return passive.gainCoinsOnDamageEffect( 1, game);
        case "each time a player dies, before paying penalties, loot 1.":
            return passive.lootOnPlayerDeathEffect(1, game);
        case "each time you take damage, recharge this.":
            return passive.rechargeThisOnEvent("on:damage:taken", game);
        case "if you would gain any number of \u00A2, gain that much +1\u00A2 instead.":
            return passive.gainPlusCoinsEffect(1, game);
        case "this item starts with 9 counters on it.":
            return passive.startWithNCountersEffect(9, game);
        case "if you would take damage while this has counters on it, remove that many counters and prevent that much damage.":
            return passive.preventDamageByRemovingCountersEffect(game);
        case "when you would die, roll-\n6: prevent death. if it's your turn, cancel everything that hasn't resolved and end it.":
            const roll = active.rollEffect("roll-\n6: prevent death. if it's your turn, cancel everything that hasn't resolved and end it.", game)
            return passive.rollDiceOnTriggerEffect(roll, "on:death:would-death", game);
        case "gain +1 [atk] for your first attack roll each turn.":
            return passive.firstAttackRollStatModifierEffect(1, 0, 0, game);
        case "you have +1 [atk] for your first attack roll each turn.":
            return passive.firstAttackRollStatModifierEffect(1, 0, 0, game);
        case "each time you would take damage, roll-\n6: prevent 1 of that damage.":
            return passive.preventDamageOnRollEffect([6], 1, game);
        case "+1 [hp]":
            return passive.permanentStatModifierEffect([game.addHealth], 1, game);
        case "+1 [atk]":
            return passive.permanentStatModifierEffect([game.addAttack], 1, game);
        case "if you would gain any amount of ¢, this levels up by that much instead.":
            return passive.gainCoinsLevelUpEffect(game);
        case "[lv1 effect] you have +2 to your first attack roll each turn.":
            return passive.firstAttackRollStatModifierEffect(2, 0, 0, game);
        case "[lv10 effect] you have +1 [atk] .":
            return passive.lvlXaddListenerEffect([passive.permanentStatModifierEffect([game.addAttack], 1, game)], 10, game);
        case "[lv25 effect] you may attack any number of times on your turn.":
            return passive.lvlXaddListenerEffect([passive.onYourTurnModifier([game.addAttackThisTurn], 1, game)], 25, game);
        case "you have +1 to attack rolls.":
            return passive.permanentStatModifierEffect([game.addAttackDiceModifier], 1, game);
        case "you may attack an additional time on your turn.":
            return passive.onYourTurnModifier([game.addAttackThisTurn], 1, game);
        case "you may play an additional loot card on your turn.":
            return passive.onYourTurnModifier([game.addLootPlay], 1, game);
        case "each time you take damage, you may recharge your character.":
            return passive.rechargeCharaOnDamageEffect(1, game);
        case "each time you take damage, put a counter on this.":
            return passive.onDamageTakenEffect([], [active.putCountersOnItemEffect(1, game)], 1, game);
        case "each time you roll an attack roll of 6, deal 1 damage to each other player.":
            return passive.onAttackRollEffect([6],active.dealDamageToEachOtherPlayerEffect(game, 1), game);
        case "each time you deal combat damage to a monster, deal 1 damage to another player.":
            return passive.onDealCombatDamageToMonsterEffect(active.dealDamageToAnotherPlayerEffect(game, 1), game);
        case "each time you take damage, put counters on this equal to the amount of damage taken. then, if this has 6+ counters, remove 6 counters from this and gain +1 treasure.":
            return passive.countersOnDamageGainTreasureEffect(6, 1, game);
            
        // active effects
        case "choose a player or monster":
            return (data:EffectData) => { return true; };
        case "prevent death. if it's your turn, cancel everything that hasn't resolved and end it.":
            return (data:EffectData) => {
                game.preventDeath(data.issuer);
                if (game.currentPlayer === data.issuer) {
                    game.resetStack();
                    game.endTurn();
                }
                return true;
            };
        case "discard any number of loot cards":
            return active.discardAnyNumberOfLootCardsEffect(game);
        case "look at the top 5 cards of a deck. put them back in any order.":
            return (data:EffectData) => {
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
        case "destroy a curse.":
            return active.destroyOneEffect(game);
        case "choose a player at random. that player destroys an item they control.":
            return active.destroyItemOfRandomPlayerEffect(game);
        case "destroy an item or soul.":
            return active.destroyOneEffect(game);
        case "destroy another item":
            return active.destroyOneEffect(game);
        case "destroy an item you control.":
            return active.destroyOneEffect(game);
        case "each player votes on an item in play. destroy the item with the most votes. if there is a tie, nothing happens.":
            return active.destroyOneEffect(game);
        case "swap this with a non-eternal item another player controls.":
            return active.swapWithNonEternalItemEffect(game);
        case "this copies a ↷ ability of a non-eternal item.":
            return active.copyTapAbilityEffect(game);
        case "you may put any number of shop items into discard.":
            return active.discardAnyNumberOfShopItemsEffect(game);
        case "cancel the ↷ or $ ability of an item.":
            return active.cancelStackElementEffect(game);
        case "steal a soul from another player.":
            return active.stealSoulEffect(game);
        case "steal a non-eternal item from a player.":
            return active.stealNonEternalItemEffect(game);
        case "steal a non-eternal item a player controls.":
            return active.stealNonEternalItemEffect(game);
        case "loot equal to the number of cards discarded in this way.":
            return active.lootEqualToCardsDiscardedEffect(game);
        case "subtract up to 2 from a roll.":
            return active.subtractUpTo2FromRollEffect(game);
        case "add up to 2 to a non-attack roll.":
            return active.addUpTo2ToRollEffect(game);
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
        case "when this enters play, it becomes a soul.\n(it's no longer an item.)":
            return (data:EffectData) => {
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

        case "choose a player. recharge each item they control.":
            return active.rechargeEachItemsOfTargetEffect(game);
        case "destroy this and loot 2.":
            return active.destroyThisAndLoot2Effect(game);
        
        case /discard [1a] loot card.?/.test(s) ? s : "":
            return active.discard1LootCardEffect(game);
            return active.discard1LootCardEffect(game);
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
                const choosenDiceRoll: DiceRoll = data.targets[0] as DiceRoll;
                const selectionResult = game.select(data.issuer, 1, [1, 6]);
                const newValue = selectionResult.selected[0] as number;
                choosenDiceRoll.value = newValue;
                return true;
            };

        case "put a loot card from your hand on top of the loot deck.":
            return (data:EffectData) => {
                const cardToPutBack = game.select(data.issuer, 1, data.issuer.hand.cards).selected[0] as LootCard;
                const card = game.getCardFromHand(data.issuer, cardToPutBack);
                game.decks["loot"]!.addTopPosition(card);
                return true;
            };
        case "reroll an item. (destroy that item and replace it with the top card of the treasure deck.)":
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
                const targetPlayer = data.targets[0] as Player;
                if (targetPlayer.hand.length > 0) {
                    const cardToSteal = game.select(targetPlayer, 1, targetPlayer.hand.cards).selected[0] as LootCard;
                    game.stealLootCard(data.issuer, targetPlayer, cardToSteal);
                }
                return true;
            };
        case "put a non-event monster card in discard on top of the monster deck.":
            return (data:EffectData) => { 
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
        case "cancel the ↷ or $ ability of an item.":
            return (data:EffectData) => {
                game.cancelAt(data.targets[0] as number);
                return true;
            }
        case "this becomes a soul. gain it.":
            return (data:EffectData) => { 
                game.removeInPlay(data.issuer, data.it);
                data.it.soul = 1;
                game.addSoul(data.issuer, data.it);
                return true;
            }

        default:
            return defaultEffect;
    }
}

export function targetSelectorParser(s:string, game: Game): TargetsSelector[] {
    s = s.toLowerCase();
    // if (s === "kill a player.")
    // {
    //     console.log("parsing target selector for:", s);
    // }
    const coinStolen = parseNumber(s, /^steal\s+(\d+)\u00A2 from a player\.?$/u);
    // if (s.startsWith("you gain"))
    if (s.includes(" if you do, ")) 
        return [{description: "If you do,", selector: IfYouDoTargetSelector(s, game)}];
    if (s.startsWith("choose one-"))
        return [{description: "Choose one-", selector: chooseOneTargetSelector(s, game)}];
    if (s === "give another non-eternal item you control to another player:" ||
        s === "choose another player. steal a loot card from them at random." ||
        coinStolen !== null) {
        return [{description: "Choose another player", selector: anotherPlayerSelector(undefined, game)}];
    }
    if (s === "cancel the ↷ or $ ability of an item or a loot being played.")
        return [{description: "Select a loot card on the stack.", selector: stackElementSelector((element) => element instanceof LootCard, game)}];
    if (s.startsWith("choose a player.") ||
        s === "kill a player.") {
        return [{description: "Choose a player", selector: playerSelector(undefined, game)}];
    }
    if (s === "[paid effect] remove 3 counters from this:\nkill a player or monster.")
        return [{description: "Choose a player or monster", selector: activeEntitySelector(undefined, game)}];
    if (s === "choose the player with the most souls or tied for the most. that player destroys a soul they control.")
    {
        return [{description: "Choose a player with the most souls or tied for the most.", selector: playerSelector((p) => p.souls.length === Math.max(...game.players.map(p => p.souls.length)), game)}];
    }
    if (s === "choose a dice roll. its controller rerolls it." ||
        s === "change the result of a dice roll to a 1 or 6." ||
        s === "change the result of a dice roll to a number of your choosing." ||
        s === "choose a dice roll. its controller rerolls it.") {
        return [{description: "Choose a dice roll", selector: rollSelector(undefined, game)}];
    }
    if (s === "add or subtract 1 from a roll.") {
        return [{description: "Choose a dice roll", selector: rollSelector(undefined, game)},
            {description: "Choose to add or subtract 1", selector: (issuer: Player) => [1, -1]}
        ];
    }
    if (s === "choose a player or monster, then roll- deal damage to them equal to the result." ||
        s === "choose a player or monster, then roll-\ndeal damage to them equal to the result." ||
        s === "choose a player or monster. prevent the next instance of up to 2 damage they would take this turn." ||
        s === "choose a player or monster. they gain +1 [atk] till end of turn." ||
        s.match(/^deal \d+ damage to a monster or player\.?$/u)
    ) {
        return [{description: "Choose a player or monster", selector: activeEntitySelector(undefined, game)}];
    }
    if (s === "destroy an item you control."){
        return [{description: "Destroy an item you control", selector: inplayItemSelector((player: Player, card: ItemCard) => card.eternal === false && player == game.getOwner(card), game)}];
    }
    if (s === "destroy a curse.")
        return [{description: "Select a curse.", selector: inplayCurseSelector((player, card) => true, game)}];
    if (s === "recharge an item.")
    {
        return [{description: "Select a rechargeable item", selector: inplayUnchargedItemSelector(game)}];
    }
    if (s === "steal a non-eternal item from a player or from the shop.")
    {
        return [{ description: "Select a non-eternal item from a player or from the shop", selector: visibleItemSelector((card: ItemCard) => card.eternal === false, game)}];
    }
    if (s === "look at the top 5 cards of a deck. put them back in any order." 
        || s === "put the top card of any discard on top of its deck."
    )
        return [{description: "Select a deck", selector: deckSelector(undefined, game)}];
    // if (s === "put the top card of any discard on top of its deck.")
    //     return [{description: "Select a discard top card", selector: 
    //         (issuer: Player) => {
    //             return deckSelector((deckName: string) => game.decks[deckName]!.discard.length > 0, game)(issuer).map(({ deckName }) => game.decks[deckName]!.discard[0]);
    //         }}];
    return [{description: "", selector: (issuer: Player) => []}];
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
        return game.visibleItems.filter((card ) => filter(card));
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
export function IfYouDoTargetSelector(s: string, game: Game): (issuer: Player) => any[] {
    const options = s.split(" if you do, ").map((option) => option.trim()).filter((option) => option.length > 0);
    return (issuer: Player) => {
        const selectors = options.map((option) =>  targetSelectorParser(option, game)[0]!.selector(issuer));
        return selectors;
    };
}
export function chooseOneTargetSelector(s: string, game: Game): (issuer: Player) => any[] {
    const options = s.substring("choose one-".length).trim().split("\n").map((option) => option.trim()).filter((option) => option.length > 0);
    return (issuer: Player) => {
        const selectors: ChooseOneOptions[] = options.map((option) => ({ description: option, admissibleTargets: targetSelectorParser(option, game)[0]!.selector(issuer)}));
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