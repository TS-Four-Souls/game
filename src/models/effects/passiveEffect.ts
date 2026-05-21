import { Player } from "../entities/player";
import { DiceRoll } from "../stackElement";
import { LootCard, ItemCard, TreasureCard, LootCardEffect, EffectOnStack, MonsterCard, Card, Effect } from "../cards";
import { EffectData, type EffectFunction, type TargetsSelector } from "../types/cardTypes";
import { Game } from "../game";
import { type TriggerEvent } from '@/models/types/eventTypes';
import { Monster } from "../entities/monster";
import { TargetBuilder } from "../targetBuilder";
import * as active from "./activeEffect";
import type { TemporaryEffect } from "@/shared/api";
import type {
    OnDamageWouldTakeData,
    OnTurnEndData,
    OnTurnStartData,
    OnCoinGainedData,
    OnDeathAfterPenaltyData,
    OnDeathBeforePenaltyData,
    OnDeathMonsterData,
    OnAttackRollData,
    OnDamageTakenData,
    OnDiceBeingRolledData,
    OnDiceWouldRollData,
    OnLootPlayedData,
    OnItemDestroyedData,
    OnLootStepData,
    OnLootWouldData,
    OnDeathPenaltyData,
    OnDeathAnimatedData,
    OnCardFlippedData
} from "../types/eventTypes";
import { Entity } from "../entities/entity";
import { selectPlayerOrMonster, type ParsedEffect } from "./effectParser";
function getTemporaryEffect(data: EffectData, description: string): TemporaryEffect {
    return{
            card: data.it.jsonAPI,
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
): number {
    const effectOnStack = new EffectOnStack(effectFunction, data, description);
    game.addAnimation({
        id: game.nextAnimationId,
        type: "activateInPlay",
        card: data.it.jsonAPI,
    });
    return game.addToStack(effectOnStack);
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
        offDamage = game.emitter.on("on:damage:would-take", (eventData: OnDamageWouldTakeData) => {
            const { eventIssuer, damageArray } = eventData;
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
    adders: ((entity: Entity, value: number) => void)[],
    amount: number,
    game: Game,
    targetType: "current" | "next" | "issuer" | "selectionOnResolve"
): EffectFunction {
    return async (data:EffectData) => {
        let target = null;
        switch(targetType)
        {
            case "current":
                target = game.currentPlayer;
                break;
            case "next":
                target = data.next;
                if(target instanceof DiceRoll)
                    target = target.issuer;

                break;
            case "issuer":
                target = data.issuer;
                break;
            case "selectionOnResolve":
                if(data.issuer instanceof Player === false)
                    throw new Error("selectionOnResolve targetType can only be used when issuer is a Player.");
                target = (await data.selectAndRecord(game, data.issuer, 1, 1, data.targets, "Select the target for this effect.", true, true)).selected[0];
                break;
            default:
                throw new Error(`Invalid targetType ${targetType} for temporaryStatModifierEffect.`);
        }
        // let next = data.peek();
        // // Apply the stat modification
        // if (next && next instanceof DiceRoll)
        //     next = next.issuer;
        // const target = targetIsCurrentPlayer 
        //     ? game.currentPlayer 
        //     : (data.targets.length > 0 && next instanceof Player) 
        //         ? next 
        //         : data.issuer;
        if(!target || !(target instanceof Entity))
            throw new Error("temporaryStatModifierEffect target must be an entity.");
        const temp: TemporaryEffect = getTemporaryEffect(data, `Temporary stats modifier.`);
        target.addTemporaryEffect(temp);

        for(const adder of adders)
            adder(target, amount);
        
        // Register cleanup to reverse at end of turn
        let offTurn = game.emitter.on("till:turn:end", () => {
            for(const adder of adders)
                adder(target, -amount);
            target.removeTemporaryEffect(temp);
            offTurn();
        });
        
        return true;
    };
}
/**
 * Set coin gain to 0, but add it as a target for other effects to reference.
 * @param effectFunctions 
 * @param game 
 * @param description 
 * @returns 
 */
export function interceptFirstGainCoinYourTurnEffect(effectFunctions: EffectFunction[],
    game: Game, description: string): EffectFunction {
    return (data: EffectData) => {
        let offDamage: (() => void) | null = null;
        let offTurn: (() => void) | null = null;

        let active = true;
        offDamage = game.emitter.on("on:coin:gained", ({ eventIssuer, coinGained }) => {
            if (data.issuer !== eventIssuer) return;
            if(!active) return;
            if(coinGained[0]! <= 0) return;
            active = false;
            const newData: EffectData = new EffectData(data.it, data.issuerProvider, [[coinGained[0]]]);
            // Add all effects as a single stack element
            const effect = async (effectData: EffectData) => {
                for (const func of effectFunctions) {
                    await func(effectData);
                }
                active = false;
                return true;
            };
            coinGained[0] = 0;
            addPassiveEffectToStack(game, effect, newData, description);
        });

        offTurn = game.emitter.on("on:turn:start", ({ eventIssuer }) => {
            if (data.issuer !== eventIssuer) return;
            active = true;
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offDamage?.();
            offTurn?.();
            offDamage = null;
            offTurn = null;
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
        let offTurn = game.emitter.on("on:coin:gained:after", async (eventData: OnCoinGainedData) => {
            const { eventIssuer } = eventData;
            if (data.issuer !== eventIssuer) return;
            if (data.it.tags.levels === undefined || data.it.tags.levels < lvl) return;

            for (const func of functions)
                await func(data);
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

export function rollAndMayChangeNextRollForThis(game: Game): ParsedEffect {
    return {
        effectFunction:(data: EffectData) => {
            if(!(data.issuer instanceof Player))
                throw new Error("rollAndMayChangeNextRollForThis issuer should be a player.");
            let offEndTurn: (() => void) | null = null;
            let offRoll: (() => void) | null = null;

            const savedRoll = game.rollDice(data.issuer, false, data.it);
            offRoll = game.emitter.on("on:dice:being-rolled", async ({ diceRoll }) => {
                const effect:EffectFunction = async (effectData: EffectData) => {
                    if(!(data.issuer instanceof Player))
                        throw new Error("rollAndMayChangeNextRollForThis issuer should be a player.");
                    if (diceRoll.issuer !== data.issuer) return false;
                    if( savedRoll === diceRoll) return false;
                    if(savedRoll.value !== diceRoll.value)
                    {
                        const newValue = (await data.selectAndRecord(game, data.issuer, 1, 1, [diceRoll.value, savedRoll.value], "Choose the value of this dice roll.", true, true)).selected[0]!;
                        diceRoll.value = newValue;
                    }
                    return true;
                }
                addPassiveEffectToStack(game, effect, data, "Select the result of this dice roll.");
                offRoll!();
                offEndTurn!();
            });

            offEndTurn = game.emitter.on("on:turn:end", async ({ eventIssuer }) => {
                offRoll!();
                offEndTurn!();
            });
            return true;
        }, targetSelectors: []
    };
}

export function combatDamageModifierOnAttackRollEffect(game: Game, attackRolls: number[], modifier: number) {
    return (data: EffectData) => {
        let offDamage: (() => void) | null = null;

        offDamage = game.emitter.on("on:attack:roll", (eventData: OnAttackRollData) => {
            const { eventIssuer, dice, damageDealt } = eventData;
            if (eventIssuer !== data.issuer) return;
            if (!attackRolls.includes(dice.value)) return;
            damageDealt[0]! += modifier;
        });

        data.it.cleaners.push(() => {
            offDamage?.();
        });
        return true;
    };
}

export function endTurnOnAttackRollOneEffect(game: Game) {
    return (data: EffectData) => {
        let offDamage: (() => void) | null = null;

        offDamage = game.emitter.on("on:attack:roll", (eventData: OnAttackRollData) => {
            const { eventIssuer, dice, damageDealt } = eventData;
            if (eventIssuer !== data.issuer) return;
            if (dice.value !== 1) return;
            addPassiveEffectToStack(game, active.endTurnAndResetStackEffect(game), data, "End your turn on attack roll of 1.");
        });

        data.it.cleaners.push(() => {
            offDamage?.();
        });
        return true;
    };
}

export function chooseMonsterWhenAnotherPlayerAttacksMonsterEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        let offAttack: (() => void) | null = null;
        offAttack = game.emitter.on("on:attack:declared:monster", async ({ eventIssuer, monster }) => {
            if (eventIssuer === data.issuer) return;
            const effect: EffectFunction = async (effectData: EffectData) => {
                const monsters = game.encounters.monsters.filter(m => game.actions.canDeclareAttackOnEntity(eventIssuer, m, false));
                if(monsters.length === 0) return false;
                if(!data.issuer || !(data.issuer instanceof Player))
                    throw new Error("chooseMonsterWhenAnotherPlayerAttacksMonsterEffect issuer should be a player.");
                const selected = (await data.selectAndRecord(game, data.issuer, 0, 1, monsters, "Select a monster to be attacked.", true, true)).selected;
                if(selected.length === 0) return false;
                const newMonster = selected[0]!;
                monster[0] = newMonster;
                return true;
            }             
            addPassiveEffectToStack(game, effect, data, `Choose which monster ${eventIssuer.id} attacks.`);
        });
        return true;
    };
}


export function roll4Choose1Effect(game: Game) {
    return (data: EffectData) => {
        let offRoll: (() => void) | null = null;
        offRoll = game.emitter.on("on:dice:being-rolled", async ({ eventIssuer, diceRoll }) => {
            const effect:EffectFunction = async (effectData: EffectData) => {
                const values = [diceRoll.value];
                for(let i = 0; i < 3; i++)
                    values.push(eventIssuer.rollDice(game.random, diceRoll.attackRoll, diceRoll.card).value);
                if(!(data.issuer instanceof Player))
                    throw new Error("roll4Choose1Effect issuer should be a player.");
                const newValue = (await data.selectAndRecord(game, data.issuer, 1, 1, values, "Choose the result of this dice roll.", true, true)).selected[0]!;
                diceRoll.value = newValue;
                return true;
            }

            addPassiveEffectToStack(game, effect, data, "Select the result of the next dice roll among four results.");
            offRoll?.();
            offRoll = null;
        });
        data.it.cleaners.push(() => {
            offRoll?.();
            offRoll = null;
        });
        return true;
    };
}

// REPLACEMENT EFFECT: Continuous priority modification - does not use the stack.
export function noPriorityPassesOnYourTurnEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        const issuer = data.issuer;
        if(!(issuer instanceof Player))
            throw new Error("noPriorityPassesOnYourTurnEffect can only be applied to Players.");

        // Apply immediately if this effect starts during issuer's turn.
        if (game.currentPlayer === issuer) {
            game.applyLootOrActivateRestrictionForCurrentTurn(issuer);
        }

        let offStartTurn = game.emitter.on("on:turn:start", ({ eventIssuer }) => {
            if (eventIssuer !== issuer) return;
            game.applyLootOrActivateRestrictionForCurrentTurn(issuer);
        });
        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            if(game.currentPlayer === issuer)
                game.applyLootOrActivateRestrictionForCurrentTurn(issuer, -1);
            offStartTurn();
        });
        return true;
    };
}

// REPLACEMENT EFFECT: Continuous priority modification - does not use the stack.
export function noPriorityPassesTillEndOfTurnEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        let offEndTurn: (() => void) | null = null;
        const issuer = data.issuer;
        if(!(issuer instanceof Player))
            throw new Error("noPriorityPassesTillEndOfTurnEffect can only be applied to Players.");

        game.applyLootOrActivateRestrictionForCurrentTurn(issuer);
        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            game.applyLootOrActivateRestrictionForCurrentTurn(issuer, -1);
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
        offDamage = game.emitter.on("on:damage:would-take", (eventData: OnDamageWouldTakeData) => {
            const { eventIssuer, damageArray } = eventData;
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
        let active = false;
        if(game.currentPlayer === data.issuer) {
            // Apply the stat modification
            const target = data.targets.length > 0 ? data.peek() : data.issuer;
            active = true;
            for (const adder of adders)
                adder(target, amount);
        }

        let offTurn = game.emitter.on("on:turn:start", (eventData: OnTurnStartData) => {
            const { eventIssuer } = eventData;
            if (eventIssuer !== data.issuer) return;
            const target = data.targets.length > 0 ? data.peek() : data.issuer;
            active = true;
            for (const adder of adders)
                adder(target, amount);
        });
        let offTurnEnd = game.emitter.on("till:turn:end", (eventData: OnTurnEndData) => {
            const { eventIssuer } = eventData;
            if (eventIssuer !== data.issuer) return;
            const target = data.targets.length > 0 ? data.peek() : data.issuer;
            
            if(active)
            {
                active = false;
                for (const adder of adders)
                    adder(target, -amount);
            }
        });

        // Store cleanup function on the card for when it's removed/destroyed

        data.it.cleaners.push(() => { 
            if (game.currentPlayer === data.issuer && active) {
                const target = data.targets.length > 0 ? data.peek() : data.issuer;
                active = false;
                for (const adder of adders)
                    adder(target, -amount);
            }
            offTurn();
            offTurn = () => null;
            offTurnEnd();
            offTurnEnd = () => null;
        });

        return true;
    };
}

export function giveCurseToEffect(restEffectFunction: EffectFunction, game: Game, data: EffectData, giveTo: Player){
    if(!(data.it instanceof MonsterCard))
            throw new Error("Curse effect can only be applied by MonsterCards.");
            
    // Add the curse to their in play area.
    game.addCurse(giveTo, data.it);
    // Apply the rest of the effect.
    restEffectFunction(new EffectData(data.it, () => giveTo, []));
    // Add Listener to remove the curse when the owner dies.
    let offDeath: (() => void) | null = null;
    offDeath = game.emitter.on("on:death:after-penalty", (eventData: OnDeathAfterPenaltyData) => {
        const { eventIssuer } = eventData;
        if (giveTo !== eventIssuer) return;
        if(!(data.it instanceof MonsterCard))
            throw new Error("Curse effect can only be applied by MonsterCards.");
        game.removeCurse(giveTo, data.it);
        game.discard(data.it);
        offDeath?.();
        offDeath = null;
    });
    data.it.cleaners.push(() => {
        offDeath?.();
        offDeath = null;
    });
}

export function curseEffect(restEffectFunction: EffectFunction, game: Game): EffectFunction {
    return (data: EffectData) => {
        if(!(data.issuer instanceof Player))
            throw new Error("Curse effect can only be applied to Players.");

        let offDeath: (() => void) | null = null;
        offDeath = game.emitter.on("on:death:after-penalty", (eventData: OnDeathAfterPenaltyData) => {
            const { eventIssuer } = eventData;
            if (data.issuer !== eventIssuer) return;
            if(!(data.issuer instanceof Player))
                throw new Error("Curse effect can only be applied to Players.");
            if(!(data.it instanceof MonsterCard))
                throw new Error("Curse effect can only be applied by MonsterCards.");
            game.removeCurse(data.issuer, data.it);
            game.discard(data.it);
            offDeath?.();
            offDeath = null;
        });

        data.it.cleaners.push(() => {
            offDeath?.();
            offDeath = null;
        });

        restEffectFunction(new EffectData(data.it, () => data.issuer, []));
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
        const issuer = data.issuer;
        if(!(issuer instanceof Player))
            throw new Error("firstAttackRollDiceModifier can only be applied to Players.");
        let active = issuer.attackRollThisTurn ===  0;
        if(active)
            game.addAttackDiceModifier(issuer, amount);

        let offTurn = game.emitter.on("on:turn:start", (eventData: OnTurnStartData) => {
            const { eventIssuer } = eventData;
            if (eventIssuer !== issuer) return;
            if(active) return;
            game.addAttackDiceModifier(issuer, amount);
            active = true;
        });

        let offTurnEnd = game.emitter.on("on:attack:roll", (eventData: OnAttackRollData) => {
            const { eventIssuer } = eventData;
            if (eventIssuer !== issuer) return;
            if(!active) return
            if(issuer.attackRollThisTurn > 1)
            {
                active = false;
                game.addAttackDiceModifier(issuer, -amount);
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
        offAttack = game.emitter.on("on:attack:roll:first-time-each-turn", (eventData: OnAttackRollData) => {
            const { eventIssuer, target, dice, damageDealt, damageReceived, evasion } = eventData;
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

        offDamage = game.emitter.on("on:damage:taken", (eventData: OnDamageTakenData) => {
            const { eventIssuer, target: dealer, source, damage } = eventData;
            if (data.issuer !== eventIssuer) return;
            const index = data.targets.findIndex((c) => c.damageTaken !== undefined) < 0 
                ? data.targets.length 
                : data.targets.findIndex((c) => c.damageTaken !== undefined);
            data.targets = [];
            data.clearSelectionRecord();
            data.addTarget(damage);
            
            // Add all effects as a single stack element
            const effect = async (effectData: EffectData) => {
                for (const func of effectFunctions) {
                    await func(effectData);
                }
                return true;
            };
            // Should not work if damage is 0 or less
            if(damage != null && damage > 0) 
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

        offDamage = game.emitter.on("on:death:before-penalty", (eventData: OnDeathBeforePenaltyData) => {
            const { eventIssuer, target: dealer, source } = eventData;
            if (data.issuer !== eventIssuer) return;
            
            // Add all effects as a single stack element
            const effect = async (effectData: EffectData) => {
                for (const func of effectFunctions) {
                    await func(effectData);
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


// TRIGGERED EFFECT: Uses the stack.
// Executes effects after death penalty is applied.
export function afterDeathPenaltyEffect(
    // callbacks: ((player: Player, dmg: number) => void)[],
    effectFunctions: EffectFunction[],
    // amount: number,
    game: Game
): EffectFunction {
    return (data: EffectData) => {
        // if (amount < 0)
        //     throw new Error("permanentStatModifierEffect amount must be non-negative.");
        let offDamage: (() => void) | null = null;

        offDamage = game.emitter.on("on:death:after-penalty", (eventData: OnDeathAfterPenaltyData) => {
            const { eventIssuer, target: dealer, source } = eventData;
            if (data.issuer !== eventIssuer) return;
            
            // Add all effects as a single stack element
            const effect = async (effectData: EffectData) => {
                for (const func of effectFunctions) {
                    await func(effectData);
                }
                return true;
            };
            addPassiveEffectToStack(game, effect, data, "After death penalty effect");
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offDamage?.();
            offDamage = null;
        });
        return true;
    };
}

export function chooseNumberDamageOnRollThisTurnEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        let offDamage: (() => void) | null = null;
        let offTurn: (() => void) | null = null;
        const nb = data.next as number;
        if ([1,2,3,4,5,6].includes(nb) === false) {
            throw new Error("chooseNumberDamageOnRollThisTurnEffect: nb must be a number between 1 and 6.");
        }

        offDamage = game.emitter.on("on:dice:resolved", async (eventData: OnDiceBeingRolledData) => {
            const { eventIssuer, diceRoll } = eventData;
            if (diceRoll.value !== nb) return;
            const effect = active.dealDamageToTargetEffect(game, 1, true, selectPlayerOrMonster(game));
            addPassiveEffectToStack(game, effect, data, `Deal 1 damage to a target because a ${nb} was rolled.`);
        });

        offTurn = game.emitter.on("on:turn:end", ({ eventIssuer }) => {
            offDamage?.();
            offDamage = null;
            offTurn?.();
            offTurn = null;
        });
        return true;
    };
}

export function WouldDieYourTurnEffect(
    effectFunctions: EffectFunction[],
    game: Game,
    description: string,
    replacementEffects: boolean = false,
    duringYourTurnOnly: boolean = false
): EffectFunction {
    return (data: EffectData) => {
        let offDeath: (() => void) | null = null;
        
        offDeath = game.emitter.on("on:death:would-death", ({ eventIssuer, target, source, deathOnStack}) => {
            if (data.issuer !== eventIssuer) return;
            if (duringYourTurnOnly && game.currentPlayer !== data.issuer) return;
            // Add all effects as a single stack element
            const effect = async (effectData: EffectData) => {
                if(game.stack.elements.every(e => e !== deathOnStack)) return false; // Only trigger on the first "would death" event in the stack, to avoid infinite loops with replacement effects that prevent death.
                for (const func of effectFunctions) {
                    await func(effectData);
                }
                return true;
            };
            if(replacementEffects)
                effect(data);
            else
                addPassiveEffectToStack(game, effect, data, description);
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offDeath?.();
            offDeath = null;
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
    description: string,
    replacementEffects: boolean = false,
    duringYourTurnOnly: boolean = false,
    condition: (effectData: EffectData, eventData: any) => boolean = () => true,
): EffectFunction {
    return (data: EffectData) => {
        let offDamage: (() => void) | null = null;
        
        offDamage = game.emitter.on(triggerEvent, (eventData) => {
            const eventIssuer = eventData.eventIssuer;
            if (data.issuer !== eventIssuer) return;
            if (duringYourTurnOnly && game.currentPlayer !== data.issuer) return;
            if(!condition(data, eventData)) return;
            // Add all effects as a single stack element
            const effect = async (effectData: EffectData) => {
                for (const func of effectFunctions) {
                    await func(effectData);
                }
                return true;
            };
            if(replacementEffects)
                effect(data);
            else
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

export function onYourKillEffect(
    effectFunctions: EffectFunction[],
    game: Game,
    description: string,
    replacementEffects: boolean = false,
    condition: (effectData: EffectData, eventData: any) => boolean = () => true,
): EffectFunction {
    return (data: EffectData) => {
        let offDamage: (() => void) | null = null;
        
        offDamage = game.emitter.on("on:death:before-penalty", (eventData: OnDeathBeforePenaltyData) => {
            if (data.issuer !== eventData.target) return;
            if(!condition(data, eventData)) return;
            // Add all effects as a single stack element
            const effect = async (effectData: EffectData) => {
                for (const func of effectFunctions) {
                    await func(effectData);
                }
                return true;
            };
            if(replacementEffects)
                effect(data);
            else
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

export function noDeathPenaltyCoinsAndLootEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        let offDeath: (() => void) | null = null;
        
        offDeath = game.emitter.on("on:death:before-penalty", (eventData: OnDeathBeforePenaltyData) => {
            if (data.issuer !== eventData.eventIssuer) return;
            eventData.values.nbCoinsToLose = 0;
            eventData.values.nbLootCardsToLose = 0;
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offDeath?.();
            offDeath = null;
        });
        return true;
    };
}

export function onDamageYouDealtEffect(
    effectFunctions: EffectFunction[],
    game: Game,
    description: string,
    replacementEffects: boolean = false
): EffectFunction {
    return (data: EffectData) => {
        let offDamage: (() => void) | null = null;
        
        offDamage = game.emitter.on("on:damage:taken", (eventData: OnDamageTakenData) => {
            if (data.issuer !== eventData.target) return;
            
            // Add all effects as a single stack element
            const effect = async (effectData: EffectData) => {
                for (const func of effectFunctions) {
                    await func(effectData);
                }
                return true;
            };
            if(replacementEffects)
                effect(data);
            else
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


export function addToYourRollValueEffect(game: Game, values: number[], rollType: "attack" | "non-attack" | "any", youMayEffectHanging: boolean[]): EffectFunction {
    const youMay = youMayEffectHanging[0];
    youMayEffectHanging[0] = false;
    return (data: EffectData) => {
        let offRoll: (() => void) | null = null;
        
        offRoll = game.emitter.on("on:dice:being-rolled", async ({ diceRoll }) => {
            const eventIssuer = diceRoll.issuer;
            if(!(data.issuer instanceof Player)) {
                throw new Error("addToYourRollValueEffect can only be applied to Players.");
            }
            if (data.issuer !== eventIssuer) return;
            if(rollType === "attack" && !diceRoll.attackRoll) return;
            if(rollType === "non-attack" && diceRoll.attackRoll) return;
            
            const effect = async (effectData: EffectData) => {
                if(!(data.issuer instanceof Player)) {
                    throw new Error("addToYourRollValueEffect can only be applied to Players.");
                }
                const selected = (await data.selectAndRecord(game, data.issuer, (youMay ? 0 : 1), 1, values, "Select a value to add to your roll.", true, true)).selected;
                if(selected.length === 0) return false; // Player chose not to select a value
                const toAdd = selected[0]!;
                diceRoll.value += toAdd;
                return true;
            };
            addPassiveEffectToStack(game, effect, data, `You may add or subtract 1 from any of your non-attack rolls.`);
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offRoll?.();
            offRoll = null;
        });
        return true;
    };
}

export function stealCoinOnGainEffect(amount: number, game: Game): EffectFunction {
    return (data: EffectData) => {
        let offCoinGain: (() => void) | null = null;
        
        offCoinGain = game.emitter.on("on:coin:gained:after", ({ eventIssuer, coinGained, source }) => {
            if (data.issuer === eventIssuer) return;
            if(!(data.issuer instanceof Player)) {
                throw new Error("stealCoinOnGainEffect can only be applied to Players.");
            }
            if(source !== "gift" && source.slug === data.it.slug && source.slug) return; // Avoid infinite loops.
            const effect = (effectData: EffectData) => {
                if(!(data.issuer instanceof Player)) {
                    throw new Error("stealCoinOnGainEffect can only be applied to Players.");
                }
                const stealAmount = Math.min(coinGained[0] ?? 0, amount);
                if(stealAmount <= 0) return false;
                game.giveCoins(eventIssuer, data.issuer, stealAmount, data.it);
                return true;
            }
            addPassiveEffectToStack(game, effect, data, `Steal ${amount}¢ from another player when they gain coins.`);
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offCoinGain?.();
            offCoinGain = null;
        });
        return true;
    };
}

export function statModifierBasedOnCountersEffect(game: Game,
    adders: ((entity: Entity, value: number) => void)[],
    countersPerModifier: number, 
    modifier: number): EffectFunction {
    return (data: EffectData) => {
        let offCounterModifier: (() => void) | null = null;
        offCounterModifier = game.emitter.on("on:counter:modified", ({ eventIssuer, card, counterName, previousValue, newValue }) => {
            if(data.issuer !== eventIssuer) return;
            if(card !== data.it) return;
            const toAdd = Math.floor(newValue / countersPerModifier) - Math.floor(previousValue / countersPerModifier);
            if(toAdd === 0) return;
            for (const adder of adders) {
                adder(data.issuer, toAdd * modifier);
            }
        });

        data.it.cleaners.push(() => {
            for (const adder of adders) {
                adder(data.issuer, -Math.floor((data.it.tags.counters ?? 0) / countersPerModifier) * modifier); // Remove all modifiers from this effect.
            }
            offCounterModifier?.();
            offCounterModifier = null;
        });
        return true;
    };
}

export function noRechargeCharaDuringRechargeStepEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        let offBeforeRechargeStep: (() => void) | null = null;
        offBeforeRechargeStep = game.emitter.on("on:turn:start:before:recharge:step", ({ eventIssuer, itemsToRecharge }) => {
            const issuer = data.issuer;
            if (issuer !== eventIssuer) return;
            if(!(issuer instanceof Player)) {
                throw new Error("noRechargeCharaDuringRechargeStepEffect can only be applied to Players.");
            }
            const index = itemsToRecharge.findIndex(item => item === issuer.character);
            if (index >= 0) {
                itemsToRecharge.splice(index, 1); // Remove character from recharge list
            }
        });

        data.it.cleaners.push(() => {
            offBeforeRechargeStep?.();
            offBeforeRechargeStep = null;
        });
        return true;
    };
}

export function rechargeOneDuringRechargeStepEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        let offBeforeRechargeStep: (() => void) | null = null;
        offBeforeRechargeStep = game.emitter.on("on:turn:start:before:recharge:step", ({ eventIssuer, itemsToRecharge }) => {
            const issuer = eventIssuer;
            if (!(issuer instanceof Player)) {
                throw new Error("rechargeOneDuringRechargeStepEffect can only be applied to Players.");
            }
            if (itemsToRecharge.length === 0) return;

            const currentOptions = [...itemsToRecharge];
            const effect = async (effectData: EffectData) => {
                const selected = (await data.selectAndRecord(game, issuer, 1, 1, currentOptions, "Select an item to recharge.", true, true)).selected[0]!;
                if (selected) {
                    itemsToRecharge.splice(0, itemsToRecharge.length, selected);
                }
                return true;
            }
            addPassiveEffectToStack(game, effect, data, `Recharge only one of your items during the recharge step.`);
        });

        data.it.cleaners.push(() => {
            offBeforeRechargeStep?.();
            offBeforeRechargeStep = null;
        });
        return true;
    };
}

/*
TRIGGERED EFFECT: Uses the stack.
Each time triggerEvent triggers, if you are the eventIssuer, call effectFunctions.
*/
export function onAnotherPlayerEventEffect(
    triggerEvent: TriggerEvent,
    effectFunctions: EffectFunction[],
    game: Game,
    description: string
): EffectFunction {
    return (data: EffectData) => {
        let offDamage: (() => void) | null = null;
        
        offDamage = game.emitter.on(triggerEvent, ({ eventIssuer }) => {
            if (data.issuer === eventIssuer) return;
            if(!(eventIssuer instanceof Player)) return;
            
            // Add all effects as a single stack element
            const effect = async (effectData: EffectData) => {
                for (const func of effectFunctions) {
                    await func(effectData);
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
    game: Game,
    description: string
): EffectFunction {
    return (data: EffectData) => {
        let offDamage: (() => void) | null = null;
        
        offDamage = game.emitter.on(triggerEvent, ({ eventIssuer }) => {
            if (eventIssuer) {
                data.issuerProvider = () => eventIssuer;
            }
            
            // Add all effects as a single stack element
            const effect = async (effectData: EffectData) => {
                for (const func of effectFunctions) {
                    await func(effectData);
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

// Reduces any damage to a maximum of 1.
export function reduceDamageToOneEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        let offDamage: (() => void) | null = null;
        // Listen for the next damage event on this player
        offDamage = game.emitter.on("on:damage:would-take", (eventData: OnDamageWouldTakeData) => {
            const { eventIssuer, damageArray } = eventData;
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
        offRoll = game.emitter.on("on:dice:resolved", (eventData: OnDiceBeingRolledData) => {
            const { diceRoll } = eventData;
            const guess = data.next;
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

export function gainAbilitiesUntilEffect(game: Game, triggerEvent: TriggerEvent, targetsSelector: TargetsSelector, recharge: boolean): EffectFunction {
    return async (data: EffectData) => {
        const issuer = data.issuer;
        if(issuer instanceof Player === false)
            throw new Error("gainAbilitiesUntilEffect issuer must be a Player.");
        if(data.it.tags.copiedCards === undefined)
            data.it.tags.copiedCards = [];

        const copiedSelector: TargetsSelector = {
            description: "Select a card granted by this effect.",
            selector: (player: Player) => ((data.it.tags.copiedCards as ItemCard[]).filter((c) => c.activeEffectList.length > 0)),
            min: 1,
            max: 1,
        };
        if(!(data.it.hasTapEffect()))
        {
            data.it.addEffect(new Effect("Use a card effect.",
                "active",
                async (effectData: EffectData) => {
                    const card = effectData.next;
                    if(!(card instanceof ItemCard)) {
                        throw new Error("gainAbilitiesUntilEffect target must be an ItemCard.");
                    }
                    if(!(data.it.tags.copiedCards as ItemCard[]).includes(card)) {
                        throw new Error("You can only choose cards granted by this effect.");
                    }
                    const effectsWithValidTargets = card.activeEffectList.filter(e => {
                        if(TargetBuilder.validTargetExists(game, issuer, card, e.index) !== true) return false;
                        return (e.index === "tap" || TargetBuilder.verifyPaiementCanBeMade(game, issuer, card, e.description) === true);
                    });
                    if(effectsWithValidTargets.length === 0)
                        return false;
                    const effectDescriptionId = (await data.selectAndRecord(game, issuer, 1, 1, effectsWithValidTargets.map(e => e.description), "Select an effect to use.", true)).selected[0]!;
                    const effectId = card.activeEffectList.find(e => e.description === effectDescriptionId)?.index;
                    if(effectId === undefined) {
                        throw new Error(`Selected effect "${effectDescriptionId}" not found on the card ${card.name}.`);
                    }
                    const targets = await TargetBuilder.buildTargetsOnResolve(game, issuer, card, effectId);
                    card.recharge();
                    const effectOnStack = await card.tryActivateEffect(targets, effectId);
                    game.addToStack(effectOnStack);
                    return true;
                }
            ,[copiedSelector]
        ));
        }
        let offTrigger: (() => void) | null = null;
        if(targetsSelector.selector(issuer).length === 0)
            return false;
        const target = (await data.selectAndRecord(game, issuer, 1, 1, targetsSelector.selector(issuer), "Select a card to gain its abilities.", true)).selected[0]!;
        if(!target || !(target instanceof ItemCard)) {
            throw new Error("gainAbilitiesUntilEffect target must be a Card.");
        }
        const copied = game.copyCard(target) as ItemCard;
        data.it.tags.copiedCards.push(copied);
        copied.onAddInPlay(() => data.issuer);
        
        if(recharge)
            game.recharge(data.it as ItemCard);

        offTrigger = game.emitter.on(triggerEvent, (eventData: any) => {
            if (data.issuer !== eventData.eventIssuer) return;
            data.it.tags.copiedCards  = (data.it.tags.copiedCards as ItemCard[]).filter((c) => c !== copied && c.activeEffectList.length > 0);
            copied.cleanup();
            offTrigger?.();
            offTrigger = null;
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
        offLoot = game.emitter.on("on:loot:played", (eventData: OnLootPlayedData) => {
            let { eventIssuer, card, targets } = eventData;
            card = card;
            if (data.issuer !== eventIssuer) return;
            if( card.trinket) return;
            
            // Create the effect that will execute when the stack resolves
            const effect = async (effectData: EffectData) => {
                if (!(effectData.issuer instanceof Player)) return false;
                try{
                    const newTargets = await TargetBuilder.buildTargetsOnResolve(game, eventIssuer, card, "tap");
                    const lootCardEffect = new LootCardEffect(eventIssuer, card, newTargets);
                    game.addToStack(lootCardEffect);
                    return true;
                } catch (error) {
                    return false;
                }
            };
            
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
// if another player would pay the death penalty, you choose what item they would destroy and you gain any loot cards and ¢ they would lose.
export function replaceDeathPenaltyEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        let offPenalty: (() => void) | null = null;
        // Listen for the next death penalty event on this player
        const issuer = data.issuer;
        if (!(issuer instanceof Player)) return false;
        let OriginalDeathPenaltyItems = game.deathPenaltyItems.bind(game);
        game.deathPenaltyItems = async (player: Player): Promise<ItemCard[]> => {
            const setOfLosableItems = player.inPlay.filter(
              (c) =>
                (c instanceof TreasureCard || (c instanceof LootCard && c.trinket)) &&
              c.eternal === false
            );
            if (game.gameParameters.deathPenaltyItem.value > 0 && setOfLosableItems.length > 0) {
              const numberOfItemsToLose = Math.min(game.gameParameters.deathPenaltyItem.value, setOfLosableItems.length);
              return (
                await game.select(issuer, numberOfItemsToLose, numberOfItemsToLose, setOfLosableItems, game.gameParameters.deathPenaltyItem.value > 1
                    ? "Select items to destroy."
                    : "Select an item to destroy.", true)
              ).selected;
            }
            return [];
          }

        offPenalty = game.emitter.on("on:death:penalty", (eventData: OnDeathPenaltyData) => {
            const { eventIssuer, coinsLost, itemsLost, lootCardsLost } = eventData;
            if (issuer === eventIssuer) return;
            if(!(eventIssuer instanceof Player))
                return;
            game.gainCoins(issuer, coinsLost, data.it);
            if(lootCardsLost === undefined)
                console.warn("replaceDeathPenaltyEffect: lootCardsLost is undefined. This should not happen.");
            for (const loot of lootCardsLost)
            {
                game.removeCardFromHand(eventIssuer, loot);
                game.addCardToHand(issuer, loot);
            }
            eventData.lootCardsLost = [];
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            game.deathPenaltyItems = OriginalDeathPenaltyItems;
            offPenalty?.();
            offPenalty = null;
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
        let adderStackId: number | null = null;
        const applyModifierIfConditionMet = (player: Player) => {
            const shouldBeActive = condition(player);
            
            if (shouldBeActive && !currentlyActive) {
                if (useStack) {
                    // Create the effect that will execute when the stack resolves
                    const effect = (effectData: EffectData) => {
                        if(currentlyActive === true) return true; // Already applied by another trigger
                        currentlyActive = true;
                        for (const adder of adders)
                            adder(player, amount);
                        return true;
                    };
                    adderStackId = addPassiveEffectToStack(game, effect, data, "Apply conditional stat modifier");
                } else {
                    currentlyActive = true;
                    for (const adder of adders)
                        adder(player, amount);
                }
            } else if (!shouldBeActive && currentlyActive) {
                if (useStack) {
                    // Create the effect that will execute when the stack resolves
                    const effect = (effectData: EffectData) => {
                        if(currentlyActive === false) return true; // Already removed by another trigger
                        currentlyActive = false;
                        const index = game.stack.elements.findIndex(element => element.stackId === adderStackId);
                        if(index !== -1)
                        {
                            game.stack.removeAt(index);
                            adderStackId = null;
                        }
                        else
                        {
                            for (const adder of adders)
                                adder(player, -amount);
                        }
                        return true;
                    };
                    addPassiveEffectToStack(game, effect, data, "Remove conditional stat modifier");
                } else {
                    currentlyActive = false;
                    for (const adder of adders)
                        adder(player, -amount);
                }
            }
        };
        // Initial check
        applyModifierIfConditionMet(data.issuer);
        // Listen for the trigger events
        for (const triggerEvent of triggerEvents) {
            const offEvent = game.emitter.on(triggerEvent, ({ eventIssuer }) => {
                if (data.issuer !== eventIssuer) return;
                if(!(data.issuer instanceof Player)) 
                    throw new Error("ConditionalStatModifierEffect can only be applied to Players.");
                applyModifierIfConditionMet(data.issuer);
            });
            offEvents.push(offEvent);
        }

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            // Remove modifier if still active
            if (currentlyActive) {
                currentlyActive = false; 
                const index = game.stack.elements.findIndex(element => element.stackId === adderStackId);
                if(index !== -1)
                    {
                        game.stack.removeAt(index);
                        adderStackId = null;
                    }
                    else 
                        for (const adder of adders)
                    {
                    if(!(data.issuer instanceof Player)) 
                        throw new Error("ConditionalStatModifierEffect can only be removed from Players.");
                    adder(data.issuer, -amount);
                }
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
            const selection = await data.selectAndRecord(game, data.issuer, 1, 1, otherPlayers, "Select a player to deal damage to.", true, true);
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
        offRoll = game.emitter.on("on:dice:would-roll", ({eventIssuer, diceRoll}: OnDiceWouldRollData) => {
            if (data.issuer !== diceRoll.issuer) return;
            if (diceRoll.value === 1) {
                // Create the effect that will execute when the stack resolves
                const effect = async (effectData: EffectData) => {
                    if (!(effectData.issuer instanceof Player)) return false;
                    const value = (await effectData.selectAndRecord(game, effectData.issuer, 0, 1, [6], "You may select a result to change the roll to.", true, true)).selected[0]!;
                    if(!value) return false; // Player chose not to change the roll
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
        offDeath = game.emitter.on("on:death:before-penalty", (eventData: OnDeathBeforePenaltyData) => {
            const { eventIssuer } = eventData;
            if (data.issuer !== eventIssuer) return;
            if (!(data.issuer instanceof Player)) return;
            
            // Create the effect that will execute when the stack resolves
            const effect = async (effectData: EffectData) => {
                if (!(effectData.issuer instanceof Player)) return false;
                const otherPlayers = game.players.filter(p => p !== effectData.issuer);
                if (otherPlayers.length === 0) return true;
                const selection = await effectData.selectAndRecord(game, effectData.issuer, 1, 1, otherPlayers, "Select a player to give the item to.", true, true);
                if (selection.selected.length > 0) {
                    const chosenPlayer = selection.selected[0]!;
                    game.give(effectData.issuer, chosenPlayer, effectData.it);
                    effectData.issuerProvider = () => chosenPlayer;
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
        offDamage = game.emitter.on("on:damage:taken:first-time-each-turn", (eventData: OnDamageTakenData) => {
            const { eventIssuer, damage: dmg } = eventData;
            if (data.issuer !== eventIssuer) return;
            
            // Create the effect that will execute when the stack resolves
            const effect = async (effectData: EffectData) => {
                for (const func of functions)
                    await func(effectData);
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
        offDestroy = game.emitter.on("on:item:destroyed", (eventData: OnItemDestroyedData) => {
            const { eventIssuer, cards } = eventData;
            if (!(data.issuer instanceof Player)) return;
            if (!cards.includes(data.it)) return;
            data.it.soul = 1;
            const index = cards.indexOf(data.it);
            if (index > -1) {
                cards.splice(index, 1);
            }

            game.addSoul(data.issuer, data.it);
            if(!(data.it instanceof ItemCard))
                throw new Error("becomeSoulInsteadOfDestructionEffect can only be applied to ItemCards.");
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
        const issuer = data.issuer;
        if(!(issuer instanceof Player)) 
            throw new Error("shopItemsCostLessEffect can only be applied to Players.");
        issuer.priceModifier -= discount;
        data.it.cleaners.push(() => {
            issuer.priceModifier += discount;
        });
        return true;
    };
}

export function onMonsterDeathEffect(
    effectFunctions: EffectFunction[],
    game: Game,
    description: string): EffectFunction {
    return (data: EffectData) => {
        let offDamage: (() => void) | null = null;
        
        offDamage = game.emitter.on("on:death:monster", (eventData: OnDeathMonsterData) => {
            const { eventIssuer, target } = eventData;
            if (!(eventIssuer instanceof Monster)) return;
            
            // Add all effects as a single stack element
            const effect = async (effectData: EffectData) => {
                if(description.includes(" the player who killed it "))
                {
                    data.targets = [];
                    data.clearSelectionRecord();
                    effectData.addTarget(target);
                }
                for (const func of effectFunctions) {
                    await func(effectData);
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

export function lootStepEffect(
    effectFunctions: EffectFunction[],
    game: Game,
    anyPlayer: boolean = false
): EffectFunction {
    return (data: EffectData) => {
        let offDamage: (() => void) | null = null;

        offDamage = game.emitter.on("on:loot:step", (eventData: OnLootStepData) => {
            const { eventIssuer } = eventData;
            if (!anyPlayer && data.issuer !== eventIssuer) return;
            if(anyPlayer)
                data.issuerProvider = () => eventIssuer;
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
        offDeath = game.emitter.on("on:death:before-penalty", (eventData: OnDeathBeforePenaltyData) => {
            const { eventIssuer, target: from, source } = eventData;
            if (eventIssuer instanceof Player) {
                // Create the effect that will execute when the stack resolves
                const effect = (effectData: EffectData) => {
                    if (!(effectData.issuer instanceof Player)) 
                        throw new Error("lootOnPlayerDeathEffect can only be applied to Players.");
                    game.loot(effectData.issuer, amount);
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
        offGainCoin = game.emitter.on("on:coin:gained", (eventData: OnCoinGainedData) => {
            const { eventIssuer, coinGained } = eventData;
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

export function lootAfterFlippingEffect(game: Game, amount: number): EffectFunction {
    return (data: EffectData) => {
        let offFlip: (() => void) | null = null;

        offFlip = game.emitter.on("on:card:flipped", (eventData: OnCardFlippedData) => {
            const { eventIssuer, card } = eventData;
            if (data.issuer !== eventIssuer) return;
            if(card !== data.it) return;

            // Create the effect that will execute when the stack resolves
            const effect = (effectData: EffectData) => {
                if (!(effectData.issuer instanceof Player)) return false;
                game.loot(effectData.issuer, amount);
                return true;
            };
            
            // Add to stack instead of executing immediately
            addPassiveEffectToStack(game, effect, data, `Loot ${amount} after flipping`);
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offFlip?.();
            offFlip = null;
        });
        return true;
    };
}

export function flipAndAddAttackEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        let offDeathAnimated: (() => void) | null = null;
        
        offDeathAnimated = game.emitter.on("on:death:animated", (eventData: OnDeathAnimatedData) => {
            if(eventData.eventIssuer.card !== data.it) return;
            const owner = game.getOwner(data.it);
            if(owner === null)
                throw new Error("gainRewardFlipAndAttackAgainEffect can only be applied to cards owned by a player.");
            game.flip(owner, data.it);
            game.addAttackThisTurn(game.currentPlayer);
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
        offEffect = game.emitter.on("on:attack:roll", (eventData: OnAttackRollData) => {
            const { eventIssuer, target, dice, damageDealt, damageReceived, evasion } = eventData;
            if (data.issuer !== eventIssuer) return;
            if (rollValues.includes(dice.value)) {
                // Create the effect that will execute when the stack resolves
                const stackEffect = async (effectData: EffectData) => {
                    return await effect(effectData);
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
        
        offEffect = game.emitter.on("on:dice:resolved", (eventData: OnDiceBeingRolledData) => {
            const { diceRoll } = eventData;
            const dice = diceRoll;
            if( !dice.issuer.engageInCombat || !dice.attackRoll)
                return;
            // Only trigger for attack rolls with specified values
            if (rollValues.includes(dice.value)) {
                // Create the effect that will execute when the stack resolves
                let copyData = data;
                if(diceIssuerIssueTheEvent && dice.issuer !== undefined)
                    copyData.issuerProvider = () => dice.issuer;
                const stackEffect = async (effectData: EffectData) => {
                    return await effect(effectData);
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

        offDamage = game.emitter.on("on:dice:would-roll", ({eventIssuer, diceRoll}: OnDiceWouldRollData) => {
            // if (data.issuer !== eventIssuer) return;
            if (!values.includes(diceRoll.value)) return;
            const newData = new EffectData(data.it, data.issuerProvider, [diceRoll]);
            
            // Create the effect that will execute when the stack resolves
            const effect = async (effectData: EffectData) => {
                for (const func of effectFunctions)
                    await func(effectData);
                return true;
            };
            
            // Add to stack instead of executing immediately
            addPassiveEffectToStack(game, effect, newData, "On would roll effect");
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
        offEffect = game.emitter.on("on:dice:resolved", (eventData: OnDiceBeingRolledData) => {
            const { diceRoll } = eventData;
            // For monsters, only trigger if the monster is currently engaged in combat
            // if (data.issuer instanceof Monster && !data.issuer.isEngagedInCombat) {
            //     return;
            // }
            if (rollValues.includes(diceRoll.value))
            {
                const newData:EffectData =  new EffectData(data.it, data.issuerProvider, [diceRoll]);
                
                // Create the effect that will execute when the stack resolves
                const stackEffect = async (effectData: EffectData) => {
                    return await effect(effectData);
                };
                
                if (diceIssuerIssueTheEvent && diceRoll.issuer !== undefined) {
                    newData.issuerProvider = () => diceRoll.issuer;
                    newData.targets = [];
                }
                // Add to stack instead of executing immediately
                addPassiveEffectToStack(game, stackEffect, newData, "On roll effect");
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
        
        offEffect = game.emitter.on("on:dice:resolved", (eventData: OnDiceBeingRolledData) => {
            const { diceRoll } = eventData;
            // Only trigger if the roll issuer is the active player
            if (diceRoll.issuer !== game.currentPlayer) {
                return;
            }
            
            if (rollValues.includes(diceRoll.value)) {
                // Create the effect that will execute when the stack resolves
                const stackEffect = async (effectData: EffectData) => {
                    return await effect(effectData);
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
            game.addToCounter(data.issuer, data.it, "counters", n);
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
        offEffect = game.emitter.on("on:damage:would-take", (eventData: OnDamageWouldTakeData) => {
            const { eventIssuer, damageArray } = eventData;
            if (data.issuer !== eventIssuer) return;
            const counters = data.it.tags.counters ?? 0;
            if(counters < 0) 
                throw new Error("preventDamageByRemovingCountersEffect: counters cannot be negative.");
            const current = damageArray[0] ?? 0;
            const prevented = Math.min(current, counters);
            damageArray[0] = current - prevented;
            game.addToCounter(data.issuer, data.it, "counters", -prevented);
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

export function eachOtherPlayerRevealsHandEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        for(const player of game.players) {
            if(player !== data.issuer) {
                player.handRevealed = true;
            }
        }
        data.it.cleaners.push(() => {
            for(const player of game.players) {
                if(player !== data.issuer) {
                    player.handRevealed = false;
                }
            }
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
        offDamage = game.emitter.on("on:damage:would-take", (eventData: OnDamageWouldTakeData) => {
            const { eventIssuer, damageArray } = eventData;
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
        offEffect = game.emitter.on("on:loot:would", (eventData: OnLootWouldData) => {
            const { eventIssuer, numberOfCards } = eventData;
            const target = data.next;
            if (target !== eventIssuer) return;
            numberOfCards[0]! *= 2;
        });

        offEndTurn = game.emitter.on("till:turn:end", (eventData: OnTurnEndData) => {
            const { eventIssuer } = eventData;
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
export function killOnDoubleAttackRollEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        let offEffect: (() => void) | null = null;
        let offTurn: (() => void) | null = null;

        let prevRollThisTurn: number | null = null;
        // Listen for the next damage event on this player
        offEffect = game.emitter.on("on:attack:roll", (eventData: OnAttackRollData) => {
            const { eventIssuer, target, dice, damageDealt, damageReceived, evasion } = eventData;
            if(prevRollThisTurn === dice.value)
                game.kill(data.issuer, target, data.it);
            prevRollThisTurn = dice.value;
        });

        offTurn = game.emitter.on("on:turn:end", () => {
            prevRollThisTurn = null;
        });



        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offEffect?.();
            offEffect = null;
        });
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
        offEffect = game.emitter.on("on:loot:would", (eventData: OnLootWouldData) => {
            const { eventIssuer, numberOfCards } = eventData;
            const target = data.next;
            if (target !== eventIssuer) return;
            while(numberOfCards[0]! > 0)
            {
                const card = 
                    game.decks["loot"]!.drawTopDiscard();
                if(card)
                    game.addCardToHand(eventIssuer, card);
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
        offEffect = game.emitter.on("on:coin:gained", (eventData: OnCoinGainedData) => {
            const { eventIssuer, coinGained } = eventData;
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
            if(damageArray[0]! <= 0) return;
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
            const options: TreasureCard[] = game.decks["treasure"]!.drawSeveral(3);
            const selection = await data.selectAndRecord(game, data.issuer, 1, 1, options, "Select a starting eternal treasure.", true, true);
            selection.selected[0]?.setEternal(true);
            game.addInPlay(data.issuer, selection.selected[0]!); 
            offEffect?.();
            offEffect = null;
            await game.resolveCallbacks();
        });
        return true;
    };
}