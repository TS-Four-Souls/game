// An active effect is an effect that is triggered by a player action, 
// as opposed to a passive effect which is triggered by a game event.


import { DamageOnStack, DiceRoll, Player } from "./player";
import { type Card, LootCard, ItemCard, MonsterCard, InplayType, BsoulCard, EffectOnStack, isDeckType, assertCardMatchesDeck, Deck, TreasureCard } from "./cards";
import { EffectData, type EffectFunction, type TargetsSelector, type DeckType } from "./types/cardTypes";
import { Game } from "./game";
import { Entity } from "./entity";
import { effect } from "zod/v3";
import type { OnTurnEndData } from "./types/eventTypes";
import type { Stack, StackElement } from "./stack";
import { effectParser, type ParsedEffect } from "./effectParser";
import { deckSelector, visibleItemSelector, inplayUnchargedItemSelector, inplayItemSelector } from "./targetSelector";
import { TargetBuilder } from "./targetBuilder";
import { Monster } from "./monster";
import * as passive from "./passiveEffect";

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

export function rechargeItemsEffect(game: Game, selectionOnResolve: boolean = false, youMayEffectHanging: boolean[] = [false]): EffectFunction {
    const allowZero = youMayEffectHanging[0];
    youMayEffectHanging[0] = false;
    return async (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        if (selectionOnResolve) {
            const selectionResult = await data.selectAndRecord(game, data.issuer, 1, inplayUnchargedItemSelector(game)(data.issuer), allowZero, "Select an item to recharge.");
            if (selectionResult.selected.length > 0) {
                if(!(selectionResult.selected[0] instanceof ItemCard))
                    throw new Error(`Card to recharge is not an ItemCard: ${selectionResult.selected[0].name}`);
                game.recharge(selectionResult.selected[0]);
            }
        }
        else {
            // data.targets is the array of items to recharge
            for (const card of data.targets) {
                if(!(card instanceof ItemCard))
                    throw new Error(`Card to recharge is not an ItemCard: ${card.name}`);
                game.recharge(card);
            }
        }
        return true;
    };
}

export function makePlayerGiveLootCardEffect(game: Game): EffectFunction {
    return async (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        let targetPlayer = data.next;
        if (targetPlayer instanceof DiceRoll)
            targetPlayer = targetPlayer.issuer;
        if(!(targetPlayer instanceof Player))
            throw new Error("Target of makePlayerGiveLootCardEffect must be a Player.");
        if(targetPlayer === data.issuer) return true;
        if (targetPlayer.hand.length > 0) {
            const cardToGive = (await data.selectAndRecord(game, targetPlayer, 1, targetPlayer.hand.cards, false, "Select a card to give.", false)).selected[0]!;
            return game.give(targetPlayer, data.issuer, cardToGive);
        }
        return false;
    };
}

export function rechargeEachItemsOfTargetEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        const player = data.next;
        if(!(player instanceof Player))
            throw new Error("Target of rechargeEachItemsOfTargetEffect must be a Player.");
        game.rechargeEachItem(player);
        return true;
    };
}

export function makeAPlayerWithMostSoulsDestroyASoulEffect(game: Game): EffectFunction {
    return async (data: EffectData) => {
        const target = data.next;
        if(!(target instanceof Player))
            throw new Error("Target of makeAPlayerWithMostSoulsDestroyASoulEffect must be a Player.");
        if (game.playersWithMostSouls.includes(target)) {
            const card = (await data.selectAndRecord(game, target, 1, target.souls, false, "Select a soul to destroy.")).selected[0]!;
            return game.destroyCardsOrSouls([card]);
        }
        return false;
    };
}

export function forceAttackMonsterEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        const targetMonster = data.next;
        if(!(targetMonster instanceof Monster))
            throw new Error("Target of forceAttackMonsterEffect must be a Monster.");
        if(data.issuer instanceof Player === false) 
            throw new Error("Effect issuer is not a player in forceAttackMonsterEffect.");
        game.playerMustAttack(data.issuer, targetMonster, data.it);
        return true;
    };
}

export function look5Put1TopRestBottomEffect(deckName: string, game: Game): EffectFunction {
    if(!isDeckType(deckName))
        throw new Error(`Invalid deck type: ${deckName}`);
    return async (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        let cards = game.getFirstCardsOfDeck(deckName, 5);
        let selectionResult = await data.selectAndRecord(game, data.issuer, 1, cards, false, "Select a card to put on top of the deck.", false);
        game.addTopPosition(deckName, selectionResult.selected[0]!);
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
            if(!isDeckType(deckName))
                throw new Error(`Invalid deck type: ${deckName}`);
            const topCard = game.decks[deckName]?.cards[0];
            topCards.push(topCard!);
        }
        const selectResult = await data.selectAndRecord(game, data.issuer, 3, topCards, true, "Select any number of cards to put on the bottom of their respective decks.", false);
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
        if(!(data.it instanceof ItemCard))
            throw new Error(`Card should be an ItemCard to become a soul: ${data.it.name}`);
        data.it.setEternal(false);
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

export function chooseOneEffect(s: string, game: Game, selectionOnResolve: boolean=false): ParsedEffect {
    const lines = s.split("\n");
    if (lines.length < 3) {
        throw new Error(`invalid 'choose one' effect format. s=${s}$ lines=${lines}$`);
    }
    const effects: ParsedEffect[] = lines.slice(1).map(line => effectParser(line, game));
    
    return {
        effectFunction: async (data: EffectData) => {
            if(!(data.issuer instanceof Player))
                throw new Error("Effect issuer is not a player in chooseOneEffect.");
            const description = selectionOnResolve ?
                (await data.selectAndRecord(game, data.issuer, 1, lines.slice(1), false, "Select an effect to resolve.")).selected[0] :
                (data.next as string).toLowerCase();
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
        const guppyItems = game.decks["treasure"]!.cards.filter(card => card instanceof ItemCard && (card as ItemCard).isGuppy());
        if (guppyItems.length === 0) return false;
        const selectedGuppyItem = (await data.selectAndRecord(game, data.issuer, 1, guppyItems, false, "Select a Guppy item to add to your in-play.")).selected[0] as ItemCard;
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

export function shuffleDeckEffect(game: Game, deckName: DeckType): EffectFunction {
    return (data: EffectData) => {
        game.decks[deckName]!.shuffle();
        return true;
    };
}

export function destroyCurseEffect(game: Game, selectionOnResolve: boolean=false): EffectFunction {
    return async (data: EffectData) => {
        let toDestroy = data.next;
        if(selectionOnResolve) {
            toDestroy = (await data.selectAndRecord(game, data.issuer as Player, 1, data.targets, false, "Select a curse to destroy.")).selected[0];
        }
        if(!(toDestroy instanceof MonsterCard && toDestroy.isCurse))
            throw new Error(`Card to destroy is not a curse: ${toDestroy.name}`);
        return game.destroyCurse([toDestroy]);
    };
}

export function destroyOneEffect(game: Game, selector: TargetsSelector|undefined = undefined): EffectFunction {
    return async (data: EffectData) => {
        let toDestroy = data.next as Card;
        if(selector !== undefined) {
            if(data.issuer instanceof Player === false)
                throw new Error("Effect issuer is not a player in destroyOneEffect.");
            toDestroy = (await data.selectAndRecord(game, data.issuer as Player, 1, selector.selector(data.issuer), false, "Select a card to destroy.")).selected[0] as Card;
        }
        return game.destroyCardsOrSouls([toDestroy]);
    };
}

export function destroyTwoItemsEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        const toDestroy = data.next as Card;
        const toDestroy2 = data.next as Card;
        return game.destroyCardsOrSouls([toDestroy, toDestroy2]);
    };
}

export function changeRollDiceResultEffect(game: Game): EffectFunction {
    return async (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        const choosenDiceRoll: DiceRoll = data.next as DiceRoll;
        // const selectionResult = await data.selectAndRecord(game, data.issuer, 1, [1, 2, 3, 4, 5, 6], false, "Select a value to change the roll to.");
        // const newValue = selectionResult.selected[0] as number;
        const newValue: number = data.next as number;
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
        game.swapItems(data.it as ItemCard, itemToSwap);
        return true;
    };
}

export function copyTapAbilityEffect(game: Game): EffectFunction {
    return async (data: EffectData) => {
        const itemToCopy = data.next as ItemCard;
        const activeEffect = itemToCopy.getActiveEffect();
        if (!activeEffect)
            throw new Error(`Item ${itemToCopy.name} has no active effect to copy.`);
        const player = data.issuer as Player;
        if(player === undefined)
            throw new Error(`Effect issuer is not a player.`);
        const newTargets = await TargetBuilder.buildTargetsOnResolve(game, player, itemToCopy);
        const effectOnStack: EffectOnStack = new EffectOnStack(activeEffect.effectFunction, new EffectData(data.it, data.issuer, newTargets), `Copy of ${itemToCopy.name} tap ability`);
        game.addToStack(effectOnStack);
        return true;
        // return activeEffect.effectFunction(data);
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
        const unsubscribe = game.emitter.on("till:turn:end", (eventData: OnTurnEndData) => {
            if (eventData.eventIssuer === owner) {
                restore(); // restore() will call cleanup() internally
                unsubscribe();
            }
        });
        
        return true;
    };
}

export function cancelStackElementEffect(game: Game, selectors: TargetsSelector[] = [], selectionOnResolve: boolean= false): EffectFunction {
    return async (data: EffectData) => {
        const toRemove = !selectionOnResolve 
            ? data.next as StackElement 
            : (await data.selectAndRecord(game, data.issuer as Player, 1, selectors[0]?.selector(data.issuer as Player)!, false, selectors[0]?.description, false)).selected[0] as StackElement;
        game.cancelStackElement(toRemove);
        return true;
    };
}
export function eachOtherPlayerDiscardsLootEffect(game: Game): EffectFunction {
    return async (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        const issuer = data.issuer;
        const choices = [];
        for (const player of game.players) {
            if (player !== issuer && player.hand.length > 0) {
                choices.push({
                player,
                count: 1,
                options: player.hand.cards,
                asMany: false,
                description: "Choose a loot card to discard."
            });
            }
        }
        const playersChoices:{ playerId: string; selected: LootCard[]; remaining: LootCard[] }[] = await data.selectMultipleAndRecord(game, choices);
        for (const playerChoice of playersChoices) {
            const player = game.getPlayerById(playerChoice.playerId);
            const index = player.hand.cards.indexOf(playerChoice.selected[0]!);
            game.discardFromHandAtIndex(player, index);
        }
        return true;
    }
}

export function modifyCoinGainedEffect(game: Game, modifier: (original:number) => number): EffectFunction {
    return (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        const originalAmount = data.next;
        if (!originalAmount || !(originalAmount instanceof Array) || originalAmount.length !== 1 || typeof originalAmount[0] !== "number") {
            throw new Error(`Invalid original amount for ModifyCoinGainedEffect: ${originalAmount}`);
        }
        originalAmount[0] = modifier(originalAmount[0]);
        game.gainCoins(data.issuer, originalAmount[0]);
        return true;
    };
}

export function stealSoulEffect(game: Game): EffectFunction {
    return async (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        const soulToSteal = (await data.selectAndRecord(game, data.issuer, 1, game.soulsOwned, false, "Select a soul to steal.")).selected[0]!;
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
        const itemToSteal = data.next;
        return game.stealItemAnywhere(data.issuer, itemToSteal);
    };
}

export function stealNonEternalItemFromAnywhereEffect(game: Game): EffectFunction {
    return async (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        const itemToSteal = data.next;
        return game.stealItemAnywhere(data.issuer, itemToSteal);
    };
}

export function subtractUpTo2FromRollEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        const choosenDiceRoll: DiceRoll = data.next as DiceRoll;
        const subtractValue = data.next as number;
        choosenDiceRoll.subtract(subtractValue);
        return true;
    };
}

export function addUpTo2ToRollEffect(game: Game, rollType: "attack" | "non-attack" | "any"): EffectFunction {
    return (data: EffectData) => {
        const choosenDiceRoll: DiceRoll = data.next as DiceRoll;
        if(choosenDiceRoll.attackRoll && rollType === "non-attack" || 
          !choosenDiceRoll.attackRoll && rollType === "attack") {
            return false;
        }
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

export function flushMonsterSlotsAndReplaceEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        game.monsterSlots.flushAndDraw();
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
        await data.selectAndRecord(game, data.issuer, 0, game.allHands(), true, "You can see each players' hands:", false);
        return true;
    };
}

export function deal2DamageDividedAsYouChooseEffect(game: Game): EffectFunction {
    return async (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        const player = data.issuer;
        const firstTarget = data.next as Entity;
        const secondTarget = data.next as Entity;
        if(!firstTarget)
            return false;
        if(!secondTarget)
            game.dealDamage(player, firstTarget, data.it, 2);
        else
        {
            game.dealDamage(player, firstTarget, data.it, 1);
            game.dealDamage(player, secondTarget, data.it, 1);
        }
        return true;
    };
}

export function lookAtAPlayerHand(game: Game): EffectFunction {
    return async (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        const target = data.next as Player;
        await data.selectAndRecord(game, data.issuer, 0, [{ player: target, hand: target.hand }], true, `You can see ${target.id}'s hand:`, false);
        return true;
    };
}
export function swapNonEternalItemsEffect(game: Game, youMayEffectHanging: boolean[] = [false]): EffectFunction {
    const allowZero = youMayEffectHanging[0];
    youMayEffectHanging[0] = false;
    return async (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        let otherPlayer = data.next;
        if(otherPlayer instanceof DiceRoll)
            otherPlayer = otherPlayer.issuer;
        if(!(otherPlayer instanceof Player))
            throw new Error("Invalid target player for swapNonEternalItemsEffect");
        if(otherPlayer === data.issuer) return true;
        const itemToSwapFromIssuer = (await data.selectAndRecord(game, data.issuer, 1, data.issuer.inPlay.filter((card) => card instanceof ItemCard && card.eternal === false), allowZero, "Select an item to swap from your in-play.", false)).selected[0] as ItemCard;
        if(itemToSwapFromIssuer === undefined) return true;
        const itemToSwapFromOtherPlayer = (await data.selectAndRecord(game, data.issuer, 1, otherPlayer.inPlay.filter((card) => card instanceof ItemCard && card.eternal === false), false, "Select an item to swap from the other player's in-play.", false)).selected[0] as ItemCard;
        return game.swapItems(itemToSwapFromIssuer, itemToSwapFromOtherPlayer);
    }
}
export function flushOneMonsterSlotEffect(game: Game): EffectFunction {
    return async (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        const monsterToFlush = (await data.selectAndRecord(game, data.issuer, 1, game.monsters.filter((m) => m !== null && !m.isEngagedInCombat), true, "Select a monster to flush.")).selected[0] as Monster;
        if(monsterToFlush === undefined) return true;
        game.monsterSlots.flushMonster(monsterToFlush);
        return true;
    };
}

export function giveAdditionalAttackThisTurnEffect(game: Game, amount: number): EffectFunction {
    return (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        const player = data.issuer;
        player.attackThisTurn += amount;
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
        const index = (await data.selectAndRecord(game, data.issuer, 1, nonAttackedSlots, false, "Select a slot to put the top monster in.")).selected[0]!;
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

export function discardAnyNumberOfLootCardsEffect(game: Game, youMayEffectHanging: boolean[] = [false]): EffectFunction {
    const allowZero = youMayEffectHanging[0];
    youMayEffectHanging[0] = false;
    return async (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        const player = data.issuer;
        const maxToDiscard = player.hand.length;
        const selectionResult = await data.selectAndRecord(game, player, maxToDiscard, player.hand.cards, true, "Select any number of loot cards to discard from your hand.");
        const nbDiscarded = selectionResult.selected.length;
        for (const card of selectionResult.selected) {
            const index = player.hand.cards.indexOf(card);
            game.discardFromHandAtIndex(player, index);
        }
        data.addTarget(nbDiscarded);
        return true;
    };
}

export function forcePlayerRerollDiceEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        const diceRoll = data.next;
        if(!(diceRoll instanceof DiceRoll))
            throw new Error("Expected a DiceRoll instance.");
        diceRoll.roll();
        return true;
    };
}

export function lootEqualToCardsDiscardedEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        const nbToLoot = data.next as number;
        game.loot(data.issuer, nbToLoot);
        data.targets = []; // reset targets for displaying purposes.
        return true;
    };
}

export function discardTopOfDeckEffect(game: Game): EffectFunction {
    return async (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        const deck = (await data.selectAndRecord(game, data.issuer, 1, deckSelector(undefined, game)(data.issuer), false, "Select a deck to discard the top card of.")).selected[0];
        if(!isDeckType(deck._type))
            throw new Error(`Invalid deck type: ${deck._type}`);
        const topCard = deck.draw();
        game.discard(topCard);
        return true;
    };
}

// Look at the top card of a deck. You may put it back.
export function LookAndPutBottomEffect(
    deckName: DeckType,
    game: Game
): EffectFunction {
    return async (data:EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        const deck = game.decks[deckName];
        if (!deck) {
            throw new Error(`Deck ${deckName} does not exist.`);
        }
        const topCard = deck.draw();
        const res = await data.selectAndRecord(game, data.issuer, 1, [topCard], true, `Look at the top card of the ${deckName} deck. You may put it on the bottom of the deck.`, false);
        if (res.selected.length > 0) {
            game.addBottomPosition(deckName, topCard);
        } else {
            game.addTopPosition(deckName, topCard);
        }   
        return true;
    };
}
// choose a player at random. That player destroys an item they control.
export function destroyItemOfRandomPlayerEffect(game: Game): EffectFunction {

    return async (data: EffectData) => {
        const players = game.players;
        const randomIndex = Math.floor(game.random() * players.length);
        const targetPlayer = players[randomIndex]!;
        const item = (await data.selectAndRecord(game, targetPlayer, 1, targetPlayer.inPlay.filter((card) => card instanceof ItemCard && card.eternal === false), false, "Select an item to destroy.")).selected[0]!;
        return game.destroyCardsOrSouls([item]);
    };
}

export function discardAnyNumberOfShopItemsEffect(game: Game): EffectFunction {
    return async (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        const shop = game.shop;
        const maxToDiscard = shop._slots.filter((slot) => slot !== undefined).length;
        const selectionResult = await data.selectAndRecord(game, data.issuer, maxToDiscard, shop._slots.filter((slot) => slot !== undefined) as ItemCard[], true, "Select any number of items to discard from the shop.");
        for (const card of selectionResult.selected) {
            const index = shop._slots.indexOf(card);
            game.discardFromShop(index);
        }
        data.addTarget(selectionResult.selected.length);
        return true;
    };
}

export function lookAndOrderEffect(deckName: string, numberOfCards: number, game: Game): EffectFunction {
    if(!isDeckType(deckName))
        throw new Error(`Invalid deck type: ${deckName}`);
    return async (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        let cards = game.getFirstCardsOfDeck(deckName, numberOfCards);
        let selectionResult = await data.selectAndRecord(game, data.issuer, numberOfCards, cards, false, `Select the order to put back the ${numberOfCards} cards on top of the ${deckName} deck (first selected will be on top).`, false);
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

export function lookAtTopCardOfDeckEffect(game: Game, canPutWhere: cardDestination, selectionOnResolve:boolean = false, reveal: boolean = false): EffectFunction {
    return async (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        const deck = selectionOnResolve 
            ? (await data.selectAndRecord(game, data.issuer, 1, deckSelector(undefined, game)(data.issuer), false, "Select a deck to look at the top card of.", false)).selected[0]
            : data.next;
        if(!isDeckType(deck._type))
            throw new Error(`Invalid deck type: ${deck._type}`);
        if (!deck)
            throw new Error(`Deck not found`);
        const topCard = deck.cards[0];
        // getFirstCardsOfDeck(deckName, 1)[0];
        const justWatch = canPutWhere === "just_watch";
        const description = canPutWhere === "just_watch"
            ? `Look at the top card of the ${deck._type} deck.`
            : canPutWhere === "bottom" ? `Look at the top card of the ${deck._type} deck. You may put it on the bottom of the deck.` 
            : `Look at the top card of the ${deck._type} deck. You may put it on the bottom of the deck or discard it.`;
        const selectionResult = reveal
         ? (await data.selectMultipleAndRecord(game, game.players.map(player => ({
                player,
                count: (justWatch || player !== data.issuer) ? 0 : 1,
                options: [topCard!],
                asMany: true,
                description: description
            })))).find(p => p.playerId === data.issuer.id)!
        : await data.selectAndRecord(game, data.issuer, justWatch ? 0 : 1, [topCard!], true, description, false);
        if (selectionResult.selected[0] === topCard) {
        switch (canPutWhere) {
            case "just_watch":
                return true;
            case "bottom":
            {
                const topCard2 = deck.draw();
                if (topCard2 !== topCard)
                    throw new Error("Top card mismatch");
                game.addBottomPosition(deck._type, topCard);
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

export function rerollEachItemEffect(game: Game, issuerIsTarget: boolean = false): EffectFunction {
    return (data: EffectData) => {
        const player = issuerIsTarget ? data.issuer as Player : data.next as Player;
        const inplayItems = player.inPlay.filter((card) => card instanceof ItemCard && !card.eternal) as ItemCard[];
        for (const card of inplayItems) {
            game.reroll(card);
        }
        return true;
    };
}

export function playForFreeTargetEffect(game: Game): EffectFunction {
    return async (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        const card = data.next as LootCard;
        if (!card) return false;
        const previousLootPlay = data.issuer.remainingLootPlay;
        data.issuer.remainingLootPlay = 1;
        if(TargetBuilder.validTargetExists(game, data.issuer as Player, card, "tap") === true) {
            const index = data.issuer.hand.cards.indexOf(card);
            const targets = await TargetBuilder.buildTargetsOnResolve(game, data.issuer as Player, card)
            game.playCard(data.issuer as Player, index, targets);
        }
        data.issuer.remainingLootPlay = previousLootPlay;
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
            asMany: false,
            description: "Vote for an item to be destroyed."
        }));
        const voteResults = await data.selectMultipleAndRecord(game, voteRequests);

        // Count the votes
        const votes: Record<number, number> = {};
        for (const result of voteResults) {
            const vote = result.selected[0].globalId;
            votes[vote] = (votes[vote] || 0) + 1;
        }

        // Find the item with most votes
        let itemToDestroy: ItemCard | null = null;
        let votesToDestroy = 0;
        for (const [itemGlobalId, voteCount] of Object.entries(votes)) {
            if(voteCount === votesToDestroy) itemToDestroy = null;
            if (voteCount > votesToDestroy) {
                votesToDestroy = voteCount;
                itemToDestroy = ListOfItems.find((item) => item.globalId === Number(itemGlobalId))!;
            }
        }
        if (itemToDestroy !== null && itemToDestroy !== undefined) {
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
            const randomIndex = Math.floor(game.random() * targetPlayer.hand.length);
            const cardToSteal = targetPlayer.hand.cards[randomIndex]!;
            game.stealLootCard(data.issuer, targetPlayer, cardToSteal as LootCard);
        }
        return true;
    };
}

export function stealAPlayerRandomLootCardEffect(game: Game): EffectFunction {
    return async (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        const targetPlayer = (await data.selectAndRecord(game, data.issuer, 1, game.players.filter((p) => p !== data.issuer), false, "Select a player to steal a random loot card from.")).selected[0] as Player;
        if (targetPlayer.hand.length > 0) {
            const randomIndex = Math.floor(game.random() * targetPlayer.hand.length);
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

export function deactivateItemEffect(game: Game, selectionOnResolve: boolean = false, youMayEffectHanging: boolean[] = [false]): EffectFunction {
    return async (data: EffectData) => {
        if(data.issuer instanceof Player === false) 
            throw new Error("Effect issuer is not a player in deactivateItemEffect.");
        const target = selectionOnResolve 
            ? (await data.selectAndRecord(game, data.issuer as Player, 1, inplayItemSelector(() => true, game)(data.issuer), youMayEffectHanging[0], "Select an item to deactivate.", false)).selected[0] as ItemCard
            : data.next as ItemCard;
        youMayEffectHanging[0] = false;
        target.charged = false;
        game.deactivateItem(target);
        return true;
    };
}

export function destroyThisEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        game.destroyCardsOrSouls([data.it]);
        return true;
    };
}

export function discardNLootCardsEffect(n: number, game: Game, selectionOnResolve: boolean = false, subjectInTarget: boolean = false): EffectFunction {
    return async (data: EffectData) => {
        const subject = subjectInTarget ? data.next as Player : data.issuer as Player;
        if (subject instanceof Player === false) return false;
        let toDiscard: LootCard[] = [];
        if(subjectInTarget && !selectionOnResolve)
            throw new Error("Invalid parameters for discardNLootCardsEffect.");
        if (selectionOnResolve || !toDiscard) 
            toDiscard = (await data.selectAndRecord(game, subject, n, subject.hand.cards, false, `Select ${n} loot card${n > 1 ? 's' : ''} to discard.`)).selected as LootCard[];
        else 
            for (let i = 0; i < n; i++) {
                toDiscard.push(data.next as LootCard);
            }
        // Get indices and sort them in descending order to avoid index shifting
        const indices = toDiscard.map(card => subject.hand.cards.indexOf(card)).sort((a, b) => b - a);
        for (const index of indices) {
            if (index >= 0) {
                game.discardFromHandAtIndex(subject, index);
            }
        }
        return true;
    };
}

export function destroyOneOfYourSoulEffect(game: Game): EffectFunction {
    return async (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        const soulToDestroy = (await data.selectAndRecord(game, data.issuer, 1, data.issuer.souls, false, "Select a soul to destroy.")).selected[0]!;
        return game.destroyCardsOrSouls([soulToDestroy]);
    };
}

export function eachPlayerDestroysASoulEffect(game: Game): EffectFunction {
    return async (data: EffectData) => {
        const playersWithSouls = game.players.filter(player => player.souls.filter(soul => soul.eternal === false).length > 0);
        const choices = playersWithSouls.map(player => ({
            player,
            count: 1,
            options: player.souls.filter(soul => soul.eternal === false),
            asMany: false,
            description: "Select a soul to destroy."
        }));
        const playersChoices:{ playerId: string; selected: Card[]; remaining: Card[] }[] = await data.selectMultipleAndRecord(game, choices);
        for (const playerChoice of playersChoices) {
            game.destroyCardsOrSouls(playerChoice.selected);
        }
        return true;
    };
}

export function giveSoulEffect(game: Game): EffectFunction {
    return async (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        const targetPlayer = data.next as Player;
        if(!targetPlayer)
            throw new Error("No target player to give soul to");
        const soulToGive = (await data.selectAndRecord(game, data.issuer, 1, data.issuer.souls, false, "Select a soul to give.")).selected[0]!;
        game.give(data.issuer, targetPlayer, soulToGive);
        return true;
    };
}

export function lookAtPlayerHandAndSwapEffect(game: Game): EffectFunction {
    return async (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        const otherPlayer = (await data.selectAndRecord(game, data.issuer, 1, game.players.filter((p) => p !== data.issuer), false, "Select a player to look at their hand, and swap a loot card.")).selected[0] as Player;
        const canSwap = otherPlayer.hand.length > 0 && data.issuer.hand.length > 0;
        const selection = await data.selectAndRecord(game, data.issuer, canSwap ? 1 : 0, otherPlayer.hand.cards, true, "Select a loot card to swap.", false);
        if (selection.selected.length === 0)
            return true;
        const toGive = (await data.selectAndRecord(game, data.issuer, 1, data.issuer.hand.cards, false, "Select a loot card to give.", false)).selected[0] as LootCard;
        if (game.give(data.issuer, otherPlayer, toGive))
            game.give(otherPlayer, data.issuer, selection.selected[0] as LootCard);
        return true;
    };
}

export function lookAtHandAndStealLootEffect(game: Game): EffectFunction {
    return async (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        let otherPlayer = data.next;
        if(otherPlayer instanceof DiceRoll)
            otherPlayer = otherPlayer.issuer;
        if(!(otherPlayer instanceof Player))
            throw new Error("Invalid target player");
        const canSteal = otherPlayer.hand.length > 0;
        const selection = await data.selectAndRecord(game, data.issuer, canSteal ? 1 : 0, otherPlayer.hand.cards, true, "Select a loot card to steal.", false);
        if (selection.selected.length === 0)
            return true;
        game.give(otherPlayer, data.issuer, selection.selected[0] as LootCard);
        return true;
    };
}

export function endTurnAndResetStackEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        game.resetStack();
        game.resetCallbacks();
        game.endCombat();
        game.endTurn();
        return true;
    };
}

export function putTopCardOfEachDeckIntoDiscardEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        for (const deckName of ["loot", "treasure", "monster"]) {
            if(!isDeckType(deckName))
                throw new Error(`Invalid deck type: ${deckName}`);
            const topCard = game.getFirstCardsOfDeck(deckName, 1)[0]!;
            game.discard(topCard);
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


export function youMayRechargeThisEffect(game: Game): EffectFunction {
    return async (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        const selectionResult = await data.selectAndRecord(game, data.issuer, 1, [data.it], true, "If you want to, you can recharge this item.");
        if (selectionResult.selected.length > 0) {
            game.recharge(data.it as ItemCard);
        }
        return true;
    };
}

export function youMayRechargeAnItemEffect(game: Game): EffectFunction {
    return async (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        const selectionResult = await data.selectAndRecord(game, data.issuer, 1, inplayUnchargedItemSelector(game)(data.issuer), true, "If you want to, select an item to recharge.");
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
            const diceRoll = data.next; // First target is the DiceRoll itself
            const target = data.next as Monster; // Second target is the monster
            if(data.issuer.isDead || target.isDead) return false;
            if (i + 1 >= evasion) {
                game.dealCombatDamage(data.issuer, target, diceRoll, damageDealt + data.issuer.attackPoints);
            } else {
                game.dealCombatDamage(target, data.issuer, diceRoll, damageReceived + game.getAttack(target));
                game.emit("on:attack:roll:failed", { eventIssuer: data.issuer, defender: target, diceRoll, damageReceived });
            }
            return true;
        });
    }
    return effects;
}

export function targetGetCoinRollEffect(game: Game): EffectFunction[] {
    const effects: EffectFunction[] = [];
    for (let i = 0; i < 6; i++) {
        effects.push((data: EffectData) => {
            const target = data.next as Player;
            if(!target) throw new Error("No target for targetGetCoinRollEffect");
            game.gainCoins(target, i + 1);
            return true;
        });
    }
    return effects;
}

export function targetGetLootRollEffect(game: Game): EffectFunction[] {
    const effects: EffectFunction[] = [];
    for (let i = 0; i < 6; i++) {
        effects.push((data: EffectData) => {
            const target = data.next as Player;
            if(!target) throw new Error("No target for targetGetCoinRollEffect");
            game.loot(target, i + 1);
            return true;
        });
    }
    return effects;
}


export function loot1PutCardOnTopEffect(game: Game): EffectFunction {
    return async (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        game.loot(data.issuer, 1);
        const cardToPutBack = (await data.selectAndRecord(game, data.issuer, 1, data.issuer.hand.cards, false, "Select a loot card to put on top of the loot deck.", false)).selected[0] as LootCard;
        const card = game.getCardFromHand(data.issuer, cardToPutBack);
        game.decks["loot"]!.addTopPosition(card);
        return true;
    };
}

export function healEffect(game: Game, amount: number): EffectFunction {
    return (data: EffectData) => {
        // if (data.issuer instanceof Player === false) return false;
        game.heal(data.issuer, amount);
        return true;
    };
}

export function eachPlayerLosesCoinsEffect(game: Game, amount: number): EffectFunction {
    return (data: EffectData) => {
        for (const player of game.players) {
                game.loseCoins(player, amount, true);
        }
        return true;
    };
}

export function rerollItemEffect(game: Game, selectors: TargetsSelector[] = [], selectionOnResolve: boolean = false): EffectFunction {
    return async (data: EffectData) => {
        let card = data.next;
        if(selectionOnResolve === true)
        {
            if(data.issuer instanceof Player === false) 
                throw new Error("Issuer must be a player for selection on resolve reroll effect");
            card = (await data.selectAndRecord(game, data.issuer, 1, selectors[0]!.selector(data.issuer), false, "Select an item to reroll.", false)).selected[0];
        }
        game.reroll(card);
        return true;
    };
}

export function rerollItemTheyControlEffect(game: Game, youMayEffectHanging: boolean[] = [false]): EffectFunction {
    return async (data: EffectData) => {
        let targetPlayer = data.next;
        if(targetPlayer instanceof DiceRoll)
            targetPlayer = targetPlayer.issuer;
        if(!(targetPlayer instanceof Player))
            throw new Error("Invalid target player for rerollItemTheyControlEffect");
        if(!(data.issuer instanceof Player))
            throw new Error("Issuer must be a player for rerollItemTheyControlEffect");
        const selectionResult = await data.selectAndRecord(game, data.issuer, 1, targetPlayer.inPlay.filter(c => c.eternal === false), youMayEffectHanging[0], `${youMayEffectHanging[0] ? "You may s" : "S"}elect an item to reroll.`, false);
        youMayEffectHanging[0] = false;
        if(selectionResult.selected.length === 0)
            return false;
        const card = selectionResult.selected[0]!;
        game.reroll(card);
        return true;
    };
}

export function flushShopToBottomEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        game.shop.flushToBottom();
        return true;
    };
}

export function playerGivesLootCardEffect(game: Game, reveal: boolean = false, addCardToTarget: boolean = false): EffectFunction {
    return async (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        const targetPlayer = data.next as Player;
        if (targetPlayer.hand.length > 0) {
            const cardToSteal = (await data.selectAndRecord(game, targetPlayer, 1, targetPlayer.hand.cards, false, "Select a loot card to steal.", reveal)).selected[0] as LootCard;
            game.stealLootCard(data.issuer, targetPlayer, cardToSteal);
            if(addCardToTarget)
                data.addTarget(cardToSteal);
        }
        return true;
    };
}

export function revealTopCardsOfMonsterDeckEffect(
    game: Game,
    n: number
): EffectFunction {
    return async (data: EffectData) => {
        if(!(data.issuer instanceof Player))
            throw new Error("revealTopCardsOfMonsterDeckEffect can only be applied to Players.");
        const monsterCards = game.decks.monster.drawSeveral(n);
        data.recordSelection(monsterCards);
        const curses = monsterCards.filter(c => c.isCurse);
        for (const curse of curses) {
            const target = (await data.selectAndRecord(game, data.issuer, 1, game.players, false, `Select a player to give ${curse.name} to.`, true)).selected[0] as Player;
            game.addCurse(target, curse);
        }
        return true;
    };
}

export function putMonsterFromDiscardOnTopEffect(game: Game): EffectFunction {
    return async (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        const monsterToPutBack = (await data.selectAndRecord(game, data.issuer, 1, game.decks["monster"]!.discard.filter((card) => card.isEvent === false), false, 
            "Select a discarded monster to put on top of the monster deck.", false)).selected[0] as MonsterCard;
        game.decks["monster"]!.remove(monsterToPutBack);
        game.decks["monster"]!.addTopPosition(monsterToPutBack);
        return true;
    };
}
export function putTopCardFromDiscardOnTopEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        const cardToDraw = data.next as Card;
        if(!cardToDraw)
            throw new Error("No card to draw for putTopCardFromDiscardOnTopEffect");
        if(!cardToDraw.type)
            throw new Error("Invalid card type for putTopCardFromDiscardOnTopEffect");
        const deckName = cardToDraw.type;
        if(!isDeckType(deckName)) 
            throw new Error("Invalid deck type for putTopCardFromDiscardOnTopEffect");
        const deck = game.decks[deckName];
        if (!deck) {
            throw new Error(`Deck ${deckName} does not exist.`);
        }
        if (deck.discard.length === 0) {
            return false;
        }
        const card = deck.drawTopDiscard();
        if(card !== cardToDraw)
            throw new Error("Drawn card does not match the expected card for putTopCardFromDiscardOnTopEffect");
        game.addTopPosition(deckName, card);
        return true;
    };
}

export function putCardFromHandOnTopOfDeckEffect(game: Game): EffectFunction {
    return async (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        const cardToPutBack = (await data.selectAndRecord(game, data.issuer, 1, data.issuer.hand.cards, false, "Select a loot card to put on top of the loot deck.", false)).selected[0] as LootCard;
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
export function forceAttackMonsterDeckEffect(game: Game, times: number, type: "total" | "additional"): EffectFunction {
    return (data: EffectData) => {
        if(data.issuer instanceof Player === false) return false;
        const additionalTimes = type === "additional" ? times : times - data.issuer.attackedIdsThisTurn.filter((id) => id === "topDeck").length;
        for (let i = 0; i < additionalTimes; i++) {
            game.playerMustAttack(data.issuer as Player, "topDeck", data.it);
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

export function dealDamageToAPlayerEffect(game: Game, dmg: number, canTargetSelf: boolean=false, issuerIsCurrentPlayer: boolean=false): EffectFunction {
    return async (data: EffectData) => {
        const issuer = issuerIsCurrentPlayer ? game.currentPlayer : data.issuer;
        if (issuer instanceof Player === false) return false;
        const target = (await data.selectAndRecord(game, issuer, 1, game.players.filter((p) => (canTargetSelf ? true : p !== issuer)), false, "Select another player to deal damage to.")).selected[0] as Player;
        game.dealDamage(issuer, target, data.it, dmg);
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

export function throwEffect(game: Game): EffectFunction {
    throw new Error("Function not parsed correctly.");
    return (data: EffectData) => {
        return true;
    };
}

export function putAnyNumberFromDiscardOnTopEffect(deckName: DeckType, game: Game, condition: (card: Card) => boolean): EffectFunction {
    return async (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        const deck: Deck<Card> = game.decks[deckName];
        if (!deck) {
            throw new Error(`Deck ${deckName} does not exist.`);
        }
        const maxToPutBack = deck.discard.length;
        const selectionResult = await data.selectAndRecord(game, data.issuer, maxToPutBack, deck.discard.filter(condition), true, "Select cards to put back on top of the deck (first selected will be on top).", false);
        for (let i = 0; i < selectionResult.selected.length; i++) {
            const card = selectionResult.selected[i]!;
            assertCardMatchesDeck(deckName, card);
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
            const selection = await data.selectAndRecord(game, data.issuer, 1, [data.issuer.character], true, "You may recharge your character.");
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
    if (s === "roll-\nyou may change the result of your next roll this turn to this result.")
        return passive.rollAndMayChangeNextRollForThis(game);
    const rollResults = obtainRollResults(s);
    const parsedEffects: ParsedEffect[] = rollResults.map(effectText => effectParser(effectText, game, addInPlayEffect(game), true));
    const effects: EffectFunction[] = parsedEffects.map(p => p.effectFunction);
    return {
        effectFunction: (data: EffectData) => {
            if (data.issuer instanceof Player === false) return false;
            const result = game.rollDice(data.issuer, false, data.it);
            result.attachEffect(effects, data.it, data.targets);
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
            return endTurnAndResetStackEffect(game)(data);
        }
        return true;
    };
}

export function halfLootAndCoinsAndGiveItemEffect(game: Game): EffectFunction {
    return async (data: EffectData) => {
        if(data.issuer instanceof Player === false) return false;
        const target = data.next as Player;
        if(!target || !(target instanceof Player))
            throw new Error("No target player for halfLootAndCoinsAndGiveItemEffect");
        const coinsToLose = Math.floor(target.coins / 2);
        game.giveCoins(target, data.issuer, coinsToLose, true);

        const lootToLose = Math.floor(target.hand.length / 2);
        const loots = (await data.selectAndRecord(game, target, lootToLose, target.hand.cards, false, `Select ${lootToLose} loot card${lootToLose > 1 ? 's' : ''} to give to ${data.issuer.id}.`)).selected as LootCard[];
        for(const loot of loots)
            game.giveCard(target, data.issuer, loot);
        
        const treasure = (await data.selectAndRecord(game, target, 1, target.inPlay.filter(c => c.eternal === false), false, `Select a treasure to give to ${data.issuer.id}.`)).selected[0] as TreasureCard;
        game.give(target, data.issuer, treasure);

        return true;
    };
}

export function preventDeathHealFullCancelAttackEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        if(data.issuer instanceof Player === false) return false;
        game.preventDeath(data.issuer);
        game.heal(data.issuer, data.issuer.healthPoints);
        game.endCombat();
        return true;
    };
}

export function dealRollDamageEffect(s: string, game: Game): ParsedEffect {
    return {
        effectFunction: (data: EffectData) => {
            if (data.issuer instanceof Player === false) return false;
            const target = data.next as Entity;
            const roll = game.rollDice(data.issuer, false, data.it);
            roll.attachEffect([...Array(6).keys()].map((i) =>
                (data: EffectData) => {
                    game.dealDamage(data.issuer, data.next as Entity, data.it, i + 1);
                    return true;
                }), data.it, [target]);
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

export function killTargetEffect(game: Game, selectors: TargetsSelector[] = [], selectionOnResolve: boolean = false, issuerIsCurrentPlayer=false): EffectFunction {
    return async (data: EffectData) => {
        const issuer = issuerIsCurrentPlayer ? game.currentPlayer : data.issuer;
        if(selectionOnResolve){
            if(issuer instanceof Player === false) 
                throw new Error("Issuer should be a player to select target for killTargetEffect.");
            const target = await data.selectAndRecord(game, issuer as Player, 1, selectors[0]!.selector(issuer), false, "Select a target to kill.");
            game.kill(issuer, target.selected[0] as Entity, data.it);
            return true;
        }
        game.kill(issuer, data.next as Entity, data.it);
        return true;
    };
}

export function issuerSkipNextTurnEffect(game: Game, issuerIsCurrentPlayer: boolean = false): EffectFunction {
    return (data: EffectData) => {
        const issuer = issuerIsCurrentPlayer ? game.currentPlayer : data.issuer;
        if(issuer instanceof Player === false) 
            return false;
        game.playerSkipNextTurn(issuer);
        return true;
    };
}

export function deathTargetEffect(game: Game, selectionOnResolve: boolean = false): EffectFunction {
    return async (data: EffectData) => {
        const target = data.next as Entity;
        if(selectionOnResolve){
            if(data.issuer instanceof Player === false) 
                throw new Error("Issuer should be a player to select target for deathTargetEffect.");
            const target = await data.selectAndRecord(game, data.issuer as Player, 1, game.players, false, "Select a target to kill.");
            game.death(target.selected[0] as Entity, data.issuer, data.it);
            return true;
        }
        if(!target) 
            throw new Error("No target for deathTargetEffect");
        game.death(data.next, data.issuer, data.it);
        return true;
    };
}

export function dieEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        game.death(data.issuer, data.issuer, data.it);
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

export function dealDamageToEachPlayerEffect(game: Game, amount: number, includeActivePlayer: boolean = true): EffectFunction {
    return (data: EffectData) => {
        for (const player of game.players) {
            if (!includeActivePlayer && player === game.currentPlayer) continue;
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

export function discardHandEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        const handSize = data.issuer.hand.length;
        return discardNLootCardsEffect(handSize, game, true)(data);
    };
}

export function dealDamageToTargetEffect(game: Game, amount: number, selectionOnResolve: boolean = false, selectors: TargetsSelector[] = []): EffectFunction {
    return async (data: EffectData) => {
        let target = data.next;
        if(target instanceof DiceRoll)
            target = target.issuer;
        if(selectionOnResolve && target === undefined){
            if(data.issuer instanceof Player === false) 
                throw new Error("Issuer should be a player to select target for killTargetEffect.");
            target = (await data.selectAndRecord(game, data.issuer as Player, 1, selectors[0]!.selector(data.issuer), false, "Select a target to kill.")).selected[0];
        }
        if(!(target instanceof Entity))
            throw new Error("Invalid target for dealDamageToTargetEffect");
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

export function lookAndReorderTopCardsEffect(game: Game, numberCards: number, deckNameParam: string | undefined = undefined): EffectFunction {
    return async (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        var deckName = deckNameParam;
        if(deckName === undefined) {
            const deck = data.next as Deck<Card>;
            if(!deck)
                throw new Error("No deck provided for lookAndReorderTopCardsEffect");
            deckName = deck._type;
        }
        if(!isDeckType(deckName))
            throw new Error("Invalid deck type for lookAndReorderTopCardsEffect");
        const top5Cards = game.getFirstCardsOfDeck(deckName, numberCards);
        const selectionResult = await data.selectAndRecord(game, data.issuer, numberCards, top5Cards, false, "Select the order to put back the cards (first selected will be on top).", false);
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
            game.discard(data.it);
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
        if(data.it instanceof LootCard === false)
            throw new Error("Card is not a loot card for enterPlayBecomeSoulEffect");
        data.it.afterEffect = "nothing"; // card placement is handled by the effect itself.
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

export function dealDamageNotEngagedInCombatOrYourselfEffect(game: Game, amount: number): EffectFunction {
    return async (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        const feasibleTargets = game.Entities.filter(e => e.isEngagedInCombat === false || e === data.issuer);
        if (feasibleTargets.length === 0) return false;
        const target = (await data.selectAndRecord(game, data.issuer, 1, feasibleTargets, false, "Select a target to deal damage to.")).selected[0] as Entity;
        game.dealDamage(data.issuer, target, data.it, amount);
        return true;
    }
}


export function putThisOnBottomOfLootDeckEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        if(data.it instanceof LootCard === false)
            throw new Error("Card is not a loot card for putThisOnBottomOfLootDeckEffect");
        data.it.afterEffect = "nothing"; // card placement is handled by the effect itself.
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
        const cardToPutBack = (await data.selectAndRecord(game, data.issuer, 1, data.issuer.hand.cards, false, "Select a loot card to put on top of the loot deck.", false)).selected[0] as LootCard;
        const card = game.getCardFromHand(data.issuer, cardToPutBack);
        game.decks["loot"]!.addTopPosition(card);
        return true;
    };
}

export function thisBecomeSoulGainItEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        if (data.issuer instanceof Player === false) return false;
        if(data.it instanceof ItemCard === false)
            throw new Error("Card is not an item card for thisBecomeSoulGainItEffect");
        game.removeInPlay(data.issuer, data.it);
        data.it.soul = 1;
        game.addSoul(data.issuer, data.it);
        return true;
    };
}

