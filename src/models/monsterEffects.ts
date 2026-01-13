// A monster effect is an effect that is applied by a monster card.


import { DamageOnStack, DiceRoll, Player } from "./player";
import { Card, LootCard, type EffectFunction, type TargetsSelector, ItemCard, MonsterCard, InplayType, BsoulCard, EffectData } from "./cards";
import { Game } from "./game";
import type { Entity } from "./entity";
import { effect } from "zod/v3";
import type { Stack, StackElement } from "./stack";
import { it } from "zod/locales";
import { effectParser, type ParsedEffect } from "./effectParser";
import { deckSelector, visibleItemSelector, inplayUnchargedItemSelector } from "./targetSelector";
// import { firstAttackRollStatModifierEffect, gainCoinsOnDamageEffect, gainPlusCoinsEffect, goFirstInTurnOrderEffect, LookAndPutBottomEffect, lootOnPlayerDeathEffect, preventDamageOnRollEffect, preventNextDamageUpToEffect, rollDiceOnTriggerEffect, startingItemEffect, temporaryStatModifierEffect, gainTreasureOnDeathEffect } from "./abilities";
import *  as passive from "./passiveEffect";
import * as active from "./activeEffect";
import type { BonusSoulCardType } from "@/types/cardTypes";
import { Monster } from "./monster";
import { string } from "zod";
import { addInPlayEffect, obtainRollResults } from "./activeEffect";
import { addPassiveEffectToStack } from "./passiveEffect";

export function thisHealsEffect(game: Game, amount: number): EffectFunction {
    return (data: EffectData) => {
        let target = data.issuer;
        if(!(data.issuer instanceof Monster))
            target = game.monsters.find((m => m.id === data.it.slug))!;
        if(!target)
            throw new Error("thisHealsEffect effect could not find the monster to heal.");
        target.heal(amount);
        return true;
    };
}

export function activePlayerMayAttackMonsterDeckEffect(game: Game): EffectFunction {
    return async (data: EffectData) => {
        const player = game.currentPlayer as Player;
        const attack = await game.select(player, 1,[...game.encounters.visible.keys()], true, "Do you attack the monster deck ?");
        if(attack.selected.length > 0){
            player.attackThisTurn = Math.max(1, player.attackThisTurn);
            game.declareAttack(player);
            game.declareAttackOnMonster(player, "topDeck", attack.selected[0]);
        }
        return true;
    };
}

export function activePlayerMustMakeAdditionalAttackEffect(game: Game): EffectFunction {
    return async (data: EffectData) => {
        const player = game.currentPlayer as Player;
        player.attackThisTurn = Math.max(1, player.attackThisTurn);
        game.declareAttack(player);
        return true;
    };
}

export function activePlayerSelectAndCallEffect(game: Game, effectFunction: EffectFunction, currentPlayerIsTarget: boolean=false): EffectFunction {
    return async (data: EffectData) => {
        const player = game.currentPlayer as Player;
        
        const targetSelection = await game.select(player, 1, game.players, false, "Select a player.");
        const targetPlayer = targetSelection.selected[0] as Player;
        if(!targetPlayer){
            throw new Error("No player selected for activePlayerForcesPlayerToDiscardLootEffect.");
        }
        await effectFunction(new EffectData(data.it, targetPlayer, (currentPlayerIsTarget ? [player] : [])));
        return true;
    };
}

export function activePlayerRollsEffect(game: Game, s: string): EffectFunction {
    s = "roll-" + s.substring(s.indexOf("the active player rolls-")).trim();
    const rollResults = obtainRollResults(s);
    const parsedEffects: ParsedEffect[] = rollResults.map(effectText => effectParser(effectText, game, addInPlayEffect(game), true));
    const effects: EffectFunction[] = parsedEffects.map(p => p.effectFunction);
    return async (data: EffectData) => {
        const player = game.currentPlayer as Player;
        const result = game.rollDice(player, false);
        result.attachEffect(effects, data.it, data.targets);
        return true;
    };
}


export function activePlayerIsTargetedByEffect(game: Game, effectFunction: EffectFunction): EffectFunction {
    return async (data: EffectData) => {
        const player = game.currentPlayer as Player;
        await effectFunction(new EffectData(data.it, data.issuer, [player]));
        return true;
    };
}

export function activePlayerSelectTargetEffect(game: Game, effectFunction: EffectFunction, ts: TargetsSelector): EffectFunction {
    return async (data: EffectData) => {
        const issuer = game.currentPlayer as Player;
        const target = (await game.select(issuer as Player, ts.count, ts.selector(issuer as Player), ts.asMany, ts.description)).selected;
        if(target.length > 0)
            await effectFunction(new EffectData(data.it, issuer, target));
        return true;
    };
}

export function dealDamageToKillerOnDeathEffect(game: Game, damage: number = 1): EffectFunction {
return (data: EffectData) => {
        let offDamage: (() => void) | null = null;
        
        offDamage = game.emitter.on("on:death:monster", ({ eventIssuer, target, ability }) => {
            if (data.issuer !== eventIssuer) return;
            if(!(target instanceof Player)) return;
            
            // Add all effects as a single stack element
            const effect = (effectData: EffectData) => {
                game.dealDamage(eventIssuer as Entity, target as Entity, ability, damage);
                return true;
            };
            addPassiveEffectToStack(game, effect, data, `When ${data.it.name} dies, it deals ${damage} damage to the player who killed it.`);
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offDamage?.();
            offDamage = null;
        });
        return true;
    };
}

export function putInMonsterDeck6FromTopEffect(game: Game): EffectFunction {
    return async (data: EffectData) => {
        const monsterDeck = game.decks["monster"]!;
        monsterDeck.addCardAtPosFromTop(data.it, 6);
        return true
    }
}

export function searchForBloatEffect(game: Game): EffectFunction {
    return async (data: EffectData) => {
        const player = game.currentPlayer as Player;
        const theBloat = game.decks["monster"]!.cards.find(c => c.slug === "b2-the_bloat") as MonsterCard | undefined;
        if(!theBloat)
            return false;
        const selection = (await game.select(player, 1, game.encounters.nonEngagedInCombat, false, "Where do you want to put The Bloat?")).selected[0];
        if(selection === undefined)
            throw new Error("No selection made for searchForBloatEffect.");
        const index:number = game.encounters.visible.indexOf(selection as MonsterCard);
        game.encounters._deck.addTopPosition(theBloat);
        game.encounters.draw(index);
        return true;
    };
}

export function putOnTopOfMonsterDeckOnRollEffect(game: Game, rolls: number[]): EffectFunction {
    return (data: EffectData) => {
        const roll = game.rollDice(game.currentPlayer as Player, false);
        roll.attachEffect([1,2,3,4,5,6].map(n => (data:EffectData) => {
            if(rolls.includes(n)) {
                game.decks["monster"]!.addTopPosition(data.it);
                return true;
            }
            return false;
        }), data.it, []);
        return true;
    };
}

export function killerDiscardsHandOnDeathEffect(game: Game, damage: number = 1): EffectFunction {
return (data: EffectData) => {
        let offDamage: (() => void) | null = null;
        
        offDamage = game.emitter.on("on:death:monster", ({ eventIssuer, target, ability }) => {
            if (data.issuer !== eventIssuer) return;
            if(!(target instanceof Player)) return;
            
            // Add all effects as a single stack element
            const effect = (effectData: EffectData) => {
                const handSize = (target as Player).hand.length;
                for(let i=0; i < handSize; i++)
                {

                    game.discardFromHandAtIndex(target as Player, 1);
                }
                return true;
            };
            addPassiveEffectToStack(game, effect, data, `When ${data.it.name} dies, the player who killed it discards their hand.`);
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offDamage?.();
            offDamage = null;
        });
        return true;
    };
}

export function doubleRewardsOnDeathRollEffect(game: Game, rollValues: number[]): EffectFunction {

    return (data: EffectData) => {
        let offDeath: (() => void) | null = null;
        
        offDeath = game.emitter.on("on:death:monster", ({ eventIssuer, target, source }) => {
            if (data.issuer !== eventIssuer) return;
            if(source instanceof Card) return;
            const roll = source as DiceRoll;
            if(!rollValues.includes(roll.value)) return;
            
            // Add all effects as a single stack element
            const effect = (effectData: EffectData) => {
                game.monsterRewards(data.issuer as Monster);
                return true;
            };
            addPassiveEffectToStack(game, effect, data, `When ${data.it.name} dies, if the killing roll was ${rollValues.join(" or ")}, it grants double rewards.`);
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offDeath?.();
            offDeath = null;
        });
        return true;
    };
}

export function noCombatDamageOnAttackRollEffect(game: Game, rollValues: number[]): EffectFunction {
    return (data: EffectData) => {
        let offDamage: (() => void) | null = null;
        
        offDamage = game.emitter.on("on:damage:would-take", ({ eventIssuer, target, source, damageArray }) => {
            if(!(target instanceof Player)) return;
            if(!(eventIssuer instanceof Monster)) return;
            if(source instanceof Card) return;
            if (data.issuer !== eventIssuer) return;
            const roll = source as DiceRoll;
            if(!rollValues.includes(roll.value)) return;
            // Add all effects as a single stack element
            const effect = (effectData: EffectData) => {
                damageArray[0] = 0; // remove all damage
                return true;
            };
            addPassiveEffectToStack(game, effect, data, `When ${data.it.name} is attacked, if the attack roll is ${rollValues.join(" or ")}, it takes no combat damage.`);
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offDamage?.();
            offDamage = null;
        });
        return true;
    };
}

export function gainAttackOnDamageEffect(game: Game, amount: number): EffectFunction {
    return (data: EffectData) => {
        let offDamage: (() => void) | null = null;
        let offEndTurn: (() => void) | null = null;
        let currentTotal = 0;
        offDamage = game.emitter.on("on:damage:taken", ({ eventIssuer, target, source, damageArray }) => {
            if (data.issuer !== eventIssuer) return;
            // Add all effects as a single stack element
            const effect = (effectData: EffectData) => {
                (eventIssuer as Entity).addAttackPoints(amount);
                currentTotal += amount;
                return true;
            };
            addPassiveEffectToStack(game, effect, data, `Each time ${data.it.name} takes damage, it gains +${amount} [ATK] till end of turn.`);
        });
        
        offEndTurn = game.emitter.on("on:turn:end", ({ eventIssuer }) => {
            (data.issuer as Entity).addAttackPoints(-currentTotal);
            currentTotal = 0;
            return true;
            
        });
        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offDamage?.();
            offDamage = null;
        });
        return true;
    };
}

export function monstersGainDCEffect(game: Game, amount: number, includeSelf: boolean): EffectFunction {
    return (data: EffectData) => {
        game.addDCToEachMonster(data.issuer as Entity, amount);
        if(!includeSelf) {
            (data.issuer as Monster).addEvasion(-amount);
        }
        data.it.cleaners.push(() => {
            game.addDCToEachMonster(data.issuer as Entity, -amount);
            if(!includeSelf) {
            (data.issuer as Monster).addEvasion(amount);
        }
        });
        return true;
    };
}

export function dieWhenAnotherMonsterDiesEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        let offDeath: (() => void) | null = null;
        
        offDeath = game.emitter.on("on:death:monster", ({ eventIssuer, target, source }) => {
            if (data.issuer === eventIssuer) return;
            
            // Add all effects as a single stack element
            const effect = (effectData: EffectData) => {
                game.kill(eventIssuer, data.issuer as Monster, source);
                return true;
            };
            addPassiveEffectToStack(game, effect, data, `When another monster dies, ${data.it.name} dies.`);
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offDeath?.();
            offDeath = null;
        });
        return true;
    };
}

export function cantBeAttackedEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        const monster = data.issuer as Entity;
        monster.attackable = false;
        return true;
    };
}

export function damageAlsoPlayerToTheEffect(game: Game, direction: "left" | "right"): EffectFunction {
    return (data: EffectData) => {
        let offDamage: (() => void) | null = null;
        
        offDamage = game.emitter.on("on:damage:taken", ({ eventIssuer, target, source, damage }) => {
            if (data.issuer !== eventIssuer) return;
            
            // Add all effects as a single stack element
            const effect = (effectData: EffectData) => {
                const player = game.getPlayerToThe(direction);
                console.log(`Applying ${data.it.name} effect: dealing ${damage} to player to the active player's ${direction}: ${player.id}`);
                game.dealDamage(eventIssuer as Entity, player as Entity, source, damage);
                return true;
            };
            console.log(`${data.it.name} effect deals damage also to player to the active player's ${direction}`);
            addPassiveEffectToStack(game, effect, data, `Damage dealt to ${data.it.name} is also dealt to the player to the active player's ${direction}.`);
        });
        
        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offDamage?.();
            offDamage = null;
        });

        return true;
    };
}