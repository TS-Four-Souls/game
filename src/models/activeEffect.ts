// An active effect is an effect that is triggered by a player action, 
// as opposed to a passive effect which is triggered by a game event.


import { DamageOnStack, DiceRoll, Player } from "./player";
import { type Card, LootCard, type EffectFunction, type TargetsSelector, ItemCard, MonsterCard, InplayType, BsoulCard, type EffectData } from "./cards";
import { Game } from "./game";
import type { Entity } from "./entity";
import { effect } from "zod/v3";
import type { Stack, StackElement } from "./stack";
import { it } from "zod/locales";
import { effectParser, type ChooseOneResult } from "./effectParser";
// import { firstAttackRollStatModifierEffect, gainCoinsOnDamageEffect, gainPlusCoinsEffect, goFirstInTurnOrderEffect, LookAndPutBottomEffect, lootOnPlayerDeathEffect, preventDamageOnRollEffect, preventNextDamageUpToEffect, rollDiceOnTriggerEffect, startingItemEffect, temporaryStatModifierEffect, gainTreasureOnDeathEffect } from "./abilities";
import *  as passive from "./passiveEffect";
import type { BonusSoulCardType } from "@/types/cardTypes";

export function gainCoinsEffect(game: Game, amount: number): EffectFunction {
    return (data: EffectData) => {
        game.gainCoins(data.issuer, amount);
        return true;
    };
}

export function loseCoinsEffect(game: Game, amount: number): EffectFunction {
    return (data: EffectData) => {
        const nb = game.loseCoins(data.issuer, amount, true);
        return nb === amount;
    };
}

export function rechargeItemsEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        for (const card of data.targets as ItemCard[]) {
            game.recharge(card);
        }
        return true;
    };
}

export function rechargeEachItemsOfTargetEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        const player = data.targets[0] as Player;
        game.rechargeEachItem(player);
        return true;
    };
}

export function makeAPlayerWithMostSoulsDestroyASoulEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        const target = data.targets[0] as Player;
        if (game.playersWithMostSouls.includes(target)) {
            const card = game.select(target, 1, target.souls).selected[0]!;
            return game.destroyCardsOrSouls([card]);
        }
        return false;
    };
}
export function look5Put1TopRestBottomEffect(deckName: string, game: Game): EffectFunction {
    return (data: EffectData) => {
        let cards = game.getFirstCardsOfDeck(deckName, 5);
        let selectionResult = game.select(data.issuer, 1, cards);
        game.addTopPosition(deckName, selectionResult.selected[0]);
        selectionResult.remaining.forEach((c) => {
            game.addBottomPosition(deckName, c);
        });
        return true;
    };
}

export function look1EachDeckEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        let topCards: Card[] = [];
        for (const deckName of ["loot", "treasure", "monster"]) {
            const topCard = game.getFirstCardsOfDeck(deckName, 1)[0];
            topCards.push(topCard!);
        }
        const selectResult = game.select(data.issuer, 3, topCards, true);
        for (const card of selectResult.selected as Card[]) {
            game.getFirstCardsOfDeck(card.type, 1)[0];
            game.addBottomPosition(card.type, card);
        }
        return true;
    };
}

export function paidEffect(s: string, game: Game): EffectFunction {
    const s2 = s.replace("[paid effect] ", "").trim();
    const idx = s2.indexOf(":");
    const lines = [s2.substring(0, idx), s2.substring(idx + 1)].map(line => line.trim());
    if (lines.length < 2) {
        throw new Error(`invalid 'paid' effect format. s=${s}$ lines=${lines}$`);
    }
    const paiement = effectParser(lines[0]!, game);
    const effect = effectParser(lines[1]!, game);

    return (data: EffectData) => {
        if(paiement(data)) {
            return effect(data);
        }
        return false;
    };
}

export function removeCountersEffect(game: Game, amount: number): EffectFunction {
    return (data: EffectData) => {
        if ((data.it as ItemCard).tags.counters! >= amount) {
            (data.it as ItemCard).tags.counters -= amount;
            return true;
        }
        return false;
    };
}

// This becomes a soul and loses all abilities.
export function BecomesSoulEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        
        (data.it as ItemCard).setEternal(false);
        game.removeInPlay(data.issuer, data.it);
        data.it.soul = 1;
        game.addSoul(data.issuer, data.it);
        return true;
    };
}

export function addToDiceRollEffect(game: Game, toAdd: number): EffectFunction {
    return (data: EffectData) => {
        const choosenDiceRoll: DiceRoll = data.targets[0] as DiceRoll;
        choosenDiceRoll.add(toAdd);
        return true;
    };
}

export function chooseOneEffect(s: string, game: Game): EffectFunction {
    const lines = s.split("\n");
    if (lines.length < 3) {
        throw new Error(`invalid 'choose one' effect format. s=${s}$ lines=${lines}$`);
    }
    const effects: EffectFunction[] = lines.slice(1).map(line => effectParser(line, game));
    return (data: EffectData) => {
        const targetsChooseOne = data.targets[0] as ChooseOneResult;
        const description = targetsChooseOne.description;
        const options = targetsChooseOne.chosenOptions;
        for(let i = 0; i < effects.length; i++) {
            if (description === lines[i+1]) {
                return effects[i]!({ it: data.it, issuer: data.issuer, targets: options });
            }
        }
        throw new Error(`choose one effect description not found: ${description}`);
    }
}

export function destroyYourItemAndStealEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        if (data.issuer.inPlay.filter((card) => card.eternal === false).length > 0) {
            const itemToDestroy = game.select(data.issuer, 1, data.issuer.inPlay.filter((card) => card.eternal === false)).selected[0]!;
            itemToDestroy.destroy();
            const itemToSteal = game.select(data.issuer, 1, game.visibleItems.filter((card) => card.eternal === false)).selected[0]!;
            return game.stealItemAnywhere(data.issuer, itemToSteal);
        }
        return false;
    };
}

export function destroyOneEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        const toDestroy = data.targets[0] as Card;
        // game.select(data.issuer, 1, data.targets).selected[0] as Card;
        return game.destroyCardsOrSouls([toDestroy]);
    };
}

export function changeRollDiceResultEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        const choosenDiceRoll: DiceRoll = data.targets[0] as DiceRoll;
        const selectionResult = game.select(data.issuer, 1, [1, 2, 3, 4, 5, 6]);
        const newValue = selectionResult.selected[0] as number;
        choosenDiceRoll.value = newValue;
        return true;
    };
}

export function drawAndGainCoinsAsAPlayerEffect(issuer: Player, target: Player, game: Game): boolean {

    const nbCardsToDraw = Math.max(0, target.hand.length - issuer.hand.length);
    const lootCards = game.loot(issuer, nbCardsToDraw);
    const nbCoinsToGain = Math.max(0, target.coins - issuer.coins);
    issuer.gainCoins(nbCoinsToGain);
    return true;
}

export function swapWithNonEternalItemEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        const itemToSwap = game.select(data.issuer, 1, game.inPlayItems.filter((card) => card instanceof ItemCard && card.eternal === false)).selected[0]!;
        game.swapItems(data.it as ItemCard, itemToSwap);
        return true;
    };
}

export function copyTapAbilityEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        const itemToCopy = game.select(data.issuer, 1, game.inPlayItems.filter((card) => card instanceof ItemCard && card.eternal === false)).selected[0]! as ItemCard;
        const effectToCopy = itemToCopy.onTap();
        return true;
    };
}

export function cancelStackElementEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        game.cancelStackElement(data.targets[0] as StackElement);
        return true;
    };
}

export function stealSoulEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        const soulToSteal = game.select(data.issuer, 1, game.soulsOwned).selected[0]!;
        const target = game.getOwner(soulToSteal);
        game.stealSoul(data.issuer, target!, soulToSteal);
        return true;
    };
}

export function stealCoinsEffect(game: Game, amount: number): EffectFunction {
    return (data: EffectData) => {
        const target = data.targets[0] as Player;
        game.stealCoins(data.issuer, target!, amount);
        return true;
    };
}

export function stealNonEternalItemEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        const itemToSteal = game.select(data.issuer, 1, game.inPlayItems.filter((card) => card instanceof ItemCard && card.eternal === false)).selected[0]!;
        return game.stealItemAnywhere(data.issuer, itemToSteal);
    };
}

export function stealNonEternalItemFromAnywhereEffect(game: Game): EffectFunction {
    return (data: EffectData) => {

        const itemToSteal = data.targets[0] as ItemCard;
        // game.select(data.issuer, 1, game.visibleItems.filter((card) => card instanceof ItemCard && card.eternal === false)).selected[0]!;
        return game.stealItemAnywhere(data.issuer, itemToSteal);
    };
}

export function subtractUpTo2FromRollEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        const choosenDiceRoll: DiceRoll = data.targets[0] as DiceRoll;
        const selectionResult = game.select(data.issuer, 1, [0, 1, 2]);
        const subtractValue = selectionResult.selected[0] as number;
        choosenDiceRoll.subtract(subtractValue);
        return true;
    };
}

export function addUpTo2ToRollEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        const choosenDiceRoll: DiceRoll = data.targets[0] as DiceRoll;
        const selectionResult = game.select(data.issuer, 1, [0, 1, 2]);
        const addValue = selectionResult.selected[0] as number;
        choosenDiceRoll.add(addValue);
        return true;
    };
}

export function add1ToRollEffect(): EffectFunction {
    return (data: EffectData) => {
        const choosenDiceRoll: DiceRoll = data.targets[0] as DiceRoll;
        choosenDiceRoll.add(1);
        return true;
    };
}

export function lootAndGainAsPlayerEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        return drawAndGainCoinsAsAPlayerEffect(data.issuer, data.targets[0] as Player, game);
    };
}

export function cancelPreviousNonRollEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        game.cancelStackElement(data.targets[0] as StackElement);
        return true;
    };
}

export function flushMonsterSlotsEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        game.monsterSlots.flush();
        return true;
    };
}

export function flushMonsterSlotsToBottomEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        game.monsterSlots.flushToBottom();
        return true;
    };
}

export function lookAtHands(game: Game): EffectFunction {
    return (data: EffectData) => {
        game.select(data.issuer, 0, game.allHands());
        return true;
    };
}

export function lookAtTopCardOfDeckEffect(game: Game, putBottom: boolean): EffectFunction {
    return (data: EffectData) => {
        const deckName = data.targets[0] as string;
        const deck = game.decks[deckName];
        if (!deck)
            throw new Error(`Deck ${deckName} not found`);
        const topCard = deck.cards[0];
        // getFirstCardsOfDeck(deckName, 1)[0];
        const selectionResult = game.select(data.issuer, putBottom ? 1 : 0, [topCard!], true);
        if (selectionResult.selected[0] === topCard && putBottom) {
            const topCard2 = deck.draw();
            if (topCard2 !== topCard)
                throw new Error("Top card mismatch");
            game.addBottomPosition(deckName, topCard!);
        }
        return true;
    };
}

export function rerollEachItemEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        const player = data.targets[0] as Player;
        const inplayItems = player.inPlay.filter((card) => card instanceof ItemCard) as ItemCard[];
        for (const card of inplayItems) {
            game.reroll(player, card);
        }
        return true;
    };
}

export function stealRandomLootCardEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        const targetPlayer = data.targets[0] as Player;
        if (targetPlayer.hand.length > 0) {
            const randomIndex = Math.floor(Math.random() * targetPlayer.hand.length);
            const cardToSteal = targetPlayer.hand.cards[randomIndex]!;
            game.stealLootCard(data.issuer, targetPlayer, cardToSteal as LootCard);
        }
        return true;
    };
}

export function destroyThisAndLoot2Effect(game: Game): EffectFunction {
    return (data: EffectData) => {
        game.destroyCardsOrSouls([data.it]);
        game.loot(data.issuer, 2);
        return true;
    };
}

export function discard1LootCardEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        const toDiscard = game.select(data.issuer, 1, data.issuer.hand.cards).selected[0] as LootCard;
        const index = data.issuer.hand.cards.indexOf(toDiscard);
        game.discardFromHand(data.issuer, index + 1);
        return true;
    };
}

export function lookAtPlayerHandAndSwapEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        const otherPlayer = game.select(data.issuer, 1, game.players.filter((p) => p !== data.issuer)).selected[0] as Player;
        const canSwap = otherPlayer.hand.length > 0 && data.issuer.hand.length > 0;
        const selection = game.select(data.issuer, canSwap ? 1 : 0, otherPlayer.hand.cards, true);
        if (selection.selected.length === 0)
            return true;
        const toGive = game.select(data.issuer, 1, data.issuer.hand.cards).selected[0] as LootCard;
        if (game.give(data.issuer, otherPlayer, toGive))
            game.give(otherPlayer, data.issuer, selection.selected[0] as LootCard);
        return true;
    };
}

export function endTurnAndResetStackEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        game.resetStack();
        game.endTurn();
        return true;
    };
}

export function putTopCardOfEachDeckIntoDiscardEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        for (const deckName of ["loot", "treasure", "monster"]) {
            const topCard = game.getFirstCardsOfDeck(deckName, 1)[0];
            game.decks[deckName]!.addDiscardTop(topCard!);
        }
        return true;
    };
}

export function passHandsLeftEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        let tempHand = game.players[0]!.hand;
        for (let i = 0; i < game.players.length; i++) {
            const nextPlayer = game.players[(i + 1) % game.players.length]!;
            tempHand = game.setHand(nextPlayer, tempHand);
        }
        return true;
    };
}

export function rerollDiceEffect(): EffectFunction {
    return (data: EffectData) => {
        const choosenDiceRoll: DiceRoll = data.targets[0] as DiceRoll;
        choosenDiceRoll.roll();
        return true;
    };
}

export function rollAndDealDamageEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        const target = data.targets[0] as Entity;
        const roll = data.issuer.rollDice();
        game.dealDamage(data.issuer, target, data.it, roll.value);
        return true;
    };
}

export function changeRollTo1Or6Effect(game: Game): EffectFunction {
    return (data: EffectData) => {
        const choosenDiceRoll: DiceRoll = data.targets[0] as DiceRoll;
        const selectionResult = game.select(data.issuer, 1, [1, 6]);
        const newValue = selectionResult.selected[0] as number;
        choosenDiceRoll.value = newValue;
        return true;
    };
}

export function getAttackRollEffect(damageDealt: number, damageReceived: number, evasion: number, game: Game): EffectFunction[] {
    const effects: EffectFunction[] = [];
    for (let i = 0; i < 6; i++) {
        effects.push((data: EffectData) => {
            const target = data.targets[0] as Entity;
            if (i + 1 >= evasion) {
                game.dealCombatDamage(data.issuer, target, data.it, damageDealt);
            } else {
                game.dealCombatDamage(target, data.issuer, data.it, damageReceived);
            }
            return true;
        });
    }
    return effects;
}

export function loot1PutCardOnTopEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        game.loot(data.issuer, 1);
        const cardToPutBack = game.select(data.issuer, 1, data.issuer.hand.cards).selected[0] as LootCard;
        const card = game.getCardFromHand(data.issuer, cardToPutBack);
        game.decks["loot"]!.addTopPosition(card);
        return true;
    };
}

export function rerollItemEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        const p: Player = game.getPlayerById(data.targets[0].player)!;
        game.reroll(p, data.targets[0].card);
        return true;
    };
}

export function flushShopToBottomEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        game.shop.flushToBottom();
        return true;
    };
}

export function playerGivesLootCardEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        const targetPlayer = data.targets[0] as Player;
        if (targetPlayer.hand.length > 0) {
            const cardToSteal = game.select(targetPlayer, 1, targetPlayer.hand.cards).selected[0] as LootCard;
            game.stealLootCard(data.issuer, targetPlayer, cardToSteal);
        }
        return true;
    };
}

export function putMonsterFromDiscardOnTopEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        const monsterToPutBack = game.select(data.issuer, 1, game.decks["monster"]!.discard.filter((card) => card.type !== "event")).selected[0] as Card;
        game.decks["monster"]!.remove(monsterToPutBack);
        game.decks["monster"]!.addTopPosition(monsterToPutBack);
        return true;
    };
}
export function putTopCardFromDiscardOnTopEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        const deck = game.decks[data.targets[0] as string];
        if (!deck) {
            throw new Error(`Deck ${data.targets[0] as string} does not exist.`);
        }
        if (deck.discard.length === 0) {
            return false;
        }
        const card = deck.discard[0]!;
        deck.remove(card);
        deck.addTopPosition(card);
        return true;
    };
}

export function putCardFromHandOnTopOfDeckEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        const cardToPutBack = game.select(data.issuer, 1, data.issuer.hand.cards).selected[0] as LootCard;
        const card = game.getCardFromHand(data.issuer, cardToPutBack);
        game.decks["loot"]!.addTopPosition(card);
        return true;
    };
}

export function rechargeThisEffect(): EffectFunction {
    return (data: EffectData) => {
        (data.it as ItemCard).recharge();
        return true;
    };
}

export function cancelAtIndexEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        game.cancelAt(data.targets[0] as number);
        return true;
    };
}

export function removeCounterAndDoEffect(s: string, game: Game): EffectFunction {
    return (data: EffectData) => {
        if ((data.it as ItemCard).tags.counters! > 0) {
            (data.it as ItemCard).tags.counters -= 1;
            effectParser(s.substring(24).trim(), game)(data);
        }
        return true;
    };
}

export function remove3CountersAndDoEffect(s: string, game: Game): EffectFunction {
    return (data: EffectData) => {
        if ((data.it as ItemCard).tags.counters! >= 3) {
            (data.it as ItemCard).tags.counters -= 3;
            effectParser(s.substring(24).trim(), game)(data);
        }
        return true;
    };
}

export function becomesSoulAndGainEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        game.removeInPlay(data.issuer, data.it);
        data.it.soul = 1;
        game.addSoul(data.issuer, data.it);
        return true;
    };
}

// deal 1 damage to each other player.
export function dealDamageToEachOtherPlayerEffect(game: Game, dmg: number): EffectFunction {
    return (data: EffectData) => {
        for (const player of game.players) {
            if (player !== data.issuer) {
                game.dealDamage(data.issuer, player, data.it, dmg);
            }
        }
        return true;
    };
}

export function dealDamageToAnotherPlayerEffect(game: Game, dmg: number): EffectFunction {
    return (data: EffectData) => {
        const target = game.select(data.issuer, 1, game.players.filter((p) => p !== data.issuer)).selected[0] as Player;
        game.dealDamage(data.issuer, target, data.it, dmg);
        return true;
    };
}

export function addInPlayEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        // console.log("adding in play loot card from effect:", data.it.name);
        // game.addInPlay(data.issuer, data.it);
        return true;
    };
}

export function obtainRollResults(s: string): string[] {
    s = s.split("roll-")[1]!.trim();
    const lines: string[] = s.split("\n");
    let results: string[] = new Array<string>(6).fill("");
    for (let line of lines) {
        line = line.trim();
        if (line.length > 0) {
            switch (line[1]) {
                case '-':
                    for (let i = Number(line[0]); i <= Number(line[2]); i++) {
                        results[i - 1] = line.substring(4).trim();
                    }
                    break;
                default:
                    results[Number(line[0]) - 1] = line.substring(3).trim();
                    break;
            }
        }
    }
    return results;
}

export function rollEffect(s: string, game: Game): EffectFunction {
    if (s == "roll-\ndeal damage to them equal to the result.")
        return dealRollDamageEffect(s, game);
    const rollResults = obtainRollResults(s);
    const effects: EffectFunction[] = rollResults.map(effectText => effectParser(effectText, game));
    return (data: EffectData) => {
        const result = data.issuer.rollDice();
        result.attachEffect(effects, data.it, data.targets);
        game.addToStack(result);
        return true;
    };
}

export function dealRollDamageEffect(s: string, game: Game): EffectFunction {
    return (data: EffectData) => {
        const target = data.targets[0] as Entity;
        const roll = data.issuer.rollDice();
        roll.attachEffect([...Array(6).keys()].map((i) =>
            (data: EffectData) => {
                game.dealDamage(data.issuer, data.targets[0] as Entity, data.it, i + 1);
                return true;
            }), data.it, data.targets);
        game.addToStack(roll);
        return true;
    };
}


export function takeDamageGainCoinsEffect(s: string, damage: number, coins: number, game: Game): EffectFunction {
    return (data: EffectData) => {
        const life_before = data.issuer.currentHealthPoints;

        const callback = (data: EffectData) => {
            const damageInstance: DamageOnStack = data.targets[0];
            data.targets = data.targets.slice(1);
            if (damageInstance.damage[0]! >= damage!) {
                game.gainCoins(data.issuer, coins!);
                return true;
            }
            return false;
        }
        game.dealDamage(data.issuer, data.issuer, data.it, damage, callback);
        return true;
    };
}

