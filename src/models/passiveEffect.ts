import { DiceRoll, Player } from "./player";
import { EffectData, LootCard, type EffectFunction, ItemCard, treasureCard, LootCardEffect, EffectOnStack } from "./cards";
import { Game } from "./game";
import type { TriggerEvent } from "@/types/triggers";
import { Monster } from "./monster";
import { TargetBuilder } from "./targetBuilder";
import type { TemporaryEffect } from "@/shared/api";

function getTemporaryEffect(data: EffectData, description: string): TemporaryEffect {
    return{
            card: {slug: data.it.slug, name: data.it.name},
            issuer: data.issuer.id,
            targets: TargetBuilder.convertToSelectionItems(data.targets),
            description: description
        };
}
export function addPassiveEffectToStack(
    game: Game,
    effectFunction: EffectFunction,
    data: EffectData,
    description: string
): void {
    const effectOnStack = new EffectOnStack(effectFunction, data, description);
    game.addToStack(effectOnStack);
}

// REPLACEMENT EFFECT: Uses "prevent" - does not use the stack.
// Card text: "Prevent the next instance of up to X damage they would take this turn."
export function preventNextDamageUpToEffect(amount: number, game: Game): EffectFunction {
    return (data:EffectData) => {
        let offDamage: (() => void) | null = null;
        let offTurn: (() => void) | null = null;
        const temp: TemporaryEffect = getTemporaryEffect(data, `Prevent the next instance of up to ${amount} damage they would take this turn.`);
        let target = data.peek();
        if(data.targets.length == 0)
            target = data.issuer;
        target.addTemporaryEffect(temp);

        const cleanup = () => {
            target.removeTemporaryEffect(temp);
            offDamage?.();
            offTurn?.();
            offDamage = null;
            offTurn = null;
        };

        // Listen for the next damage event on this player
        offDamage = game.emitter.on("on:damage:would-take", ({ eventIssuer, damageArray }) => {
            // let target = data.peek();
            // if(data.targets.length == 0)
            //     target = data.issuer;
            // const target = data.targets.length > 0 ? data.peek() : data.issuer;
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

// NOT a triggered effect. This effect is always activated through the stack.
// Card text examples: "+X [stat] till end of turn" or "Gain +X [stat] this turn."
// This modifies the stat value directly rather than replacing an event.
export function temporaryStatModifierEffect(
    adders: ((player: Player, value: number) => void)[],
    amount: number,
    game: Game
): EffectFunction {
    return (data:EffectData) => {
        if(amount < 0)
            throw new Error("temporaryStatModifierEffect amount must be non-negative.");
        // Apply the stat modification
        const target = data.targets.length > 0 ? data.peek() : data.issuer;
        const temp: TemporaryEffect = getTemporaryEffect(data, `Temporary stats modifier.`);
        target.addTemporaryEffect(temp);

        for(const adder of adders)
            adder(target, amount);
        
        // Register cleanup to reverse at end of turn
        let offTurn = game.emitter.on("on:turn:end", () => {
            for(const adder of adders)
                adder(target, -amount);
            target.removeTemporaryEffect(temp);
            offTurn();
        });
        
        return true;
    };
}

// Associated with the coin gained replacement effect. It is therefore also considered as a replacement effect.
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

// REPLACEMENT EFFECT: Continuous stat modification - does not use the stack.
export function permanentStatModifierEffect(
    adders: ((player: Player, value: number) => void)[],
    amount: number,
    game: Game
): EffectFunction {
    return (data: EffectData) => {
        if (amount < 0)
            throw new Error("permanentStatModifierEffect amount must be non-negative.");
        // Apply the stat modification
        const target = data.targets.length > 0 ? data.peek() : data.issuer;
        for (const adder of adders)
            adder(target, amount);

        data.it.cleaners.push(() => {
            for (const adder of adders)
                adder(target, -amount);
        });

        return true;
    };
}

// REPLACEMENT EFFECT: Continuous priority modification - does not use the stack.
export function noPriorityPassesOnYourTurnEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        (data.issuer as Player).otherPlayerCanUseLootOrActivateOnMyTurn = false;
        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            (data.issuer as Player).otherPlayerCanUseLootOrActivateOnMyTurn = true;
        });
        return true;
    };
}

// REPLACEMENT EFFECT: Modifies damage before it's taken - does not use the stack.
// Replaces damage amount with a specific value.
export function setNextDamageToXEffect(setTo: number, game: Game): EffectFunction {
    return (data:EffectData) => {
        let offDamage: (() => void) | null = null;
        let offTurn: (() => void) | null = null;
        const temp: TemporaryEffect = getTemporaryEffect(data, `Temporary stats modifier.`);
        const target = data.targets.length > 0 ? data.peek() : data.issuer;
        target.addTemporaryEffect(temp);

        const cleanup = () => {
            target.removeTemporaryEffect(temp);
            offDamage?.();
            offTurn?.();
            offDamage = null;
            offTurn = null;
        };
        // Listen for the next damage event on this player
        offDamage = game.emitter.on("on:damage:would-take", ({ eventIssuer, damageArray }) => {
            if (target !== eventIssuer) return;
            damageArray[0] = setTo;
            cleanup(); // One-shot: remove listeners after first use
        });
        // Expire at end of turn if unused
        offTurn = game.emitter.on("on:turn:end", cleanup);
        return true;
    };
}

// REPLACEMENT EFFECT: Continuous stat modification on your turn - does not use the stack.
export function onYourTurnModifier(
    adders: ((player: Player, value: number) => void)[],
    amount: number,
    game: Game
): EffectFunction {
    return (data: EffectData) => {
        if (amount < 0)
            throw new Error("onYourTurnModifier amount must be non-negative.");

        if(game.currentPlayer === data.issuer) {
            // Apply the stat modification
            const target = data.targets.length > 0 ? data.peek() : data.issuer;
            for (const adder of adders)
                adder(target, amount);
        }

        let offTurn = game.emitter.on("on:turn:start", ({ eventIssuer }) => {
            if (eventIssuer !== data.issuer) return;
            const target = data.targets.length > 0 ? data.peek() : data.issuer;
            for (const adder of adders)
                adder(target, amount);
        });

        let offTurnEnd = game.emitter.on("on:turn:end", ({ eventIssuer }) => {
            if (eventIssuer !== data.issuer) return;
            const target = data.targets.length > 0 ? data.peek() : data.issuer;
            for (const adder of adders)
                adder(target, -amount);
        });

        // Store cleanup function on the card for when it's removed/destroyed

        data.it.cleaners.push(() => {            
            if (game.currentPlayer === data.issuer) {
                const target = data.targets.length > 0 ? data.peek() : data.issuer;
                for (const adder of adders)
                    adder(target, -amount);
            }
            offTurn();
            offTurnEnd();
        });

        return true;
    };
}

export function curseEffect(restEffectFunction: EffectFunction, game: Game): EffectFunction {
    return async (data: EffectData) => {
        // select owner of the curse.
        const owner = (await game.select(game.currentPlayer, 1, game.players, false, "Select a target for the curse.")).selected[0];
        if (!owner) return false;
        // Add the curse to their in play area.
        game.addInPlay(owner, data.it as ItemCard);
        // Apply the rest of the effect.
        restEffectFunction(new EffectData(data.it, owner, []));
        // Add Listener to remove the curse when the owner dies.
        let offDeath: (() => void) | null = null;
        offDeath = game.emitter.on("on:death:after-penalty", ({ eventIssuer }) => {
            if (owner !== eventIssuer) return;
            game.removeInPlay(owner, data.it as ItemCard);
            offDeath?.();
            offDeath = null;
        });
        data.it.cleaners.push(() => {
            offDeath?.();
            offDeath = null;
        });
        return true;
    }
}

// REPLACEMENT EFFECT: Continuous stat modification on your turn - does not use the stack.
export function firstAttackRollDiceModifier(
    amount: number,
    game: Game
): EffectFunction {
    return (data: EffectData) => {
        if (amount < 0)
            throw new Error("firstAttackRollDiceModifier amount must be non-negative.");
        let active = (data.issuer as Player).attackRollThisTurn ===  0;
        if(active)
            game.addAttackDiceModifier(data.issuer, amount);

        let offTurn = game.emitter.on("on:turn:start", ({ eventIssuer }) => {
            if (eventIssuer !== data.issuer) return;
            if(active) return;
            game.addAttackDiceModifier(data.issuer, amount);
        });

        let offTurnEnd = game.emitter.on("on:attack:roll", ({ eventIssuer }) => {
            if (eventIssuer !== data.issuer) return;
            if(!active) return
            if((data.issuer as Player).attackRollThisTurn !==  0)
            {
                active = false;
                game.addAttackDiceModifier(data.issuer, -amount);
            }
        });

        // Store cleanup function on the card for when it's removed/destroyed

        data.it.cleaners.push(() => {            
            if(active)
            {
                active = false;
                game.addAttackDiceModifier(data.issuer, -amount);
            }
            offTurn();
            offTurnEnd();
        });

        return true;
    };
}


// TRIGGERED EFFECT: Uses the stack.
// Card text: "Each time a monster dies, gain X¢."
export function gainCoinsOnMonsterDeathEffect(
    amount: number,
    game: Game
): EffectFunction {
    return (data:EffectData) => {
        let offDeath: (() => void) | null = null;
        // Listen for monster death events
        offDeath = game.emitter.on("on:death:monster", ({ eventIssuer }) => {
            if (!(eventIssuer instanceof Monster)) return;
            
            // Create the effect that will execute when the stack resolves
            const effect = (effectData: EffectData) => {
                if (!(effectData.issuer instanceof Player)) return false;
                game.gainCoins(effectData.issuer, amount);
                return true;
            };
            
            // Add to stack instead of executing immediately
            addPassiveEffectToStack(game, effect, data, `Gain ${amount}¢ from monster death`);
        });
        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offDeath?.();
            offDeath = null;
        });
        return true;
    };
}

// Continuous effect, no stack.
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
TRIGGERED EFFECT: Uses the stack.
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

        offDamage = game.emitter.on("on:damage:taken", ({ eventIssuer, target: dealer, source, damage }) => {
            if (data.issuer !== eventIssuer) return;
            const index = data.targets.findIndex((c) => c.damageTaken !== undefined) < 0 
                ? data.targets.length 
                : data.targets.findIndex((c) => c.damageTaken !== undefined);
            data.addTarget({damageTaken: damage});
            
            // Add all effects as a single stack element
            const effect = (effectData: EffectData) => {
                for (const func of effectFunctions) {
                    func(effectData);
                }
                return true;
            };
            // Should not work if damage is 0 or less
            if(damage > 0) 
                addPassiveEffectToStack(game, effect, data, "On damage taken effect");
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offDamage?.();
            offDamage = null;
        });
        return true;
    };
}

// TRIGGERED EFFECT: Uses the stack.
// Executes effects before death penalty is applied.
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

        offDamage = game.emitter.on("on:death:before-penalty", ({ eventIssuer, target: dealer, source, damage: dmg }) => {
            if (data.issuer !== eventIssuer) return;
            
            // Add all effects as a single stack element
            const effect = (effectData: EffectData) => {
                for (const func of effectFunctions) {
                    func(effectData);
                }
                return true;
            };
            addPassiveEffectToStack(game, effect, data, "Before death penalty effect");
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
TRIGGERED EFFECT: Uses the stack.
Each time triggerEvent triggers, if you are the eventIssuer, call effectFunctions.
*/
export function onYourEventEffect(
    triggerEvent: TriggerEvent,
    effectFunctions: EffectFunction[],
    game: Game,
    description: string
): EffectFunction {
    return (data: EffectData) => {
        let offDamage: (() => void) | null = null;
        
        offDamage = game.emitter.on(triggerEvent, ({ eventIssuer }) => {
            if (data.issuer !== eventIssuer) return;
            
            // Add all effects as a single stack element
            const effect = (effectData: EffectData) => {
                for (const func of effectFunctions) {
                    func(effectData);
                }
                return true;
            };
            addPassiveEffectToStack(game, effect, data, description);
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
TRIGGERED EFFECT: Uses the stack.
Each time triggerEvent triggers, if you are the eventIssuer, call effectFunctions.
*/
export function onAnyEventEffect(
    triggerEvent: TriggerEvent,
    effectFunctions: EffectFunction[],
    game: Game
): EffectFunction {
    return (data: EffectData) => {
        let offDamage: (() => void) | null = null;
        
        offDamage = game.emitter.on(triggerEvent, ({ eventIssuer }) => {
            data.issuer = eventIssuer;
            
            // Add all effects as a single stack element
            const effect = (effectData: EffectData) => {
                for (const func of effectFunctions) {
                    func(effectData);
                }
                return true;
            };
            addPassiveEffectToStack(game, effect, data, `On event: ${triggerEvent}`);
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offDamage?.();
            offDamage = null;
        });
        return true;
    };
}

// Reduces any damage to a maximum of 1.
export function reduceDamageToOneEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        let offDamage: (() => void) | null = null;
        // Listen for the next damage event on this player
        offDamage = game.emitter.on("on:damage:would-take", ({ eventIssuer, damageArray }) => {
            if (data.issuer !== eventIssuer) return;
            
            // Create the effect that will execute when the stack resolves
            const effect = (effectData: EffectData) => {
                damageArray[0] = Math.min(damageArray[0] ?? 0, 1);
                return true;
            };
            
            // Add to stack instead of executing immediately
            addPassiveEffectToStack(game, effect, data, "Reduce damage to 1");
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offDamage?.();
            offDamage = null;
        });
        return true;
    };
}

// REPLACEMENT EFFECT: Starts with "this enters play" - does not use the stack.
// Card text: "This enters play deactivated."
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
            const guess = data.next as number;
            if(guess < 1 || guess > 6) {
                throw new Error("lootOnNextRollEffect target must be a number between 1 and 6.");
            }
            if(diceRoll.value === guess) {
                // Create the effect that will execute when the stack resolves
                const effect = (effectData: EffectData) => {
                    if (!(effectData.issuer instanceof Player)) return false;
                    game.loot(effectData.issuer, 3);
                    return true;
                };
                
                // Add to stack instead of executing immediately
                addPassiveEffectToStack(game, effect, data, "Loot 3 from correct roll");
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
        const temp: TemporaryEffect = getTemporaryEffect(data, `Temporary stats modifier.`);
        data.issuer.addTemporaryEffect(temp);

        // Listen for the next loot event on this player
        offLoot = game.emitter.on("on:loot:played", ({ eventIssuer, card, targets }) => {
            card = card as LootCard;
            if (data.issuer !== eventIssuer) return;
            if( card.trinket || card.ambush) return;
            
            // Create the effect that will execute when the stack resolves
            const effect = async (effectData: EffectData) => {
                if (!(effectData.issuer instanceof Player)) return false;
                const newTargets = await TargetBuilder.buildTargetsOnResolve(game, eventIssuer, card);
                const lootCardEffect = new LootCardEffect(eventIssuer, card, newTargets);
                game.addToStack(lootCardEffect);
                return true;
            };
            // const effect = async (effectData: EffectData) => {
            //     if (!(effectData.issuer instanceof Player)) return false;
            //     let newTargets = { selected: [] as Card[] };
            //     if(card.getTargetSelectors!(effectData.issuer, game).length > 0)
            //         newTargets = await game.select(effectData.issuer, 1, card.getTargetSelectors!(effectData.issuer, game), false);
            //     const resolveFunction = card.onPlay(eventIssuer, newTargets.selected);
            //     const lootCardEffect = new LootCardEffect(card, resolveFunction);
            //     game.addToStack(lootCardEffect);
            //     return true;
            // };
            
            // Add to stack instead of executing immediately
            addPassiveEffectToStack(game, effect, data, "Copy loot card effect");
            data.issuer.removeTemporaryEffect(temp);
            offLoot?.();
            offLoot = null;
            offTurn?.();
            offTurn = null;
        });
        
        offTurn = game.emitter.on("on:turn:end", () => {
            data.issuer.removeTemporaryEffect(temp);
            offLoot?.();
            offLoot = null;
            offTurn?.();
            offTurn = null;
        });
        return true;
    };
}


// REPLACEMENT EFFECT: Uses "instead" - does not use the stack.
export function replaceDeathPenaltyEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        // Listen for the next death penalty event on this player
        if (!(data.issuer instanceof Player)) return false;
        let OriginalDeathPenalty = game.deathPenalty.bind(game);

        game.deathPenalty = async (player: Player) => {
            if (data.issuer === player) {
                await OriginalDeathPenalty(player);
                return;
            }

            const lostCoins = game.loseCoins(player, game.gameParameters.deathPenaltyCoins.value, true);
            game.gainCoins(data.issuer as Player, lostCoins);
            const setOfLosableItems = (player.inPlay).filter((c) => (c instanceof treasureCard || (c instanceof LootCard && c.trinket))
            && c.eternal === false)
            if (game.gameParameters.deathPenaltyItem.value > 0) {
            const itemToLose = (await game.select(
                data.issuer as Player,
                game.gameParameters.deathPenaltyItem.value,
                setOfLosableItems,
                false,
                game.gameParameters.deathPenaltyItem.value > 1 ? "Select items " + player.id + " will lose." : "Select an item " + player.id + " will lose."
            )).selected[0];
            if (itemToLose) {
                game.removeInPlay(player, itemToLose);
                game.decks[itemToLose.type]!.addDiscardTop(itemToLose);
            }
            }
            if(game.gameParameters.deathPenaltyLoot.value > 0) {
                const lootToLose = (await game.select(player, game.gameParameters.deathPenaltyLoot.value, player.hand.cards, false,
                     game.gameParameters.deathPenaltyLoot.value > 1 ? "Select loot cards " + player.id + " will lose." : "Select a loot card " + player.id + " will lose.")).selected[0];
                if (lootToLose) {
                    const card = game.getCardFromHand(player, lootToLose);
                    game.addCardToHand(data.issuer as Player, lootToLose);
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
// HYBRID EFFECT: Can be either a replacement effect or triggered effect depending on useStack parameter.
// Modifies stats based on a condition (e.g., "while you have 0¢").
export function ConditionalStatModifierEffect(
    adders: ((player: Player, value: number) => void)[],
    amount: number,
    condition: (player: Player) => boolean,
    triggerEvents: TriggerEvent[],
    game: Game,
    useStack: boolean = true
): EffectFunction {
    return (data: EffectData) => {
        if (!(data.issuer instanceof Player)) return false;
        let offEvents: (() => void)[] = [];
        
        let currentlyActive = false;
        const applyModifierIfConditionMet = (player: Player) => {
            const shouldBeActive = condition(player);
            
            if (shouldBeActive && !currentlyActive) {
                if (useStack) {
                    // Create the effect that will execute when the stack resolves
                    const effect = (effectData: EffectData) => {
                        for (const adder of adders)
                            adder(player, amount);
                        currentlyActive = true;
                        return true;
                    };
                    addPassiveEffectToStack(game, effect, data, "Apply conditional stat modifier");
                } else {
                    for (const adder of adders)
                        adder(player, amount);
                    currentlyActive = true;
                }
            } else if (!shouldBeActive && currentlyActive) {
                if (useStack) {
                    // Create the effect that will execute when the stack resolves
                    const effect = (effectData: EffectData) => {
                        for (const adder of adders)
                            adder(player, -amount);
                        currentlyActive = false;
                        return true;
                    };
                    addPassiveEffectToStack(game, effect, data, "Remove conditional stat modifier");
                } else {
                    for (const adder of adders)
                        adder(player, -amount);
                    currentlyActive = false;
                }
            }
        };
        // Initial check
        applyModifierIfConditionMet(data.issuer);
        // Listen for the trigger events
        for (const triggerEvent of triggerEvents) {
            const offEvent = game.emitter.on(triggerEvent, ({ eventIssuer }) => {
                if (data.issuer !== eventIssuer) return;
                applyModifierIfConditionMet(data.issuer as Player);
            });
            offEvents.push(offEvent);
        }

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            // Remove modifier if still active
            if (currentlyActive) {
                for (const adder of adders)
                    adder(data.issuer as Player, -amount);
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

// REPLACEMENT EFFECT: Uses "prevent" - does not use the stack.
// Card text: "Prevent the next X damage you would take this turn. When you prevent damage this way, deal Y damage to another player."
// Note: The prevention is a replacement effect, but the damage dealt afterward is a triggered effect.
export function preventDamageAndDealDmgOnPreventEffect(prevent: number, deal: number, game: Game): EffectFunction {
    return (data: EffectData) => {
        let offDamage: (() => void) | null = null;
        let offTurn: (() => void) | null = null;
        const temp: TemporaryEffect = getTemporaryEffect(data, `Temporary stats modifier.`);
        data.issuer.addTemporaryEffect(temp);

        const cleanup = () => {
            data.issuer.removeTemporaryEffect(temp);
            offDamage?.();
            offTurn?.();
            offDamage = null;
            offTurn = null;
        };

        // Listen for the next damage event on this player
        offDamage = game.emitter.on("on:damage:would-take", async ({ eventIssuer, damageArray }) => {
            const target = data.issuer;
            if (target !== eventIssuer) return;
            const current = damageArray[0] ?? 0;
            if( current <= 0) return;
            if (!(data.issuer instanceof Player)) return false;
            damageArray[0] = Math.max(0, current - prevent);

            // Deal 1 damage to another player
            const otherPlayers = game.players.filter(p => p !== data.issuer);
            if (otherPlayers.length === 0) return;
            const selection = await game.select(data.issuer, 1, otherPlayers, false, "Select a player to deal damage to.");
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
                // Create the effect that will execute when the stack resolves
                const effect = async (effectData: EffectData) => {
                    if (!(effectData.issuer instanceof Player)) return false;
                    const value = (await game.select(effectData.issuer, 1, [6], true, "Select a value to change the roll to.")).selected[0]!;
                    diceRoll.value = value;
                    return true;
                };
                
                // Add to stack instead of executing immediately
                addPassiveEffectToStack(game, effect, data, "Change roll 1 to 6");
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
            if (!(data.issuer instanceof Player)) return;
            
            // Create the effect that will execute when the stack resolves
            const effect = async (effectData: EffectData) => {
                if (!(effectData.issuer instanceof Player)) return false;
                const otherPlayers = game.players.filter(p => p !== effectData.issuer);
                if (otherPlayers.length === 0) return true;
                const selection = await game.select(effectData.issuer, 1, otherPlayers, false, "Select a player to give the item to.");
                if (selection.selected.length > 0) {
                    const chosenPlayer = selection.selected[0]!;
                    game.give(effectData.issuer, chosenPlayer, effectData.it);
                    effectData.issuer = chosenPlayer;
                }
                return true;
            };
            
            // Add to stack instead of executing immediately
            addPassiveEffectToStack(game, effect, data, "Give item to another player on death");
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
            
            // Create the effect that will execute when the stack resolves
            const effect = (effectData: EffectData) => {
                for (const func of functions)
                    func(effectData);
                return true;
            };
            
            // Add to stack instead of executing immediately
            addPassiveEffectToStack(game, effect, data, "On first damage each turn effect");
        });
        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offDamage?.();
            offDamage = null;
        });
        return true;
    };
}


// REPLACEMENT EFFECT: Uses "instead" - does not use the stack.
// Card text: "If this would be destroyed, it becomes a soul instead."
export function becomeSoulInsteadOfDestructionEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        let offDestroy: (() => void) | null = null;
        // Listen for the next damage event on this player
        offDestroy = game.emitter.on("on:item:destroyed", ({ eventIssuer, cards }) => {
            if (!(data.issuer instanceof Player)) return;
            if (!cards.includes(data.it)) return;
            data.it.soul = 1;
            const index = cards.indexOf(data.it);
            if (index > -1) {
                cards.splice(index, 1);
            }

            game.addSoul(data.issuer, data.it);
            game.removeInPlay(data.issuer, data.it);
        });
        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offDestroy?.();
            offDestroy = null;
        });
        return true;
    };
}

// REPLACEMENT EFFECT: Modifies purchase cost - does not use the stack.
// Reduces the cost of shop items.
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
        offDeath = game.emitter.on("on:death:before-penalty", ({ eventIssuer, target: from, source, damage: dmg }) => {
            if (eventIssuer instanceof Player) {
                // Create the effect that will execute when the stack resolves
                const effect = (effectData: EffectData) => {
                    game.loot(effectData.issuer as Player, amount);
                    return true;
                };
                
                // Add to stack instead of executing immediately
                addPassiveEffectToStack(game, effect, data, `Loot ${amount} on player death`);
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
// REPLACEMENT EFFECT: Uses "if you would" and "instead" - does not use the stack.
// Card text: "If you would gain any number of ¢, gain that much +X¢ instead."
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
            if (rollValues.includes((dice as DiceRoll).value)) {
                // Create the effect that will execute when the stack resolves
                const stackEffect = (effectData: EffectData) => {
                    effect(effectData);
                    return true;
                };
                
                // Add to stack instead of executing immediately
                addPassiveEffectToStack(game, stackEffect, data, "On attack roll effect");
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

// Each time the attacking player rolls an attack roll of X
export function onAttackingPlayerRollEffect(
    rollValues: number[],
    effect: EffectFunction,
    game: Game,
    diceIssuerIssueTheEvent: boolean = false
): EffectFunction {
    return (data: EffectData) => {
        let offEffect: (() => void) | null = null;
        
        offEffect = game.emitter.on("on:dice:rolled", ({ diceRoll }) => {
            const dice = diceRoll as DiceRoll;
            if( !dice.issuer.engageInCombat || !dice.attackRoll)
                return;
            // Only trigger for attack rolls with specified values
            if (rollValues.includes((dice as DiceRoll).value)) {
                // Create the effect that will execute when the stack resolves
                let copyData = data;
                if(diceIssuerIssueTheEvent && dice.issuer !== undefined)
                    copyData.issuer = dice.issuer;
                const stackEffect = (effectData: EffectData) => {
                    effect(effectData);
                    return true;
                };
                
                // Add to stack instead of executing immediately
                addPassiveEffectToStack(game, stackEffect, copyData, "On attacking player attack roll effect");
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
            
            data.addTarget({ diceThatWouldRoll: diceRoll});
            
            // Create the effect that will execute when the stack resolves
            const effect = (effectData: EffectData) => {
                for (const func of effectFunctions)
                    func(effectData);
                return true;
            };
            
            // Add to stack instead of executing immediately
            addPassiveEffectToStack(game, effect, data, "On would roll effect");
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offDamage?.();
            offDamage = null;
        });
        return true;
    };
}

export function onRollEffect(
    rollValues: number[],
    effect: EffectFunction,
    game: Game,
    diceIssuerIssueTheEvent: boolean = false
): EffectFunction {
    return (data: EffectData) => {
        let offEffect: (() => void) | null = null;
        // Listen for the next damage event on this player
        offEffect = game.emitter.on("on:dice:rolled", ({ diceRoll }) => {
            // For monsters, only trigger if the monster is currently engaged in combat
            // if (data.issuer instanceof Monster && !data.issuer.isEngagedInCombat) {
            //     return;
            // }
            
            if (rollValues.includes((diceRoll as DiceRoll).value))
            {
                data.targets = [diceRoll._issuer];
                
                // Create the effect that will execute when the stack resolves
                const stackEffect = (effectData: EffectData) => {
                    effect(effectData);
                    return true;
                };
                
                if (diceIssuerIssueTheEvent && diceRoll._issuer !== undefined) {
                    data.issuer = diceRoll._issuer;
                    data.targets = [];
                }
                // Add to stack instead of executing immediately
                addPassiveEffectToStack(game, stackEffect, data, "On roll effect");
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

// When the active player rolls a specific value
export function onActivePlayerRollEffect(
    rollValues: number[],
    effect: EffectFunction,
    game: Game
): EffectFunction {
    return (data: EffectData) => {
        let offEffect: (() => void) | null = null;
        
        offEffect = game.emitter.on("on:dice:rolled", ({ diceRoll }) => {
            // Only trigger if the roll issuer is the active player
            if (diceRoll._issuer !== game.currentPlayer) {
                return;
            }
            
            if (rollValues.includes((diceRoll as DiceRoll).value)) {
                // Create the effect that will execute when the stack resolves
                const stackEffect = (effectData: EffectData) => {
                    effect(effectData);
                    return true;
                };
                
                // Add to stack instead of executing immediately
                addPassiveEffectToStack(game, stackEffect, data, "On active player roll effect");
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

// REPLACEMENT EFFECT: Uses "this enters play" - does not use the stack.
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

// REPLACEMENT EFFECT: Uses "prevent" - does not use the stack.
// Card text: "If you would take damage while this has counters on it, remove that many counters and prevent that much damage."
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

// REPLACEMENT EFFECT: Uses "if you would" and "instead" - does not use the stack.
// Card text: "If you would take any amount of damage, take that much damage +X instead."
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

// REPLACEMENT EFFECT: Uses "if you would" and "instead" - does not use the stack.
// Card text: "If you would loot any number of loot cards, loot double that number instead."
export function lootDoubleThisTurnEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        let offEffect: (() => void) | null = null;
        let offEndTurn: (() => void) | null = null;
        const temp: TemporaryEffect = getTemporaryEffect(data, `Temporary stats modifier.`);
        data.issuer.addTemporaryEffect(temp);
        // Listen for the next damage event on this player
        offEffect = game.emitter.on("on:loot:would", ({ eventIssuer, numberOfCards }) => {
            const target = data.next;
            if (target !== eventIssuer) return;
            numberOfCards[0]! *= 2;
        });

        offEndTurn = game.emitter.on("on:turn:end", ({ eventIssuer }) => {
            data.issuer.removeTemporaryEffect(temp);
            offEffect?.();
            offEffect = null;
            offEndTurn?.();
            offEndTurn = null;
        });

        // Store cleanup function on the card for when it's removed/destroyed

        return true;
    };
}

// REPLACEMENT EFFECT: Uses "instead" - does not use the stack.
// Card text: "The next time a player would loot, they loot from the top of the loot discard instead."
// Replaces the source deck for looting.
export function lootFromDiscardEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        let offEffect: (() => void) | null = null;
        // Listen for the next damage event on this player
        offEffect = game.emitter.on("on:loot:would", ({ eventIssuer, numberOfCards }) => {
            const target = data.next;
            if (target !== eventIssuer) return;
            while(numberOfCards[0]! > 0)
            {
                const card = 
                    game.decks["loot"]!.drawTopDiscard();
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

// REPLACEMENT EFFECT: Uses "if you would" and "instead" - does not use the stack.
// Card text: "If you would gain any amount of ¢, this levels up by that much instead."
export function gainCoinsLevelUpEffect(
    game: Game
): EffectFunction {
    return (data: EffectData) => {
        let offEffect: (() => void) | null = null;

        const cleanup = () => {
            offEffect?.();
            offEffect = null;
        };
        data.it.tags.levels = data.it.tags.levels ?? 0; // At least level 0.

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
// REPLACEMENT EFFECT: Uses "prevent" - does not use the stack.
// Card text: "Each time you would take damage, roll- X: prevent Y of that damage."
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
            if (!(data.issuer instanceof Player)) return;
            const roll:DiceRoll = game.rollDice(data.issuer, false, data.it);
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

// Starts with if: replacement effect.
export function goFirstInTurnOrderEffect(game: Game): EffectFunction {
    return (data:EffectData) => {
        let offEffect: (() => void) | null = game.emitter.on("on:game:start:before", () => {
            if (!(data.issuer instanceof Player)) return;
            game.turnHandler.setFirstPlayer(data.issuer);
            offEffect?.();
            offEffect = null;
        });
        return true;
    };
}

export function startingItemEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        let offEffect: (() => void) | null = game.emitter.on("on:game:start:before", async () => {
            if (!(data.issuer instanceof Player)) return;
            const options: treasureCard[] = game.decks["treasure"]!.drawSeveral(3) as treasureCard[];
            const selection = await game.select( data.issuer, 1, options, false, "Select a starting eternal treasure.");
            selection.selected[0]?.setEternal(true);
            game.addInPlay(data.issuer, selection.selected[0]!); 
            offEffect?.();
            offEffect = null;
        });
        return true;
    };
}