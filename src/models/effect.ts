import { DamageOnStack, DiceRoll, Player } from "./player";
import { type Card, LootCard, type EffectFunction, type TargetsSelector, ItemCard, MonsterCard, InplayType, BsoulCard, type EffectData } from "./cards";
import { Game } from "./game";
import type { Entity } from "./entity";
import { effect } from "zod/v3";
import type { Stack, StackElement } from "./stack";
import { it } from "zod/locales";
import { firstAttackRollStatModifierEffect, gainCoinsOnDamageEffect, gainPlusCoinsEffect, goFirstInTurnOrderEffect, LookAndPutBottomEffect, lootOnPlayerDeathEffect, preventDamageOnRollEffect, preventNextDamageUpToEffect, rollDiceOnTriggerEffect, temporaryStatModifierEffect } from "./abilities";
import type { BonusSoulCardType } from "@/types/cardTypes";

function prepareEffectString(s: string): string {
    s.replace("[Tap Effect]", ""); // remove tap effect marker
    s.replace("Paid Effect]", ""); // remove paid effect marker
    s.trim();
    s.toLowerCase();

    return s;
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

export function gainCoinsEffect(game: Game, amount: number): EffectFunction {
    return (data:EffectData) => {
        game.gainCoins(data.issuer, amount);
        return true;
    };
}

export function loseCoinsEffect(game: Game, amount: number): EffectFunction {
    return (data:EffectData) => {
        const nb = game.loseCoins(data.issuer, amount, true);
        return nb === amount;
    };
}

export function rechargeItemsEffect(): EffectFunction {
    return (data:EffectData) => {
        for (const card of data.targets as ItemCard[]){
            card.recharge();
        }
        return true;
    };
}

export function rechargeEachItemsOfTargetEffect(): EffectFunction {
    return (data:EffectData) => {
        const player = data.targets[0] as Player;
        const inplayItems = player.inPlay.filter((card) => card instanceof ItemCard) as ItemCard[];
        for (const card of inplayItems) {
            card.recharge();
        }
        return true;
    };
}

export function makeAPlayerWithMostSoulsDestroyASoulEffect(game: Game): EffectFunction {
    return (data:EffectData) => {
        const target = data.targets[0] as Player;
        if (game.playersWithMostSouls.includes(target)) {
            const card = game.select(target, 1, target.souls).selected[0]!;
            return game.destroyCardsOrSouls([card]);
        }
        return false;
    };
}
export function look5Put1TopRestBottomEffect(deckName: string, game: Game): EffectFunction {
    return (data:EffectData) => {
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
    return (data:EffectData) => {
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
export type ChooseOneResult = {
    description: string;
    chosenOptions: any[];
};

export const isChooseOneResult = (x: any): x is ChooseOneResult => {
    return typeof x === 'object' && x !== null && 'description' in x && 'chosenOptions' in x;
};

export function chooseOneEffect(s: string, game: Game): EffectFunction {
    const lines = s.split("\n");
    if (lines.length !== 3) {
        throw new Error("invalid 'choose one' effect format.");
    }
    const Effect1: EffectFunction = effectParser(lines[1]!, game);
    const Effect2: EffectFunction = effectParser(lines[2]!, game);
    return (data:EffectData) => {
        const targetsChooseOne = data.targets[0] as ChooseOneResult;
        const description = targetsChooseOne.description;
        const options = targetsChooseOne.chosenOptions;
        if (description === lines[1]) {
            return Effect1({it: data.it, issuer: data.issuer, targets: options});
        } else if (description === lines[2]) {
            return Effect2({it: data.it, issuer: data.issuer, targets: options});
        }
        else {
            console.log("\n", lines[1], "\n", lines[2], "\n", " CHOICE ", "\n", description);
            throw new Error("invalid choice made in 'choose one' effect.");
        }
    }
}

export function destroyYourItemAndStealEffect(game: Game): EffectFunction {
    return (data:EffectData) => {
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
    return (data:EffectData) => {
        const toDestroy = data.targets[0] as Card;
        // game.select(data.issuer, 1, data.targets).selected[0] as Card;
        return game.destroyCardsOrSouls([toDestroy]);
    };
}

export function changeRollDiceResultEffect(game: Game): EffectFunction {
    return (data:EffectData) => {
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
    return (data:EffectData) => {
        const itemToSwap = game.select(data.issuer, 1, game.inPlayItems.filter((card) => card instanceof ItemCard && card.eternal === false)).selected[0]!;
        game.swapItems(data.it as ItemCard, itemToSwap);
        return true;
    };
}

export function copyTapAbilityEffect(game: Game): EffectFunction {
    return (data:EffectData) => {
        const itemToCopy = game.select(data.issuer, 1, game.inPlayItems.filter((card) => card instanceof ItemCard && card.eternal === false)).selected[0]! as ItemCard;
        const effectToCopy = itemToCopy.onTap();
        return true;
    };
}

export function cancelStackElementEffect(game: Game): EffectFunction {
    return (data:EffectData) => {
        game.cancelStackElement(data.targets[0] as StackElement);
        return true;
    };
}

export function stealSoulEffect(game: Game): EffectFunction {
    return (data:EffectData) => {
        const soulToSteal = game.select(data.issuer, 1, game.soulsOwned).selected[0]!;
        const target = game.getOwner(soulToSteal);
        game.stealSoul(data.issuer, target!, soulToSteal);
        return true;
    };
}

export function stealNonEternalItemEffect(game: Game): EffectFunction {
    return (data:EffectData) => {
        const itemToSteal = game.select(data.issuer, 1, game.inPlayItems.filter((card) => card instanceof ItemCard && card.eternal === false)).selected[0]!;
        return game.stealItemAnywhere(data.issuer, itemToSteal);
    };
}

export function stealNonEternalItemFromAnywhereEffect(game: Game): EffectFunction {
    return (data:EffectData) => {

        const itemToSteal = data.targets[0] as ItemCard;
        // game.select(data.issuer, 1, game.visibleItems.filter((card) => card instanceof ItemCard && card.eternal === false)).selected[0]!;
        return game.stealItemAnywhere(data.issuer, itemToSteal);
    };
}

export function subtractUpTo2FromRollEffect(game: Game): EffectFunction {
    return (data:EffectData) => {
        const choosenDiceRoll: DiceRoll = data.targets[0] as DiceRoll;
        const selectionResult = game.select(data.issuer, 1, [0, 1, 2]);
        const subtractValue = selectionResult.selected[0] as number;
        choosenDiceRoll.substract(subtractValue);
        return true;
    };
}

export function addUpTo2ToRollEffect(game: Game): EffectFunction {
    return (data:EffectData) => {
        const choosenDiceRoll: DiceRoll = data.targets[0] as DiceRoll;
        const selectionResult = game.select(data.issuer, 1, [0, 1, 2]);
        const addValue = selectionResult.selected[0] as number;
        choosenDiceRoll.add(addValue);
        return true;
    };
}

export function add1ToRollEffect(): EffectFunction {
    return (data:EffectData) => {
        const choosenDiceRoll: DiceRoll = data.targets[0] as DiceRoll;
        choosenDiceRoll.add(1);
        return true;
    };
}

export function lootAndGainAsPlayerEffect(game: Game): EffectFunction {
    return (data:EffectData) => {
        return drawAndGainCoinsAsAPlayerEffect(data.issuer, data.targets[0] as Player, game);
    };
}

export function cancelPreviousNonRollEffect(game: Game): EffectFunction {
    return (data:EffectData) => {
        game.cancelStackElement(data.targets[0] as StackElement);
        return true;
    };
}

export function flushMonsterSlotsEffect(game: Game): EffectFunction {
    return (data:EffectData) => {
        game.monsterSlots.flush();
        return true;
    };
}

export function flushMonsterSlotsToBottomEffect(game: Game): EffectFunction {
    return (data:EffectData) => {
        game.monsterSlots.flushToBottom();
        return true;
    };
}

export function lookAtHands(game: Game): EffectFunction {
    return (data:EffectData) => {
        game.select(data.issuer, 0, game.allHands());
        return true;
    };
}

export function lookAtTopCardOfDeckEffect(game: Game): EffectFunction {
    return (data:EffectData) => {
        const deckName = data.targets[0] as string;
        const topCard = game.getFirstCardsOfDeck(deckName, 1)[0];
        const selectionResult = game.select(data.issuer, 1, [topCard!], true);
        if (selectionResult.selected[0] === topCard) {
            game.addBottomPosition(deckName, topCard!);
        } else {
            game.addTopPosition(deckName, topCard!);
        }
        return true;
    };
}

export function rerollEachItemEffect(game: Game): EffectFunction {
    return (data:EffectData) => {
        const player = data.targets[0] as Player;
        const inplayItems = player.inPlay.filter((card) => card instanceof ItemCard) as ItemCard[];
        for (const card of inplayItems) {
            game.reroll(player, card);
        }
        return true;
    };
}

export function stealRandomLootCardEffect(game: Game): EffectFunction {
    return (data:EffectData) => {
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
    return (data:EffectData) => {
        game.destroyCardsOrSouls([data.it]);
        game.loot(data.issuer, 2);
        return true;
    };
}

export function discard1LootCardEffect(game: Game): EffectFunction {
    return (data:EffectData) => {
        const toDiscard = game.select(data.issuer, 1, data.issuer.hand.cards).selected[0] as LootCard;
        const index = data.issuer.hand.cards.indexOf(toDiscard);
        game.discardFromHand(data.issuer, index + 1);
        return true;
    };
}

export function endTurnAndResetStackEffect(game: Game): EffectFunction {
    return (data:EffectData) => {
        game.resetStack();
        game.endTurn();
        return true;
    };
}

export function putTopCardOfEachDeckIntoDiscardEffect(game: Game): EffectFunction {
    return (data:EffectData) => {
        for (const deckName of ["loot", "treasure", "monster"]) {
            const topCard = game.getFirstCardsOfDeck(deckName, 1)[0];
            game.decks[deckName]!.addDiscardTop(topCard!);
        }
        return true;
    };
}

export function passHandsLeftEffect(game: Game): EffectFunction {
    return (data:EffectData) => {
        let tempHand = game.players[0]!.hand;
        for (let i = 0; i < game.players.length; i++) {
            const nextPlayer = game.players[(i + 1) % game.players.length]!;
            tempHand = game.setHand(nextPlayer, tempHand);
        }
        return true;
    };
}

export function rerollDiceEffect(): EffectFunction {
    return (data:EffectData) => {
        const choosenDiceRoll: DiceRoll = data.targets[0] as DiceRoll;
        choosenDiceRoll.roll();
        return true;
    };
}

export function rollAndDealDamageEffect(game: Game): EffectFunction {
    return (data:EffectData) => {
        const target = data.targets[0] as Entity;
        const roll = data.issuer.rollDice();
        game.dealDamage(data.issuer, target, data.it, roll.value);
        return true;
    };
}

export function changeRollTo1Or6Effect(game: Game): EffectFunction {
    return (data:EffectData) => {
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
        effects.push((data:EffectData) => {
            const target = data.targets[0] as Entity;
            if (i + 1 >= evasion) {
                game.dealDamage(data.issuer, target, data.it, damageDealt);
            } else {
                game.dealDamage(target, data.issuer, data.it, damageReceived);
            }
            return true;
        });
    }
    return effects;
}

export function loot1PutCardOnTopEffect(game: Game): EffectFunction {
    return (data:EffectData) => {
        game.loot(data.issuer, 1);
        const cardToPutBack = game.select(data.issuer, 1, data.issuer.hand.cards).selected[0] as LootCard;
        const card = game.getCardFromHand(data.issuer, cardToPutBack);
        game.decks["loot"]!.addTopPosition(card);
        return true;
    };
}

export function rerollItemEffect(game: Game): EffectFunction {
    return (data:EffectData) => {
        const p: Player = game.getPlayerById(data.targets[0].player)!;
        game.reroll(p, data.targets[0].card);
        return true;
    };
}

export function flushShopToBottomEffect(game: Game): EffectFunction {
    return (data:EffectData) => {
        game.shop.flushToBottom();
        return true;
    };
}

export function playerGivesLootCardEffect(game: Game): EffectFunction {
    return (data:EffectData) => {
        const targetPlayer = data.targets[0] as Player;
        if (targetPlayer.hand.length > 0) {
            const cardToSteal = game.select(targetPlayer, 1, targetPlayer.hand.cards).selected[0] as LootCard;
            game.stealLootCard(data.issuer, targetPlayer, cardToSteal);
        }
        return true;
    };
}

export function putMonsterFromDiscardOnTopEffect(game: Game): EffectFunction {
    return (data:EffectData) => {
        const monsterToPutBack = game.select(data.issuer, 1, game.decks["monster"]!.discard.filter((card) => card.type !== "event")).selected[0] as Card;
        game.decks["monster"]!.remove(monsterToPutBack);
        game.decks["monster"]!.addTopPosition(monsterToPutBack);
        return true;
    };
}

export function rechargeThisEffect(): EffectFunction {
    return (data:EffectData) => {
        (data.it as ItemCard).recharge();
        return true;
    };
}

export function cancelAtIndexEffect(game: Game): EffectFunction {
    return (data:EffectData) => {
        game.cancelAt(data.targets[0] as number);
        return true;
    };
}

export function removeCounterAndDoEffect(s: string, game: Game): EffectFunction {
    return (data:EffectData) => {
        if ((data.it as ItemCard).tags.counters! > 0) {
            (data.it as ItemCard).tags.counters -= 1;
            effectParser(s.substring(24).trim(), game)(data);
        }
        return true;
    };
}

export function remove3CountersAndDoEffect(s: string, game: Game): EffectFunction {
    return (data:EffectData) => {
        if ((data.it as ItemCard).tags.counters! >= 3) {
            (data.it as ItemCard).tags.counters -= 3;
            effectParser(s.substring(24).trim(), game)(data);
        }
        return true;
    };
}

export function becomesSoulAndGainEffect(game: Game): EffectFunction {
    return (data:EffectData) => {
        game.removeInPlay(data.issuer, data.it);
        data.it.soul = 1;
        game.addSoul(data.issuer, data.it);
        return true;
    };
}

export function addInPlayEffect(game: Game): EffectFunction {
    return (data:EffectData) => {
        // console.log("adding in play loot card from effect:", data.it.name);
        game.addInPlay(data.issuer, data.it);
        return true;
    };
}

function obtainRollResults(s: string): string[] {
    s = s.split("roll-")[1]!.trim();
    const lines:string[] = s.split("\n");
    let results: string[] = new Array<string>(6).fill("");
    for (let line of lines){
        line = line.trim();
        if (line.length > 0){
            switch (line[1]){
                case '-':
                    for (let i = Number(line[0]); i <= Number(line[2]); i++){
                        results[i-1] = line.substring(4).trim();
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

function rollEffect(s:string, game: Game): EffectFunction {
    if (s == "roll-\ndeal damage to them equal to the result.")
        return dealRollDamageEffect(s, game);
    const rollResults = obtainRollResults(s);
    const effects: EffectFunction[] = rollResults.map(effectText => effectParser(effectText, game));
    return (data:EffectData) => {
        const result = data.issuer.rollDice();
        result.attachEffect(effects, data.it, data.targets);
        game.addToStack(result);
        return true;
    };
}

function dealRollDamageEffect(s: string, game: Game): EffectFunction {
    return (data:EffectData) => {
        const target = data.targets[0] as Entity;
        const roll = data.issuer.rollDice();
        roll.attachEffect([...Array(6).keys()].map((i) =>
            (data:EffectData) => {
                game.dealDamage(data.issuer, data.targets[0] as Entity, data.it, i + 1);
                return true;
            }), data.it, data.targets);
        game.addToStack(roll);
        return true;
    };
}


function takeDamageGainCoinsEffect(s: string, damage: number, coins:number, game: Game) : EffectFunction {
    return (data:EffectData) => {
        const life_before = data.issuer.currentHealthPoints;

        const callback = (data:EffectData) => {
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


export function effectParser(s: string, game: Game, defaultEffect: EffectFunction = addInPlayEffect(game)): EffectFunction {
    const originalS = s;
    // if (s === "Destroy an item you control. If you do, steal a non-eternal item from a player or from the shop.")
    //     console.log("parsing special roll effect:", originalS);
    s = s.toLowerCase();
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
        return gainCoinsEffect(game, gainAmount); 
    const coinStolen = parseNumber(s, /^steal\s+(\d+)\u00A2 from a player\.?$/u);
    if (coinStolen !== null)
        return (data:EffectData) => {
            const target = data.targets[0] as Player;
            const stolen = game.stealCoins(data.issuer, target, coinStolen);
            return true;
        };

    const deckName = parseText(s, /look at the top 5 cards of the (\w+) deck\. put 1 on top and the rest on the bottom\./u);
    if (deckName !== "")
    {
        return look5Put1TopRestBottomEffect(deckName, game);
    }

    const treasureAmount = parseNumber(s, /^gain \+(\d+) treasures?\.?$/u);
    if (treasureAmount !== null)
        return (data:EffectData) => { game.gainTreasure(data.issuer, treasureAmount); return true; };

    const loseAmount = parseNumber(s, /^lose\s+(\d+)\u00A2\.?$/u);
    if (loseAmount !== null)
        return loseCoinsEffect(game, loseAmount);
    
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
    if (s.startsWith("choose one-"))
        return chooseOneEffect(s, game);
    if (s.startsWith("roll-"))
        return rollEffect(s, game);
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
    {
        return (data:EffectData) => {
            data.it.tags.counters = (data.it.tags.counters ?? 0) + 1;
            return true;
        };
    }
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
        return takeDamageGainCoinsEffect(s, damageToTake2, coins, game);
    let damageToDeal = parseNumber(s, /^deal (\d+) damage to a monster or player\.?$/u);
    if( damageToDeal === null )
      damageToDeal = parseNumber(s, /^deal (\d+) damage to a player\.?$/u);
    if (damageToDeal === null)
      damageToDeal = parseNumber(s, /^deal (\d+) damage to a monster\.?$/u);
    if (damageToDeal !== null)
        return (data:EffectData) => {
            const target = data.targets[0] as Entity;
            game.dealDamage(data.issuer, target, data.it, damageToDeal);
            return true;
        };
    // Match patterns like "prevent next instance of up to 2 damage this turn"
    const preventMatch = s.match(/^choose a player. prevent (?:the )?next instance of up to (\d+) damage(?: you would take)? this turn\.?$/u);
    switch (s) {
        // passive effects
        case "if you control this as the game starts, you go first.":
            {
                console.log("parsing go first effect");
                return goFirstInTurnOrderEffect(game);
            }

        case "when you start the game, look at the top 3 cards of the treasure deck and choose one. it becomes your starting item and gains eternal. put the rest on the bottom of the treasure deck.":
            {
                console.log("parsing starting item effect");
                return (data:EffectData) => {return true;};
                // return startingItemEffect(game);
            }
        case "choose a player. prevent the next 1 damage they would take this turn.":
            return preventNextDamageUpToEffect(1, game);
        case "choose a player or monster. prevent the next instance of up to 2 damage they would take this turn.":
            return preventNextDamageUpToEffect(2, game);
        case "you gain +1 [atk] till the end of turn.":
            return temporaryStatModifierEffect([game.addAttack], 1, game);
        case "you gain +1 [hp] till the end of turn.":
            return temporaryStatModifierEffect([game.addHealth], 1, game);
        case "choose a player.\nthey gain +2 [hp] till end of turn.":
            return temporaryStatModifierEffect([game.addHealth], 2, game);
        case "choose a player.\nthey gain +1 [atk] and +1 [hp] till end of turn.":
            return temporaryStatModifierEffect([game.addAttack, game.addHealth], 1, game);
        case "choose a player.\nthey gain +1 [atk] and +1 to dice rolls till end of turn.":
            return temporaryStatModifierEffect([game.addAttack, game.addAttackDiceModifier], 1, game);
        case "choose a player.\nthey gain +1 [atk] till end of turn and may attack an additional time this turn.":
            return temporaryStatModifierEffect([game.addAttack, game.addAttackThisTurn], 1, game);
        case "each time you take damage, gain 1\u00A2.":
            return gainCoinsOnDamageEffect( 1, game);
        case "each time a player dies, before paying penalties, loot 1.":
            return lootOnPlayerDeathEffect(1, game);
        case "if you would gain any number of \u00A2, gain that much +1\u00A2 instead.":
            return gainPlusCoinsEffect(1, game);
        case "at the start of your turn, look at the top card of the loot deck. you may put it on the bottom.":
            return LookAndPutBottomEffect("loot", game);
        case "at the start of your turn, look at the top card of the monster deck. you may put it on the bottom.":
            return LookAndPutBottomEffect("monster", game);
        case "when you would die, roll-\n6: prevent death. if it's your turn, cancel everything that hasn't resolved and end it.":
            const roll = rollEffect("roll-\n6: prevent death. if it's your turn, cancel everything that hasn't resolved and end it.", game)
            return rollDiceOnTriggerEffect(roll, "on:death:would-death", game);
        case "at the start of your turn, look at the top card of the treasure deck, you may put it on the bottom.":
            return LookAndPutBottomEffect("treasure", game);
        case "gain +1 [atk] for your first attack roll each turn.":
            return firstAttackRollStatModifierEffect(1, 0, 0, game);
        case "each time you would take damage, roll-\n6: prevent 1 of that damage.":
            return preventDamageOnRollEffect([6], 1, game);
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
        case "recharge an item.":
            return rechargeItemsEffect();
        case "recharge another item.":
            return rechargeItemsEffect();
        case "destroy a curse.":
            return destroyOneEffect(game);
        case "destroy an item or soul.":
            return destroyOneEffect(game);
        case "destroy another item":
            return destroyOneEffect(game);
        case "destroy an item you control.":
            return destroyOneEffect(game);
        case "each player votes on an item in play. destroy the item with the most votes. if there is a tie, nothing happens.":
            return destroyOneEffect(game);
        case "swap this with a non-eternal item another player controls.":
            return swapWithNonEternalItemEffect(game);
        case "this copies a ↷ ability of a non-eternal item.":
            return copyTapAbilityEffect(game);
        case "cancel the ↷ or $ ability of an item.":
            return cancelStackElementEffect(game);
        case "steal a soul from another player.":
            return stealSoulEffect(game);
        case "steal a non-eternal item from a player.":
            return stealNonEternalItemEffect(game);
        case "steal a non-eternal item a player controls.":
            return stealNonEternalItemEffect(game);
        case "subtract up to 2 from a roll.":
            return subtractUpTo2FromRollEffect(game);
        case "add up to 2 to a non-attack roll.":
            return addUpTo2ToRollEffect(game);
        case "add 1 to a roll.":
            return add1ToRollEffect();
        case "choose a player. loot and gain \u00A2 until you have the same number of each as they do.":
            return lootAndGainAsPlayerEffect(game);
        case "when this enters play, it becomes a soul.\n(it's no longer an item.)":
            return (data:EffectData) => {
                game.removeInPlay(data.issuer, data.it);      
                data.it.soul = 1;
                game.addSoul(data.issuer, data.it);
                return true;
            }
        case "cancel the ↷ or $ ability of an item or a loot being played.":
            return cancelPreviousNonRollEffect(game);

        case "put each monster not being attacked into discard and replace each with the top card of the monster deck.":
            return flushMonsterSlotsEffect(game);
        case "put each monster not being attacked on the bottom of the monster deck.":
            return flushMonsterSlotsToBottomEffect(game);
        case "look at each player's hand":
            return lookAtHands(game);
        case "look at the top card of a deck. you may put that card on the bottom of that deck.":
            return lookAtTopCardOfDeckEffect(game);
        case 'choose a player. they reroll each item they control.':
            return rerollEachItemEffect(game);
        case "choose another player. steal a loot card from them at random.":
            return stealRandomLootCardEffect(game);

        case "choose a player. recharge each item they control.":
            return rechargeEachItemsOfTargetEffect();
        case "destroy this and loot 2.":
            return destroyThisAndLoot2Effect(game);
        
        case "discard 1 loot card.":
            return discard1LootCardEffect(game);
        
        case "end the turn. cancel everything that hasn't resolved.":
            return endTurnAndResetStackEffect(game);
        
        case "choose the player with the most souls or tied for the most. that player destroys a soul they control.":
        {
            return makeAPlayerWithMostSoulsDestroyASoulEffect(game);
        }

        case "put the top card of each deck into discard.":
            return putTopCardOfEachDeckIntoDiscardEffect(game);
        case "each player gives their hand to the player to their left.":
            return passHandsLeftEffect(game);
        case "steal a non-eternal item from a player or from the shop.":
            return stealNonEternalItemFromAnywhereEffect(game);
        
        case "look at the top card of each deck. you may put any of those cards on the bottom of their deck":
            return look1EachDeckEffect(game);
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
                return changeRollDiceResultEffect(game);

        case "change the result of a dice roll to a 1 or 6.":
            return (data:EffectData) => {
                const choosenDiceRoll: DiceRoll = data.targets[0] as DiceRoll;
                const selectionResult = game.select(data.issuer, 1, [1, 6]);
                const newValue = selectionResult.selected[0] as number;
                choosenDiceRoll.value = newValue;
                return true;
            };

        case "loot 1, then put a loot card from your hand on top of the loot deck.":
            return (data:EffectData) => {
                game.loot(data.issuer, 1);
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
        case "remove a counter from this:":
            return (data:EffectData) => {
                if ((data.it as ItemCard).tags.counters! > 0)
                {
                    (data.it as ItemCard).tags.counters -= 1;
                    return effectParser(s.substring(24).trim(), game)(data);
                }
                return false;
            };
        case "remove 3 counters from this:":
            return (data:EffectData) => {
                if ((data.it as ItemCard).tags.counters! >= 3) {
                    (data.it as ItemCard).tags.counters -= 3;
                    return effectParser(s.substring(24).trim(), game)(data);
                }
                return false;
            };
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
    if (s === "choose the player with the most souls or tied for the most. that player destroys a soul they control.")
    {
        return [{description: "Choose a player with the most souls or tied for the most.", selector: playerSelector((p) => p.souls.length === Math.max(...game.players.map(p => p.souls.length)), game)}];
    }
    if (s === "choose a dice roll. its controller rerolls it." ||
        s === "change the result of a dice roll to a 1 or 6." ||
        s === "change the result of a dice roll to a number of your choosing.") {
        return [{description: "Choose a dice roll", selector: rollSelector(undefined, game)}];
    }
    if (s === "choose a player or monster, then roll- deal damage to them equal to the result." ||
        s === "choose a player or monster, then roll-\ndeal damage to them equal to the result." ||
        s === "choose a player or monster. prevent the next instance of up to 2 damage they would take this turn." ||
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
        return Object.keys(game.decks).filter((deckName) => filter(deckName));
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