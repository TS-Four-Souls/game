import { DiceRoll, Player } from "./player";
import { type Card, type EffectData, LootCard, type EffectFunction, type TargetsSelector, ItemCard, InplayType, treasureCard, LootCardEffect } from "./cards";
import { Game, gameParameters } from "./game";
import type { TriggerEvent } from "@/types/triggers";
import { deckSelector } from "./effectParser";
import { Monster } from "./monster";
import * as active from "./activeEffect";

export function preventNextDamageUpToEffect(amount: number, game: Game): EffectFunction {
    return (data:EffectData) => {
        let offDamage: (() => void) | null = null;
        let offTurn: (() => void) | null = null;

        const cleanup = () => {
            offDamage?.();
            offTurn?.();
            offDamage = null;
            offTurn = null;
        };

        // Listen for the next damage event on this player
        offDamage = game.emitter.on("on:damage:would-take", ({ eventIssuer, damageArray }) => {
            const target = data.targets[0] === undefined ? data.issuer : data.targets[0];
            if (target !== eventIssuer) return;
            const current = damageArray[0] ?? 0;
            if( current <= 0) return;
            const prevented = Math.min(current, amount);
            damageArray[0] = current - prevented;
            cleanup(); // One-shot: remove listeners after first use
        });

        // Expire at end of turn if unused
        offTurn = game.emitter.on("on:turn:end", cleanup);

        return true;
    };
}

// 1 turn stat modifier: adds value to a stat until end of turn
export function temporaryStatModifierEffect(
    adders: ((player: Player, value: number) => void)[],
    amount: number,
    game: Game
): EffectFunction {
    return (data:EffectData) => {
        if(amount < 0)
            throw new Error("temporaryStatModifierEffect amount must be non-negative.");
        // Apply the stat modification
        const target = data.targets[0] === undefined ? data.issuer : data.targets[0];
        for(const adder of adders)
            adder(target, amount);
        
        // Register cleanup to reverse at end of turn
        let offTurn = game.emitter.on("on:turn:end", () => {
            for(const adder of adders)
                adder(target, -amount);
            offTurn();
        });

        return true;
    };
}

export function lvlXaddListenerEffect(
    functions: EffectFunction[],
    lvl: number,
    game: Game): EffectFunction {

    return (data: EffectData) => {
        let offTurn = game.emitter.on("on:coin:gained:after", ({ eventIssuer }) => {
            if (data.issuer !== eventIssuer) return;
            if (data.it.tags.levels === undefined || data.it.tags.levels < lvl) return;

            for (const func of functions)
                func(data);
            offTurn();
        });
        return true;
    };
}

export function countersOnDamageGainTreasureEffect(amountToRemove: number, treasureAmount: number, game: Game): EffectFunction {
    return (data: EffectData) => {
        let offDamage: (() => void) | null = null;
        // Listen for the next damage event on this player
        offDamage = game.emitter.on("on:damage:taken", ({ eventIssuer, damage: dmg }) => {
            if (data.issuer !== eventIssuer) return;
            data.it.tags.counters = (data.it.tags.counters ?? 0) + dmg;
            if (data.it.tags.counters >= amountToRemove) {
                data.it.tags.counters -= amountToRemove;
                game.gainTreasure(data.issuer, treasureAmount);
            }
        });
        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offDamage?.();
            offDamage = null;
        });
        return true;
    };
}

export function permanentStatModifierEffect(
    adders: ((player: Player, value: number) => void)[],
    amount: number,
    game: Game
): EffectFunction {
    return (data: EffectData) => {
        if (amount < 0)
            throw new Error("permanentStatModifierEffect amount must be non-negative.");
        // Apply the stat modification
        const target = data.targets[0] === undefined ? data.issuer : data.targets[0];
        for (const adder of adders)
            adder(target, amount);

        data.it.cleaners.push(() => {
            for (const adder of adders)
                adder(target, -amount);
        });

        return true;
    };
}

export function noPriorityPassesOnYourTurnEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        let offPriorityPasses: (() => void) | null = null;
        // Listen for priority passes on this player
        offPriorityPasses = game.emitter.on("on:priority:passes", ({ eventIssuer, order }) => {
            if (data.issuer !== eventIssuer) return;
            // Clear the array by setting length to 0 (mutates the array)
            order.length = 0;
        });
        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offPriorityPasses?.();
            offPriorityPasses = null;
        });
        return true;
    };
}

export function setNextDamageToXEffect(setTo: number, game: Game): EffectFunction {
    return (data:EffectData) => {
        let offDamage: (() => void) | null = null;
        let offTurn: (() => void) | null = null;
        const cleanup = () => {
            offDamage?.();
            offTurn?.();
            offDamage = null;
            offTurn = null;
        };
        // Listen for the next damage event on this player
        offDamage = game.emitter.on("on:damage:would-take", ({ eventIssuer, damageArray }) => {
            const target = data.targets[0] === undefined ? data.issuer : data.targets[0];
            if (target !== eventIssuer) return;
            damageArray[0] = setTo;
            cleanup(); // One-shot: remove listeners after first use
        });
        // Expire at end of turn if unused
        offTurn = game.emitter.on("on:turn:end", cleanup);
        return true;
    };
}

export function onYourTurnModifier(
    adders: ((player: Player, value: number) => void)[],
    amount: number,
    game: Game
): EffectFunction {
    return (data: EffectData) => {
        if (amount < 0)
            throw new Error("permanentStatModifierEffect amount must be non-negative.");

        if(game.currentPlayer === data.issuer) {
            // Apply the stat modification
            const target = data.targets[0] === undefined ? data.issuer : data.targets[0];
            for (const adder of adders)
                adder(target, amount);
        }

        let offTurn = game.emitter.on("on:turn:start", ({ eventIssuer }) => {
            if (eventIssuer !== data.issuer) return;
            const target = data.targets[0] === undefined ? data.issuer : data.targets[0];
            for (const adder of adders)
                adder(target, amount);
        });

        let offTurnEnd = game.emitter.on("on:turn:end", ({ eventIssuer }) => {
            if (eventIssuer !== data.issuer) return;
            const target = data.targets[0] === undefined ? data.issuer : data.targets[0];
            for (const adder of adders)
                adder(target, -amount);
        });

        // Store cleanup function on the card for when it's removed/destroyed

        data.it.cleaners.push(() => {            
            if (game.currentPlayer === data.issuer) {
                const target = data.targets[0] === undefined ? data.issuer : data.targets[0];
                for (const adder of adders)
                    adder(target, -amount);
            }
            offTurn();
            offTurnEnd();
        });

        return true;
    };
}

export function gainCoinsOnMonsterDeathEffect(
    amount: number,
    game: Game
): EffectFunction {
    return (data:EffectData) => {
        let offDeath: (() => void) | null = null;
        // Listen for the next damage event on this player
        offDeath = game.emitter.on("on:monster:died", ({ eventIssuer }) => {
            if (!(eventIssuer instanceof Monster)) return;
            game.gainCoins(data.issuer, amount);
        });
        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offDeath?.();
            offDeath = null;
        });
        return true;
    };
}

// First attack roll stat modifier: adds value to a stat until end of turn
export function firstAttackRollStatModifierEffect(
    damageDealtModifier: number=0,
    damageReceivedModifier: number=0,
    evasionModifier: number=0,
    game: Game
): EffectFunction {
    return (data:EffectData) => {
        let offAttack: (() => void) | null = null;

        const cleanup = () => {
            offAttack?.();
            offAttack = null;
        };
        // Register cleanup to reverse at end of turn
        offAttack = game.emitter.on("on:attack:roll:first-time-each-turn", ({ eventIssuer, target, dice, damageDealt, damageReceived, evasion } ) => {
            if (data.issuer !== eventIssuer) return;
            damageDealt[0]! += damageDealtModifier;
            damageReceived[0]! += damageReceivedModifier;
            evasion[0]! += evasionModifier;
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push( () => {
            cleanup();
        });
        return true;
    };
}

/*
Each time you take damage, [do something].
*/
export function onDamageTakenEffect(
    // callbacks: ((player: Player, dmg: number) => void)[],
    effectFunctions: EffectFunction[],
    // amount: number,
    game: Game
): EffectFunction {
    return (data: EffectData) => {
        // if (amount < 0)
        //     throw new Error("permanentStatModifierEffect amount must be non-negative.");
        let offDamage: (() => void) | null = null;

        offDamage = game.emitter.on("on:damage:taken", ({ eventIssuer, target: dealer, abilityCard: usingAbilityFrom, damage: dmg }) => {
            if (data.issuer !== eventIssuer) return;
            const index = data.targets.findIndex((c) => c.damageTaken !== undefined) < 0 
                ? data.targets.length 
                : data.targets.findIndex((c) => c.damageTaken !== undefined);
            data.targets[index] = {damageTaken: dmg};
            // for (const callback of callbacks)
            //     callback(data.issuer, amount);
            for (const func of effectFunctions)
                func(data);
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offDamage?.();
            offDamage = null;
        });
        return true;
    };
}

export function beforeDeathPenaltyEffect(
    // callbacks: ((player: Player, dmg: number) => void)[],
    effectFunctions: EffectFunction[],
    // amount: number,
    game: Game
): EffectFunction {
    return (data: EffectData) => {
        // if (amount < 0)
        //     throw new Error("permanentStatModifierEffect amount must be non-negative.");
        let offDamage: (() => void) | null = null;

        offDamage = game.emitter.on("on:death:before-penalty", ({ eventIssuer, target: dealer, abilityCard: usingAbilityFrom, damage: dmg }) => {
            if (data.issuer !== eventIssuer) return;
            // for (const callback of callbacks)
            //     callback(data.issuer, amount);
            for (const func of effectFunctions)
                func(data);
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offDamage?.();
            offDamage = null;
        });
        return true;
    };
}

/*
Each time triggerEvent triggers, if you are the eventIssuer, call effectFunctions.
*/
export function onYourEventEffect(
    triggerEvent: TriggerEvent,
    effectFunctions: EffectFunction[],
    game: Game
): EffectFunction {
    return (data: EffectData) => {
        let offDamage: (() => void) | null = null;

        offDamage = game.emitter.on(triggerEvent, ({ eventIssuer }) => {
            if (data.issuer !== eventIssuer) return;
            for (const func of effectFunctions)
                func(data);
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offDamage?.();
            offDamage = null;
        });
        return true;
    };
}

export function reduceDamageToOneEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        let offDamage: (() => void) | null = null;
        // Listen for the next damage event on this player
        offDamage = game.emitter.on("on:damage:would-take", ({ eventIssuer, damageArray }) => {
            if (data.issuer !== eventIssuer) return;
            damageArray[0] = Math.min(damageArray[0] ?? 0, 1);
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offDamage?.();
            offDamage = null;
        });
        return true;
    };
}

export function enterPlayDeactivatedEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        data.it.charged = false;
        return true;
    };
}

export function lootOnNextRollEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        let offRoll: (() => void) | null = null;
        // Listen for the next roll event on this player
        offRoll = game.emitter.on("on:dice:rolled", ({ diceRoll }) => {
            const guess = data.targets[0] as number;
            if(guess < 1 || guess > 6) {
                throw new Error("lootOnNextRollEffect target must be a number between 1 and 6.");
            }
            if(diceRoll.value === guess) {
                game.loot(data.issuer, 3);
            }
            offRoll?.();
            offRoll = null;
        });
        return true;
    };
}

export function copyNextNonTrinketNonAmbushLootThisTurnEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        let offLoot: (() => void) | null = null;
        let offTurn: (() => void) | null = null;
        // Listen for the next loot event on this player
        offLoot = game.emitter.on("on:loot:played", ({ eventIssuer, card, targets }) => {
            card = card as LootCard;
            if (data.issuer !== eventIssuer) return;
            if( card.trinket || card.ambush) return;
            const newTargets = game.select(data.issuer, 1, card.getTargetSelectors!(data.issuer, game), false);
            const resolveFunction = card.onPlay(eventIssuer, newTargets.selected);
            const lootCardEffect = new LootCardEffect(card, resolveFunction);
            game.addToStack(lootCardEffect);
            offLoot?.();
            offLoot = null;
            offTurn?.();
            offTurn = null;
        });
        
        offTurn = game.emitter.on("on:turn:end", () => {
            offLoot?.();
            offLoot = null;
            offTurn?.();
            offTurn = null;
        });
        return true;
    };
}

export function replaceDeathPenaltyEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        // Listen for the next death penalty event on this player
        let OriginalDeathPenalty = game.deathPenalty.bind(game);

        game.deathPenalty = (player: Player) => {
            if (data.issuer === player) {
                OriginalDeathPenalty(player);
                return;
            }

            const lostCoins = game.loseCoins(player, gameParameters.deathPenaltyCoins, true);
            game.gainCoins(data.issuer, lostCoins);
            const setOfLosableItems = (player.inPlay).filter((c) => (c instanceof treasureCard || (c instanceof LootCard && c.trinket))
            && c.eternal === false)
            if (gameParameters.deathPenaltyItem > 0) {
            const itemToLose = game.select(
                data.issuer,
                gameParameters.deathPenaltyItem,
                setOfLosableItems
            ).selected[0];
            if (itemToLose) {
                game.removeInPlay(player, itemToLose);
                game.decks[itemToLose.type]!.addDiscardTop(itemToLose);
            }
            }
            if(gameParameters.deathPenaltyLoot > 0) {
                const lootToLose = game.select(player, gameParameters.deathPenaltyLoot, player.hand.cards).selected[0];
                if (lootToLose) {
                    const card = game.getCardFromHand(player, lootToLose);
                    game.addCardToHand(data.issuer, lootToLose);
                }
            }
        }
        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            game.deathPenalty = OriginalDeathPenalty;
        });
        return true;
    };
}

// [game.addAttackDiceModifier.bind(game)], 1, (player: Player) => player.coins === 0, ["on:coin:gained:after", "on:coin:lost:after"], game);
export function ConditionalStatModifierEffect(
    adders: ((player: Player, value: number) => void)[],
    amount: number,
    condition: (player: Player) => boolean,
    triggerEvents: TriggerEvent[],
    game: Game
): EffectFunction {
    return (data: EffectData) => {
        let offEvents: (() => void)[] = [];
        
        let currentlyActive = false;
        const applyModifierIfConditionMet = (player: Player) => {
            if (condition(player) && !currentlyActive) {
                for (const adder of adders)
                    adder(player, amount);
                currentlyActive = true;
            } else if (!condition(player) && currentlyActive) {
                for (const adder of adders)
                    adder(player, -amount);
                currentlyActive = false;
            }
        };
        // Initial check
        applyModifierIfConditionMet(data.issuer);
        // Listen for the trigger events
        for (const triggerEvent of triggerEvents) {
            const offEvent = game.emitter.on(triggerEvent, ({ eventIssuer }) => {
                if (data.issuer !== eventIssuer) return;
                applyModifierIfConditionMet(data.issuer);
            });
            offEvents.push(offEvent);
        }

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            // Remove modifier if still active
            if (currentlyActive) {
                for (const adder of adders)
                    adder(data.issuer, -amount);
            }
            // Remove event listeners
            for (const offEvent of offEvents) {
                offEvent();
            }
            offEvents = [];
        });
        return true;
    };
}

export function preventDamageAndDealDmgOnPreventEffect(prevent: number, deal: number, game: Game): EffectFunction {
    return (data: EffectData) => {
        let offDamage: (() => void) | null = null;
        let offTurn: (() => void) | null = null;

        const cleanup = () => {
            offDamage?.();
            offTurn?.();
            offDamage = null;
            offTurn = null;
        };

        // Listen for the next damage event on this player
        offDamage = game.emitter.on("on:damage:would-take", ({ eventIssuer, damageArray }) => {
            const target = data.issuer;
            if (target !== eventIssuer) return;
            const current = damageArray[0] ?? 0;
            if( current <= 0) return;
            damageArray[0] = Math.max(0, current - prevent);

            // Deal 1 damage to another player
            const otherPlayers = game.players.filter(p => p !== data.issuer);
            if (otherPlayers.length === 0) return;
            const selection = game.select(data.issuer, 1, otherPlayers, false);
            if (selection.selected.length > 0) {
                const chosenPlayer = selection.selected[0]!;
                game.dealDamage(data.issuer, chosenPlayer, data.it, deal);
            }
            cleanup(); // One-shot: remove listeners after first use
        });

        // Expire at end of turn if unused
        offTurn = game.emitter.on("on:turn:end", cleanup);

        return true;
    };
}


export function changeRollOneToSixEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        let offRoll: (() => void) | null = null;
        // Listen for the next would roll event on this player
        offRoll = game.emitter.on("on:dice:would-roll", ({ diceRoll }) => {
            if (data.issuer !== diceRoll._issuer) return;
            if (diceRoll.value === 1) {
                const value = game.select(data.issuer, 1, [6], true).selected[0]!;
                diceRoll.value = value;
            }
        });
        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offRoll?.();
            offRoll = null;
        });
        return true;
    };
}

export function giveThisToAnotherPlayerOnDeathEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        let offDeath: (() => void) | null = null;
        // Listen for the next damage event on this player
        offDeath = game.emitter.on("on:death:before-penalty", ({ eventIssuer }) => {
            if (data.issuer !== eventIssuer) return;
            const otherPlayers = game.players.filter(p => p !== data.issuer);
            if (otherPlayers.length === 0) return;
            const selection = game.select(data.issuer, 1, otherPlayers, false);
            if (selection.selected.length > 0) {
                const chosenPlayer = selection.selected[0]!;
                game.give(data.issuer, chosenPlayer, data.it);
                data.issuer = chosenPlayer;
            }
        });
        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offDeath?.();
            offDeath = null;
        });
        return true;
    };
}

export function onFirstDamageEachTurnEffect(functions: EffectFunction[], game: Game): EffectFunction {
    return (data: EffectData) => {
        let offDamage: (() => void) | null = null;
        offDamage = game.emitter.on("on:damage:taken:first-time-each-turn", ({ eventIssuer, damage: dmg }) => {
            if (data.issuer !== eventIssuer) return;
            for (const func of functions)
                func(data);
        });
        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offDamage?.();
            offDamage = null;
        });
        return true;
    };
}


export function becomeSoulInsteadOfDestructionEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        let offDestroy: (() => void) | null = null;
        // Listen for the next damage event on this player
        offDestroy = game.emitter.on("on:item:destroyed", ({ eventIssuer, cards }) => {
            if (!cards.includes(data.it)) return;
            data.it.soul = 1;
            const index = game.destroyedCards.indexOf(data.it);
            if (index > -1) {
                game.destroyedCards.splice(index, 1);
            }
            game.addSoul(data.issuer, data.it);
        });
        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offDestroy?.();
            offDestroy = null;
        });
        return true;
    };
}

export function shopItemsCostLessEffect(discount: number, game: Game): EffectFunction {
    return (data: EffectData) => {
        let offDamage: (() => void) | null = null;

        offDamage = game.emitter.on("on:item:purchase", ({ eventIssuer, cost }) => {
            if (data.issuer !== eventIssuer) return;
            cost[0] = Math.max(0, (cost[0] ?? 0) - discount);
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offDamage?.();
            offDamage = null;
        });
        return true;
    };
}

export function lootStepEffect(
    effectFunctions: EffectFunction[],
    game: Game
): EffectFunction {
    return (data: EffectData) => {
        let offDamage: (() => void) | null = null;

        offDamage = game.emitter.on("on:loot:step", ({ eventIssuer }) => {
            if (data.issuer !== eventIssuer) return;
            for (const func of effectFunctions)
                func(data);
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offDamage?.();
            offDamage = null;
        });
        return true;
    };
}

export function gainCoinsOnDamageEffect(
    amount: number,
    game: Game
): EffectFunction {
    return onDamageTakenEffect([active.gainCoinsEffect(game, amount)], game);
}

export function rechargeCharaOnDamageEffect(
    // amount: number,
    game: Game
): EffectFunction {
    return onDamageTakenEffect([active.rechargeCharaEffect(game)], game);
    }


// "Each time a player dies, before paying penalties, loot 1."
export function lootOnPlayerDeathEffect(
    amount: number,
    game: Game
): EffectFunction {
    return (data:EffectData) => {
        let offDeath: (() => void) | null = null;

        const cleanup = () => {
            offDeath?.();
            offDeath = null;
        };

        // Listen for damage events on this player
        offDeath = game.emitter.on("on:death:before-penalty", ({ eventIssuer, target: from, abilityCard: usingAbilityFrom, damage: dmg }) => {
            if (eventIssuer instanceof Player) {
                game.loot(data.issuer, amount);
            }
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            cleanup();
        });

        return true;
    };
}
// If you would gain any number of \u00A2, gain that much + amount\u00A2 instead.
export function gainPlusCoinsEffect(
    amount: number,
    game: Game
): EffectFunction {
    return (data:EffectData) => {
        let offGainCoin: (() => void) | null = null;

        const cleanup = () => {
            offGainCoin?.();
            offGainCoin = null;
        };

        // Listen for the next damage event on this player
        offGainCoin = game.emitter.on("on:coin:gained", ({ eventIssuer, coinGained }) => {
            if (data.issuer !== eventIssuer) return;
            const current = coinGained[0] ?? 0;
            coinGained[0] = current + amount;
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            cleanup();
        });

        return true;
    };
}

// Each time you roll an attack roll, 
export function onAttackRollEffect(
    rollValues: number[],
    effect: EffectFunction,
    game: Game
): EffectFunction {
    return (data:EffectData) => {
        let offEffect: (() => void) | null = null;
        // Listen for the next damage event on this player
        offEffect = game.emitter.on("on:attack:roll", ({ eventIssuer, target, dice, damageDealt, damageReceived, evasion }) => {
            if (data.issuer !== eventIssuer) return;
            if (rollValues.includes((dice as DiceRoll).value))
                effect(data);
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offEffect?.();
            offEffect = null;
        });
        return true;
    };
}

export function onWouldRollEffect(
    effectFunctions: EffectFunction[],
    values: number[],
    game: Game
): EffectFunction {
    return (data: EffectData) => {
        let offDamage: (() => void) | null = null;

        offDamage = game.emitter.on("on:dice:would-roll", ({ eventIssuer, diceRoll }) => {
            if (data.issuer !== eventIssuer) return;
            if (!values.includes(diceRoll.value)) return;
            const index = data.targets.findIndex((c) => c.diceOwner !== undefined) < 0
                ? data.targets.length
                : data.targets.findIndex((c) => c.diceThatWouldRoll !== undefined);
            
            data.targets[index] = { diceThatWouldRoll: diceRoll};
            for (const func of effectFunctions)
                func(data);
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offDamage?.();
            offDamage = null;
        });
        return true;
    };
}

// Each time you roll an attack roll, 
export function onRollEffect(
    rollValues: number[],
    effect: EffectFunction,
    game: Game
): EffectFunction {
    return (data: EffectData) => {
        let offEffect: (() => void) | null = null;
        // Listen for the next damage event on this player
        offEffect = game.emitter.on("on:dice:rolled", ({ diceRoll }) => {
            if (rollValues.includes((diceRoll as DiceRoll).value))
            {
                data.targets = [diceRoll._issuer];
                effect(data);
            }
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offEffect?.();
            offEffect = null;
        });
        return true;
    };
}

export function startWithNCountersEffect(
    n: number,
    game: Game
): EffectFunction {
    return (data: EffectData) => {
        if(data.it.tags.counters === undefined)
            data.it.tags.counters = n;
        return true;
    };
}

export function preventDamageByRemovingCountersEffect(
    game: Game
): EffectFunction {
    return (data: EffectData) => {
        let offEffect: (() => void) | null = null;

        const cleanup = () => {
            offEffect?.();
            offEffect = null;
        };

        // Listen for the next damage event on this player
        offEffect = game.emitter.on("on:damage:would-take", ({ eventIssuer, damageArray }) => {
            if (data.issuer !== eventIssuer) return;
            const counters = data.it.tags.counters ?? 0;
            if(counters < 0) 
                throw new Error("preventDamageByRemovingCountersEffect: counters cannot be negative.");
            const current = damageArray[0] ?? 0;
            const prevented = Math.min(current, counters);
            damageArray[0] = current - prevented;
            data.it.tags.counters -= prevented;
            if(counters <= 0) 
                data.it.cleanup();
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            cleanup();
        });

        return true;
    };
}

export function takeDamagePlusEffect(
    amount: number,
    game: Game
): EffectFunction {
    return (data:EffectData) => {
        let offDamage: (() => void) | null = null;

        const cleanup = () => {
            offDamage?.();
            offDamage = null;
        };

        // Listen for the next damage event on this player
        offDamage = game.emitter.on("on:damage:would-take", ({ eventIssuer, damageArray }) => {
            if (data.issuer !== eventIssuer) return;
            const current = damageArray[0] ?? 0;
            damageArray[0] = current + amount;
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            cleanup();
        });

        return true;
    };
}

export function lootDoubleThisTurnEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        let offEffect: (() => void) | null = null;
        let offEndTurn: (() => void) | null = null;
        // Listen for the next damage event on this player
        offEffect = game.emitter.on("on:loot:would", ({ eventIssuer, numberOfCards }) => {
            if (data.targets[0] !== eventIssuer) return;
            numberOfCards[0]! *= 2;
        });

        offEndTurn = game.emitter.on("on:turn:end", ({ eventIssuer }) => {
            offEffect?.();
            offEffect = null;
            offEndTurn?.();
            offEndTurn = null;
        });

        // Store cleanup function on the card for when it's removed/destroyed

        return true;
    };
}

export function lootFromDiscardEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        let offEffect: (() => void) | null = null;
        // Listen for the next damage event on this player
        offEffect = game.emitter.on("on:loot:would", ({ eventIssuer, numberOfCards }) => {
            if (data.targets[0] !== eventIssuer) return;
            while(numberOfCards[0]! > 0)
            {
                const card = game.decks["loot"]!.discard.pop();
                if(card)
                    game.addCardToHand(eventIssuer, card as LootCard);
                else break;
                numberOfCards[0]! -= 1;
            }
            offEffect?.();
            offEffect = null;
        });
        return true;
    };
}

export function gainCoinsLevelUpEffect(
    game: Game
): EffectFunction {
    return (data: EffectData) => {
        let offEffect: (() => void) | null = null;

        const cleanup = () => {
            offEffect?.();
            offEffect = null;
        };
        data.it.tags.levels = data.it.tags.levels ?? 1; // At least level 1.

        // Listen for the next damage event on this player
        offEffect = game.emitter.on("on:coin:gained", ({ eventIssuer, coinGained }) => {
            if (data.issuer !== eventIssuer) return;
            const current = coinGained[0] ?? 0;
            data.it.tags.levels += current;
            coinGained[0] = 0;
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            cleanup();
        });

        return true;
    };
}

// Roll dice on trigger
export function preventDamageOnRollEffect(
    diceValues: number[],
    damagePrevented: number,
    game: Game
): EffectFunction {
    return (data:EffectData) => {
        let offEffect: (() => void) | null = null;

        const cleanup = () => {
            offEffect?.();
            offEffect = null;
        };

        // Listen for the next damage event on this player
        offEffect = game.emitter.on("on:damage:would-take", ({ eventIssuer, damageArray }) => {
            if (data.issuer !== eventIssuer) return;
            const roll:DiceRoll = game.rollDice(data.issuer, false);
            const effects: EffectFunction[] = new Array<EffectFunction>(6).fill((data:EffectData) => { return true; });
            for (const val of diceValues) {
                effects[val - 1] = (data:EffectData) => { 
                    damageArray[0]! -= damagePrevented; 
                    return true; 
                };
            }
            roll.attachEffect(effects, data.it, []);
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            cleanup();
        });
        return true;
    };  
}

export function goFirstInTurnOrderEffect(game: Game): EffectFunction {
    return (data:EffectData) => {
        let offEffect: (() => void) | null = game.emitter.on("on:game:start:before", () => {
            game.turnHandler.setFirstPlayer(data.issuer);
            offEffect?.();
            offEffect = null;
        });
        return true;
    };
}

export function startingItemEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        let offEffect: (() => void) | null = game.emitter.on("on:game:start:before", () => {
            const options: treasureCard[] = game.decks["treasure"]!.drawSeveral(3) as treasureCard[];
            const selection = game.gainTreasureAmongs(data.issuer, 1, options);
            selection.selected[0]?.setEternal(true);
            offEffect?.();
            offEffect = null;
        });
        return true;
    };
}