// An active effect is an effect that is triggered by a player action, 
// as opposed to a passive effect which is triggered by a game event.


import { DamageOnStack, DiceRoll, Player } from "./player";
import { type Card, LootCard, type EffectFunction, type TargetsSelector, ItemCard, MonsterCard, InplayType, BsoulCard, EffectData } from "./cards";
import { Game } from "./game";
import type { Entity } from "./entity";
import { effect } from "zod/v3";
import type { Stack, StackElement } from "./stack";
import { it } from "zod/locales";
import { effectParser, type ParsedEffect } from "./effectParser";
import { deckSelector, visibleItemSelector, inplayUnchargedItemSelector } from "./targetSelector";
// import { firstAttackRollStatModifierEffect, gainCoinsOnDamageEffect, gainPlusCoinsEffect, goFirstInTurnOrderEffect, LookAndPutBottomEffect, lootOnPlayerDeathEffect, preventDamageOnRollEffect, preventNextDamageUpToEffect, rollDiceOnTriggerEffect, startingItemEffect, temporaryStatModifierEffect, gainTreasureOnDeathEffect } from "./abilities";
import *  as passive from "./passiveEffect";
import type { BonusSoulCardType } from "@/types/cardTypes";
import type { Monster } from "./monster";
import { string } from "zod";

export function gainCoinsEffect(game: Game, amount: number): EffectFunction {
    return (data: EffectData) => {
        if(data.issuer instanceof Player === false) return false;
        game.gainCoins(data.issuer, amount);
        return true;
    };
}

export function loseCoinsEffect(game: Game, amount: number): EffectFunction {
    return (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        const nb = game.loseCoins(data.issuer, amount, true);
        return nb === amount;
    };
}

export function rechargeItemsEffect(game: Game, selectionOnResolve: boolean = false): EffectFunction {
    return async (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        if (selectionOnResolve) {
            const selectionResult = await game.select(data.issuer, 1, inplayUnchargedItemSelector(game)(data.issuer), true);
            if (selectionResult.selected.length > 0) {
                game.recharge(selectionResult.selected[0] as ItemCard);
            }
        }
        else {
            // data.targets is the array of items to recharge
            for (const card of data.targets as ItemCard[]) {
                game.recharge(card);
            }
        }
        return true;
    };
}

export function makePlayerGiveLootCardEffect(game: Game): EffectFunction {
    return async (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        const targetPlayer = data.next as Player;
        if(targetPlayer === data.issuer) return true;
        if (targetPlayer.hand.length > 0) {
            const cardToGive = (await game.select(targetPlayer, 1, targetPlayer.hand.cards)).selected[0] as LootCard;
            return game.give(targetPlayer, data.issuer, cardToGive);
        }
        return false;
    };
}

export function rechargeEachItemsOfTargetEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        const player = data.next as Player;
        game.rechargeEachItem(player);
        return true;
    };
}

export function makeAPlayerWithMostSoulsDestroyASoulEffect(game: Game): EffectFunction {
    return async (data: EffectData) => {
        const target = data.next as Player;
        if (game.playersWithMostSouls.includes(target)) {
            const card = (await game.select(target, 1, target.souls)).selected[0]!;
            return game.destroyCardsOrSouls([card]);
        }
        return false;
    };
}

export function forceAttackMonsterEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        const targetMonster = data.next as Monster;
        game.currentPlayer.mustAttack(targetMonster);
        return true;
    };
}

export function look5Put1TopRestBottomEffect(deckName: string, game: Game): EffectFunction {
    return async (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        let cards = game.getFirstCardsOfDeck(deckName, 5);
        let selectionResult = await game.select(data.issuer, 1, cards);
        game.addTopPosition(deckName, selectionResult.selected[0]);
        selectionResult.remaining.forEach((c) => {
            game.addBottomPosition(deckName, c);
        });
        return true;
    };
}

export function look1EachDeckEffect(game: Game): EffectFunction {
    return async (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        let topCards: Card[] = [];
        for (const deckName of ["loot", "treasure", "monster"]) {
            const topCard = game.getFirstCardsOfDeck(deckName, 1)[0];
            topCards.push(topCard!);
        }
        const selectResult = await game.select(data.issuer, 3, topCards, true);
        for (const card of selectResult.selected as Card[]) {
            game.getFirstCardsOfDeck(card.type, 1)[0];
            game.addBottomPosition(card.type, card);
        }
        return true;
    };
}


export function removeCountersEffect(game: Game, amount: number): EffectFunction {
    return (data: EffectData) => {
        if(!(data.it as ItemCard).tags.counters)
            (data.it as ItemCard).tags.counters = 0;
        if ((data.it as ItemCard).tags.counters as number >= amount) {
            (data.it as ItemCard).tags.counters -= amount;
            return true;
        }
        return false;
    };
}

// This becomes a soul and loses all abilities.
export function BecomesSoulEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        (data.it as ItemCard).setEternal(false);
        game.removeInPlay(data.issuer, data.it);
        data.it.soul = 1;
        game.addSoul(data.issuer, data.it);
        return true;
    };
}

export function addToDiceRollEffect(game: Game, toAdd: number): EffectFunction {
    return (data: EffectData) => {
        const choosenDiceRoll: DiceRoll = data.next as DiceRoll;
        choosenDiceRoll.add(toAdd);
        return true;
    };
}

export function chooseOneEffect(s: string, game: Game): ParsedEffect {
    const lines = s.split("\n");
    if (lines.length < 3) {
        throw new Error(`invalid 'choose one' effect format. s=${s}$ lines=${lines}$`);
    }
    const effects: ParsedEffect[] = lines.slice(1).map(line => effectParser(line, game));
    
    return {
        effectFunction: async (data: EffectData) => {
            const description = (data.next as string).toLowerCase();
            for(let i = 0; i < effects.length; i++) {
                if (description === lines[i+1]) {
                    // Create new EffectData with chosen options as targets
                    return await effects[i]!.effectFunction(data);
                }
            }
            throw new Error(`choose one effect description not found: ${description}`);
        },
        targetSelectors: [{ 
            description: "Choose one:", 
            selector: (issuer: Player) => {
                // Construct ChooseOneOptions array from parsed effects
                return effects.map((effect, i) => ({
                    description: lines[i + 1]!,
                    admissibleTargets: effect.targetSelectors.map(ts => ts.selector(issuer)).flat()
                }));
            }, 
            count: 1, 
            asMany: false 
        }]
    };
}


export function searchGuppyItemEffect(game: Game): EffectFunction {
    return async (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        const guppyItems = game.decks["treasure"]!.cards.filter(card => card instanceof ItemCard && (card as ItemCard).isGuppy);
        if (guppyItems.length === 0) return false;
        const selectedGuppyItem = (await game.select(data.issuer, 1, guppyItems)).selected[0] as ItemCard;
        game.addInPlay(data.issuer, selectedGuppyItem);
        return true;
    };
}

export function expandSlotsEffect(slotText: string, numberToExpand: number, game: Game): EffectFunction {
    return (data: EffectData) => {
        const slot = slotText === "shop" ? game.shop : game.encounters;
        slot.expand(numberToExpand);
        return true;
    };
}

export function shuffleTreasureDeckEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        game.decks["treasure"]!.shuffle();
        return true;
    };
}
// export function destroyYourItemAndStealEffect(game: Game): EffectFunction {
//     return async (data: EffectData) => {
//         if (data.issuer instanceof Player === false) return false;
//         if (data.issuer.inPlay.filter((card) => card.eternal === false).length > 0) {
//             const itemToDestroy = (await game.select(data.issuer, 1, data.issuer.inPlay.filter((card) => card.eternal === false))).selected[0]!;
//             itemToDestroy.destroy();
//             const itemToSteal = (await game.select(data.issuer, 1, game.visibleItems.filter((card) => card.eternal === false))).selected[0]!;
//             return game.stealItemAnywhere(data.issuer, itemToSteal);
//         }
//         return false;
//     };
// }

export function destroyOneEffect(game: Game, selectionOnResolve: boolean=false): EffectFunction {
    return async (data: EffectData) => {
        let toDestroy = data.next as Card;
        if(selectionOnResolve) {
            toDestroy = (await game.select(data.issuer as Player, 1, data.targets)).selected[0] as Card;
        }
        return game.destroyCardsOrSouls([toDestroy]);
    };
}

export function destroyTwoItemsEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        const toDestroy = data.next as Card;
        const toDestroy2 = data.next as Card;
        // game.select(data.issuer, 1, data.targets).selected[0] as Card;
        return game.destroyCardsOrSouls([toDestroy, toDestroy2]);
    };
}

export function changeRollDiceResultEffect(game: Game): EffectFunction {
    return async (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        const choosenDiceRoll: DiceRoll = data.next as DiceRoll;
        const selectionResult = await game.select(data.issuer, 1, [1, 2, 3, 4, 5, 6]);
        const newValue = selectionResult.selected[0] as number;
        choosenDiceRoll.value = newValue;
        return true;
    };
}

export function drawAndGainCoinsAsAPlayerEffect(issuer: Player, target: Player, game: Game): boolean {

    const nbCardsToDraw = Math.max(0, target.hand.length - issuer.hand.length);
    const lootCards = game.loot(issuer, nbCardsToDraw);
    const nbCoinsToGain = Math.max(0, target.coins - issuer.coins);
    game.gainCoins(issuer, nbCoinsToGain);
    return true;
}

export function swapWithNonEternalItemEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        const itemToSwap = data.next as ItemCard;
        // game.select(data.issuer, 1, game.inPlayItems.filter((card) => card instanceof ItemCard && card.eternal === false)).selected[0]!;
        game.swapItems(data.it as ItemCard, itemToSwap);
        return true;
    };
}

export function copyTapAbilityEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        const itemToCopy = data.next as ItemCard;
        const activeEffect = itemToCopy.getActiveEffect();
        if (!activeEffect)
            throw new Error(`Item ${itemToCopy.name} has no active effect to copy.`);
        // The next target is expected to be an array of targets for the copied effect
        const copiedEffectTargets = data.next as any[];
        return activeEffect.effectFunction(new EffectData(data.it, data.issuer, copiedEffectTargets));
    };
}

export function becomesCopyOfItemIndefinitelyEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        const itemToCopy = data.next as ItemCard;
        const thisItem = data.it as ItemCard;
        
        // Get the owner
        const owner = game.getOwner(thisItem);
        if (!owner) return false;
        
        // Create a temporary copy to get the JSON from
        const templateCopy = game.copyCard(itemToCopy) as ItemCard;
        
        // Transform this card to become the copy, with effect attachment
        thisItem.becomesCopyOf(templateCopy, (card) => {
            game.attachEffectsToCard(card);
        });
        
        // Re-subscribe the new effects with the current owner
        thisItem.onAddInPlay(owner);
        
        return true;
    };
}

export function becomesCopyOfItemUntilEndOfTurnEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        const itemToCopy = data.next as ItemCard;
        const thisItem = data.it as ItemCard;
        
        // Get the owner
        const owner = game.getOwner(thisItem);
        if (!owner) return false;
        
        // Create a temporary copy to get the JSON from
        const templateCopy = game.copyCard(itemToCopy) as ItemCard;
        
        // Transform this card to become the copy and get the restore function
        const { restore } = thisItem.becomesCopyOf(templateCopy, (card) => {
            game.attachEffectsToCard(card);
        });
        
        // Re-subscribe the new effects
        thisItem.onAddInPlay(owner);
        
        // Subscribe to end of turn event to restore the original card
        const unsubscribe = game.emitter.on("on:turn:end", (event) => {
            if (event.eventIssuer === owner) {
                restore(); // restore() will call cleanup() internally
                unsubscribe();
            }
        });
        
        return true;
    };
}

export function cancelStackElementEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        game.cancelStackElement(data.next as StackElement);
        return true;
    };
}

export function stealSoulEffect(game: Game): EffectFunction {
    return async (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        const soulToSteal = (await game.select(data.issuer, 1, game.soulsOwned)).selected[0]!;
        const target = game.getOwner(soulToSteal);
        game.stealSoul(data.issuer, target!, soulToSteal);
        return true;
    };
}

export function stealCoinsEffect(game: Game, amount: number): EffectFunction {
    return (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        const target = data.next as Player;
        game.stealCoins(data.issuer, target!, amount);
        return true;
    };
}

export function stealNonEternalItemEffect(game: Game): EffectFunction {
    return async (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;

        // const selection = await game.select(data.issuer, 1, game.inPlayItems.filter(({player, card}) => card instanceof ItemCard && card.eternal === false));
        const itemToSteal = data.next;
        // selection.selected[0]!.card as ItemCard;
        return game.stealItemAnywhere(data.issuer, itemToSteal);
    };
}

export function stealNonEternalItemFromAnywhereEffect(game: Game): EffectFunction {
    return async (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;

        // const selection = await game.select(data.issuer, 1, game.visibleItems.filter((card) => card instanceof ItemCard && card.eternal === false));
        const itemToSteal = data.next;
        // data.next as ItemCard;
        return game.stealItemAnywhere(data.issuer, itemToSteal);
    };
}

export function subtractUpTo2FromRollEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        const choosenDiceRoll: DiceRoll = data.next as DiceRoll;
        // const selectionResult = game.select(data.issuer, 1, [0, 1, 2]);
        const subtractValue = data.next as number;
        choosenDiceRoll.subtract(subtractValue);
        return true;
    };
}

export function addUpTo2ToNonAtkRollEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        const choosenDiceRoll: DiceRoll = data.next as DiceRoll;
        if(choosenDiceRoll.attackRoll) {
            return false;
        }
        // const selectionResult = game.select(data.issuer, 1, [0, 1, 2]);
        const addValue = data.next as number;
        choosenDiceRoll.add(addValue);
        return true;
    };
}

export function add1ToRollEffect(): EffectFunction {
    return (data: EffectData) => {
        const choosenDiceRoll: DiceRoll = data.next as DiceRoll;
        choosenDiceRoll.add(1);
        return true;
    };
}

export function lootAndGainAsPlayerEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        return drawAndGainCoinsAsAPlayerEffect(data.issuer, data.next as Player, game);
    };
}

export function cancelPreviousNonRollEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        game.cancelStackElement(data.next as StackElement);
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
    return async (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        await game.select(data.issuer, 0, game.allHands());
        return true;
    };
}

export function swapNonEternalItemsEffect(game: Game): EffectFunction {
    return async (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        const otherPlayer = data.next as Player;
        if(otherPlayer === data.issuer) return true;
        const itemToSwapFromIssuer = (await game.select(data.issuer, 1, data.issuer.inPlay.filter((card) => card instanceof ItemCard && card.eternal === false))).selected[0] as ItemCard;
        const itemToSwapFromOtherPlayer = (await game.select(data.issuer, 1, otherPlayer.inPlay.filter((card) => card instanceof ItemCard && card.eternal === false))).selected[0] as ItemCard;
        return game.swapItems(itemToSwapFromIssuer, itemToSwapFromOtherPlayer);
    }
}
export function flushOneMonsterSlotEffect(game: Game): EffectFunction {
    return async (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        const monsterToFlush = (await game.select(data.issuer, 1, game.monsters.filter((m) => m !== null && !m.isEngagedInCombat))).selected[0] as Monster;
        if(monsterToFlush === undefined) return true;
        game.monsterSlots.flushMonster(monsterToFlush);
        return true;
    };
}

export function addCountersAndGainTreasureEffect(countersThreshold: number, treasureToGain: number, game: Game): EffectFunction {
    return (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        const dmg = data.next.damageTaken as number;
        data.it.tags.counters = (data.it.tags.counters ?? 0) + dmg;
        if (data.it.tags.counters >= countersThreshold) {
            data.it.tags.counters -= countersThreshold;
            game.gainTreasure(data.issuer, treasureToGain);
        }
        return true;
    };
}

export function putTopMonsterInValidSlotEffect(game: Game): EffectFunction {
    return async (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        const nonAttackedSlots = game.monsterSlots.nonAttackedSlots;
        const index = (await game.select(data.issuer, 1, nonAttackedSlots)).selected[0];
        game.monsterSlots.draw(index);
        return true;
    };
}
// if you have 0¢, gain 6¢.
export function gainXCoinsIfYEffect(coinsToHave: number, coinsToGain: number, game: Game): EffectFunction {
    return (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        if (data.issuer.coins === coinsToHave) {
            game.gainCoins(data.issuer, coinsToGain);
        }
        return true;
    };
}

export function lootXIfYEffect(cardsToHave: number, atLeast: boolean, cardsToLoot: number, game: Game): EffectFunction {
    return (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        if (atLeast ? data.issuer.hand.length >= cardsToHave : data.issuer.hand.length === cardsToHave) {
            game.loot(data.issuer, cardsToLoot);
        }
        return true;
    };
}

export function discardAnyNumberOfLootCardsEffect(game: Game): EffectFunction {
    return async (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        const player = data.issuer;
        const maxToDiscard = player.hand.length;
        const selectionResult = await game.select(player, maxToDiscard, player.hand.cards, true);
        const nbDiscarded = selectionResult.selected.length;
        for (const card of selectionResult.selected) {
            const index = player.hand.cards.indexOf(card);
            game.discardFromHand(player, index + 1);
        }
        data.addTarget(nbDiscarded);
        return true;
    };
}

export function forcePlayerRerollDiceEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        const dice = data.targets.find((t) => t.diceThatWouldRoll !== undefined);
        const diceRoll: DiceRoll = data.next as DiceRoll;
        diceRoll.roll();
        return true;
    };
}

export function lootEqualToCardsDiscardedEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        const nbToLoot = data.next as number;
        game.loot(data.issuer, nbToLoot);
        return true;
    };
}

export function discardTopOfDeckEffect(game: Game): EffectFunction {
    return async (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        const deckName = (await game.select(data.issuer, 1, deckSelector(undefined, game)(data.issuer), false)).selected[0];
        const deck = game.decks[deckName];
        if (!deck) {
            throw new Error(`Deck ${deckName} does not exist.`);
        }
        const topCard = deck.draw();
        deck.addDiscardTop(topCard);
        return true;
    };
}

// Look at the top card of a deck. You may put it back.
export function LookAndPutBottomEffect(
    deckName: string,
    game: Game
): EffectFunction {
    return async (data:EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        const deck = game.decks[deckName];
        if (!deck) {
            throw new Error(`Deck ${deckName} does not exist.`);
        }
        const topCard = deck.draw();
        const res = await game.select(data.issuer, 1, [topCard], true);
        if (res.selected.length > 0) {
            deck.addBottomPosition(topCard);
        } else {
            deck.addTopPosition(topCard);
        }   
        return true;
    };
}
// choose a player at random. That player destroys an item they control.
export function destroyItemOfRandomPlayerEffect(game: Game): EffectFunction {

    return async (data: EffectData) => {
        const players = game.players;
        const randomIndex = Math.floor(Math.random() * players.length);
        const targetPlayer = players[randomIndex]!;
        const item = (await game.select(targetPlayer, 1, targetPlayer.inPlay.filter((card) => card instanceof ItemCard && card.eternal === false))).selected[0]!;
        return game.destroyCardsOrSouls([item]);
    };
}

export function discardAnyNumberOfShopItemsEffect(game: Game): EffectFunction {
    return async (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        const shop = game.shop;
        const maxToDiscard = shop._slots.filter((slot) => slot !== undefined).length;
        const selectionResult = await game.select(data.issuer, maxToDiscard, shop._slots.filter((slot) => slot !== undefined) as ItemCard[], true);
        for (const card of selectionResult.selected) {
            const index = shop._slots.indexOf(card);
            game.discardFromShop(index);
        }
        data.addTarget(selectionResult.selected.length);
        return true;
    };
}

export function lookAndOrderEffect(deckName: string, numberOfCards: number, game: Game): EffectFunction {
    return async (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        let cards = game.getFirstCardsOfDeck(deckName, numberOfCards);
        let selectionResult = await game.select(data.issuer, numberOfCards, cards);
        for (let i = 0; i < selectionResult.selected.length; i++) {
            game.addTopPosition(deckName, selectionResult.selected[numberOfCards - 1 - i]!);
        }
        return true;
    };
}
export function putCountersOnItemEffect(amount: number, game: Game): EffectFunction {   
    return (data: EffectData) => {
        data.it.tags.counters = (data.it.tags.counters ?? 0) + amount;
        return true;
    };
}

export type cardDestination =
    | "just_watch"
    | "bottom"
    | "discard";
    
export function lookAtTopCardOfDeckEffect(game: Game, canPutWhere: cardDestination, selectionOnResolve = false): EffectFunction {
    return async (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        const deckName = selectionOnResolve 
            ? (await game.select(data.issuer, 1, deckSelector(undefined, game)(data.issuer))).selected[0] as string
            : data.next as string;
        const deck = game.decks[deckName];
        if (!deck)
            throw new Error(`Deck ${deckName} not found`);
        const topCard = deck.cards[0];
        // getFirstCardsOfDeck(deckName, 1)[0];
        const justWatch = canPutWhere === "just_watch";
        const selectionResult = await game.select(data.issuer, justWatch ? 0 : 1, [topCard!], true);
        if (selectionResult.selected[0] === topCard) {
        switch (canPutWhere) {
            case "just_watch":
                return true;
            case "bottom":
            {
                const topCard2 = deck.draw();
                if (topCard2 !== topCard)
                    throw new Error("Top card mismatch");
                game.addBottomPosition(deckName, topCard!);
                break;
            }
            case "discard":
                {
                    const topCard2 = deck.draw();
                    if (topCard2 !== topCard)
                        throw new Error("Top card mismatch");
                    game.discard(topCard);
                    break;
                }
            }
        };
        return true;
    }
}

export function rerollEachItemEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        const player = data.next as Player;
        const inplayItems = player.inPlay.filter((card) => card instanceof ItemCard && !card.eternal) as ItemCard[];
        for (const card of inplayItems) {
            game.reroll(player, card);
        }
        return true;
    };
}

export function eachPlayersVoteToDestroyItemEffect(game: Game): EffectFunction {
    return async (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        const ListOfItems = visibleItemSelector((card) => card.eternal === false, game)(data.issuer);

        // Request votes from all players in parallel
        const voteRequests = game.players.map(player => ({
            player,
            count: 1,
            options: ListOfItems,
            asMany: false
        }));
        const voteResults = await game.selectMultiple(voteRequests);

        // Count the votes
        const votes: Record<string, number> = {};
        for (const result of voteResults) {
            const vote = result.selected[0].slug as string;
            votes[vote] = (votes[vote] || 0) + 1;
        }

        // Find the item with most votes
        let itemToDestroy: ItemCard | null = null;
        let votesToDestroy = 0;
        for (const [itemSlug, voteCount] of Object.entries(votes)) {
            if(voteCount === votesToDestroy) itemToDestroy = null;
            if (voteCount > votesToDestroy) {
                votesToDestroy = voteCount;
                itemToDestroy = ListOfItems.find((item) => item.slug === itemSlug)!;
            }
        }
        if (itemToDestroy !== null) {
            game.destroyCardsOrSouls([itemToDestroy]);
        }
        return true;
    };
}


export function stealRandomLootCardEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        const targetPlayer = data.next as Player;
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
        if (data.issuer instanceof Player === false) return false;
        game.destroyCardsOrSouls([data.it]);
        game.loot(data.issuer, 2);
        return true;
    };
}

export function discardNLootCardsEffect(n: number, game: Game, selectionOnResolve: boolean = false): EffectFunction {
    return async (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        for (let i = 0; i < n; i++) {
            let toDiscard = data.next as LootCard;
            if (selectionOnResolve || !toDiscard) 
                toDiscard = (await game.select(data.issuer, 1, data.issuer.hand.cards)).selected[0] as LootCard;
            const index = data.issuer.hand.cards.indexOf(toDiscard);
            game.discardFromHand(data.issuer, index + 1);
        }
        return true;
    };
}

export function lookAtPlayerHandAndSwapEffect(game: Game): EffectFunction {
    return async (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        const otherPlayer = (await game.select(data.issuer, 1, game.players.filter((p) => p !== data.issuer))).selected[0] as Player;
        const canSwap = otherPlayer.hand.length > 0 && data.issuer.hand.length > 0;
        const selection = await game.select(data.issuer, canSwap ? 1 : 0, otherPlayer.hand.cards, true);
        if (selection.selected.length === 0)
            return true;
        const toGive = (await game.select(data.issuer, 1, data.issuer.hand.cards)).selected[0] as LootCard;
        if (game.give(data.issuer, otherPlayer, toGive))
            game.give(otherPlayer, data.issuer, selection.selected[0] as LootCard);
        return true;
    };
}

export function lookAtHandAndStealLootEffect(game: Game): EffectFunction {
    return async (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        const otherPlayer = (await game.select(data.issuer, 1, game.players.filter((p) => p !== data.issuer))).selected[0] as Player;
        const canSteal = otherPlayer.hand.length > 0;
        const selection = await game.select(data.issuer, canSteal ? 1 : 0, otherPlayer.hand.cards, true);
        if (selection.selected.length === 0)
            return true;
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
        const choosenDiceRoll: DiceRoll = data.next as DiceRoll;
        choosenDiceRoll.roll();
        return true;
    };
}

export function rollAndDealDamageEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        const target = data.next as Entity;
        const roll = data.issuer.rollDice();
        game.dealDamage(data.issuer, target, data.it, roll.value);
        return true;
    };
}

export function changeRollTo1Or6Effect(game: Game): EffectFunction {
    return async (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        const choosenDiceRoll: DiceRoll = data.next as DiceRoll;
        const selectionResult = await game.select(data.issuer, 1, [1, 6]);
        const newValue = selectionResult.selected[0] as number;
        choosenDiceRoll.value = newValue;
        return true;
    };
}

export function youMayRechargeThisEffect(game: Game): EffectFunction {
    return async (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        const selectionResult = await game.select(data.issuer, 1, [data.it], true);
        if (selectionResult.selected.length > 0) {
            game.recharge(data.it as ItemCard);
        }
        return true;
    };
}

export function youMayRechargeAnItemEffect(game: Game): EffectFunction {
    return async (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        const selectionResult = await game.select(data.issuer, 1, inplayUnchargedItemSelector(game)(data.issuer), true);
        if (selectionResult.selected.length > 0) {
            game.recharge(selectionResult.selected[0] as ItemCard);
        }
        return true;
    };
}

export function getAttackRollEffect(damageDealt: number, damageReceived: number, evasion: number, game: Game): EffectFunction[] {
    const effects: EffectFunction[] = [];
    for (let i = 0; i < 6; i++) {
        effects.push((data: EffectData) => {
            const target = data.next as Entity;
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
    return async (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        game.loot(data.issuer, 1);
        const cardToPutBack = (await game.select(data.issuer, 1, data.issuer.hand.cards)).selected[0] as LootCard;
        const card = game.getCardFromHand(data.issuer, cardToPutBack);
        game.decks["loot"]!.addTopPosition(card);
        return true;
    };
}

export function healEffect(game: Game, amount: number): EffectFunction {
    return (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        game.heal(data.issuer, amount);
        return true;
    };
}

export function rerollItemEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        const card = data.next;
        const p: Player = game.getOwner(card)!;
        game.reroll(p, card);
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
    return async (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        const targetPlayer = data.next as Player;
        if (targetPlayer.hand.length > 0) {
            const cardToSteal = (await game.select(targetPlayer, 1, targetPlayer.hand.cards)).selected[0] as LootCard;
            game.stealLootCard(data.issuer, targetPlayer, cardToSteal);
        }
        return true;
    };
}

export function putMonsterFromDiscardOnTopEffect(game: Game): EffectFunction {
    return async (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        const monsterToPutBack = (await game.select(data.issuer, 1, game.decks["monster"]!.discard.filter((card) => card.type !== "event"))).selected[0] as Card;
        game.decks["monster"]!.remove(monsterToPutBack);
        game.decks["monster"]!.addTopPosition(monsterToPutBack);
        return true;
    };
}
export function putTopCardFromDiscardOnTopEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        const deckName = data.next as string;
        const deck = game.decks[deckName];
        if (!deck) {
            throw new Error(`Deck ${deckName} does not exist.`);
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
    return async (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        const cardToPutBack = (await game.select(data.issuer, 1, data.issuer.hand.cards)).selected[0] as LootCard;
        const card = game.getCardFromHand(data.issuer, cardToPutBack);
        game.decks["loot"]!.addTopPosition(card);
        return true;
    };
}

export function rechargeThisEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        (data.it as ItemCard).recharge();
        return true;
    };
}
export function forceAttackMonsterDeckEffect(game: Game, times: number): EffectFunction {
    return (data: EffectData) => {
        for (let i = 0; i < times; i++) {
            game.playerMustAttackList(data.issuer as Player).push("topDeck");
        }
        return true;
    };
}

export function cancelAtIndexEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        game.cancelAt(data.next as number);
        return true;
    };
}

export function becomesSoulAndGainEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
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
    return async (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        const target = (await game.select(data.issuer, 1, game.players.filter((p) => p !== data.issuer))).selected[0] as Player;
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

export function putAnyNumberFromDiscardOnTopEffect(deckName: string, game: Game): EffectFunction {
    return async (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        const deck = game.decks[deckName];
        if (!deck) {
            throw new Error(`Deck ${deckName} does not exist.`);
        }
        const maxToPutBack = deck.discard.length;
        const selectionResult = await game.select(data.issuer, maxToPutBack, deck.discard, true);
        for (let i = 0; i < selectionResult.selected.length; i++) {
            const card = selectionResult.selected[i]!;
            deck.remove(card);
            deck.addTopPosition(card);
        }
        return true;
    };
}

export function lootCardsEffect(game: Game, nbCards: number): EffectFunction {
    return (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        game.loot(data.issuer, nbCards);
        return true;
    };
}

export function rechargeCharaEffect(game: Game): EffectFunction {
    return async (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        if (data.issuer.character.charged === false) {
            const selection = await game.select(data.issuer, 1, [data.issuer.character], true);
            if (selection.selected.length > 0)
                game.recharge(data.issuer.character);
        }
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

export function rollEffect(s: string, game: Game): ParsedEffect {
    if (s == "roll-\ndeal damage to them equal to the result.")
        return dealRollDamageEffect(s, game);
    const rollResults = obtainRollResults(s);
    const parsedEffects: ParsedEffect[] = rollResults.map(effectText => effectParser(effectText, game));
    const effects: EffectFunction[] = parsedEffects.map(p => p.effectFunction);
    return {
        effectFunction: (data: EffectData) => {
            if (data.issuer instanceof Player === false) return false;
            const result = data.issuer.rollDice();
            result.attachEffect(effects, data.it, data.targets);
            game.addToStack(result);
            return true;
        },
        targetSelectors: [] // roll has special target handling based on the roll result
    };
}

export function preventDeathEndTurnEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        if(data.issuer instanceof Player === false) return false;
        game.preventDeath(data.issuer);
        if (game.currentPlayer === data.issuer) {
            game.resetStack();
            game.endTurn();
        }
        return true;
    };
}

export function dealRollDamageEffect(s: string, game: Game): ParsedEffect {
    return {
        effectFunction: (data: EffectData) => {
            if (data.issuer instanceof Player === false) return false;
            const target = data.next as Entity;
            const roll = data.issuer.rollDice();
            roll.attachEffect([...Array(6).keys()].map((i) =>
                (data: EffectData) => {
                    game.dealDamage(data.issuer, data.next as Entity, data.it, i + 1);
                    return true;
                }), data.it, [target]);
            game.addToStack(roll);
            return true;
        },
        targetSelectors: [] // Special roll damage handling
    };
}


export function takeDamageGainCoinsEffect(s: string, damage: number, coins: number, game: Game): EffectFunction {
    return (data: EffectData) => {
        const life_before = data.issuer.currentHealthPoints;

        const callback = (data: EffectData) => {
            if (data.issuer instanceof Player === false) return false;
            const damageInstance: DamageOnStack = data.next;
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

export function killTargetEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        game.kill(data.issuer, data.next as Entity, data.it);
        return true;
    };
}

export function deathTargetEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        game.death(data.next, data.issuer, data.it);
        return true;
    };
}

export function gainTreasuresEffect(game: Game, amount: number): EffectFunction {
    return (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        game.gainTreasure(data.issuer, amount);
        return true;
    };
}

export function payHealthEffect(game: Game, amount: number): EffectFunction {
    return (data: EffectData) => {
        return game.healthLoss(data.issuer, data.issuer, data.it, amount);
    };
}

export function payCoinsEffect(game: Game, amount: number): EffectFunction {
    return (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        return game.loseCoins(data.issuer, amount, false) === amount;
    };
}

export function eachPlayerGainsCoinsEffect(game: Game, amount: number): EffectFunction {
    return (data: EffectData) => {
        for (const player of game.players) {
            game.gainCoins(player, amount);
        }
        return true;
    };
}

export function eachPlayerLootsEffect(game: Game, amount: number): EffectFunction {
    return (data: EffectData) => {
        for (const player of game.players) {
            game.loot(player, amount);
        }
        return true;
    };
}

export function dealDamageToEachPlayerEffect(game: Game, amount: number): EffectFunction {
    return (data: EffectData) => {
        for (const player of game.players) {
            game.dealDamage(data.issuer, player, data.it, amount);
        }
        return true;
    };
}

export function dealDamageToEachMonsterEffect(game: Game, amount: number): EffectFunction {
    return (data: EffectData) => {
        for (const monster of game.monsters) {
            game.dealDamage(data.issuer, monster, data.it, amount);
        }
        return true;
    };
}

export function takeDamageEffect(game: Game, amount: number): EffectFunction {
    return (data: EffectData) => {
        game.dealDamage(data.issuer, data.issuer, data.it, amount);
        return true;
    };
}

export function dealDamageToTargetEffect(game: Game, amount: number): EffectFunction {
    return (data: EffectData) => {
        const target = data.next as Entity;
        game.dealDamage(data.issuer, target, data.it, amount);
        return true;
    };
}

export function giveItemToAnotherPlayerEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        const itemToGive = data.next as ItemCard;
        const targetPlayer = data.next as Player;
        return game.give(data.issuer, targetPlayer, itemToGive);
    };
}

export function lookAndReorderTopCardsEffect(game: Game): EffectFunction {
    return async (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        const deckName = data.next as string;
        const top5Cards = game.getFirstCardsOfDeck(deckName, 5);
        const selectionResult = await game.select(data.issuer, 5, top5Cards, false);
        for (let i = selectionResult.selected.length - 1; i >= 0; i--) {
            game.addTopPosition(deckName, selectionResult.selected[i]!);
        }
        return true;
    };
}

export function addOrSubtract1FromRollEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        const choosenDiceRoll: DiceRoll = data.next as DiceRoll;
        const value = data.next as number;
        if (value === 1) 
            choosenDiceRoll.add(1);
        else if (value === -1)
            choosenDiceRoll.subtract(1);
        return true;
    };
}

export function putThisIntoDiscardEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        if (data.it.subtype !== "event") {
            const type = data.it.type;
            game.decks[type]?.addDiscardTop(data.it);
        }
        return true;
    };
}

export function killMonsterEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        const targetMonster = data.next as Monster;
        game.kill(data.issuer, targetMonster, data.it);
        return true;
    };
}

export function enterPlayBecomeSoulEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        game.removeInPlay(data.issuer, data.it);
        data.it.soul = 1;
        game.addSoul(data.issuer, data.it);
        return true;
    };
}

export function playUnlimitedLootCardsThisTurnEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        game.addLootPlay(data.issuer, Infinity);
        return true;
    };
}

export function putThisOnBottomOfLootDeckEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        game.addBottomPosition("loot", data.it);
        return true;
    };
}

export function takeExtraTurnEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        if (game.currentPlayer === data.issuer) {
            game.addExtraTurn(data.issuer);
            return true;
        }
        return false;
    };
}

export function rerollDiceByControllerEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        const choosenDiceRoll: DiceRoll = data.next as DiceRoll;
        choosenDiceRoll.roll();
        return true;
    };
}

export function putLootCardFromHandOnTopOfDeckEffect(game: Game): EffectFunction {
    return async (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        const cardToPutBack = (await game.select(data.issuer, 1, data.issuer.hand.cards)).selected[0] as LootCard;
        const card = game.getCardFromHand(data.issuer, cardToPutBack);
        game.decks["loot"]!.addTopPosition(card);
        return true;
    };
}

export function thisBecomeSoulGainItEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        game.removeInPlay(data.issuer, data.it);
        data.it.soul = 1;
        game.addSoul(data.issuer, data.it);
        return true;
    };
}

