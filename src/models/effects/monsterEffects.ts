// A monster effect is an effect that is applied by a monster card.


import { Card, MonsterCard } from "../cards";
import { effectParser } from "./effectParser";
import { Entity } from "../entity";
import { Game } from "../game";
import { DiceRoll, Player } from "../player";
import { EffectData, type EffectFunction, type TargetsSelector } from "../types/cardTypes";
import type {
    OnAttackDeclaredMonsterData,
    OnDamageTakenData,
    OnDamageWouldTakeData,
    OnDeathMonsterData,
    OnDeathWouldDeathData,
    OnDiceBeingRolledData,
    OnGetMonsterAttackPointsData,
    OnGetMonsterEvasionData,
    OnItemActivatedData,
    OnSoulGainedData,
    OnTurnEndData,
} from "../types/eventTypes";
import { type TriggerEvent } from '@/models/types/eventTypes';
import * as active from "./activeEffect";
import { addInPlayEffect } from "./activeEffect";
import { Monster } from "../monster";
import { addPassiveEffectToStack } from "./passiveEffect";

export function thisHealsEffect(game: Game, amount: number): EffectFunction {
    return (data: EffectData) => {
        let target = data.issuer;
        if(!(data.issuer instanceof Monster))
            target = game.monsters.find((m) => m.json.globalId === data.it.globalId)!;
        if(!target)
            throw new Error("thisHealsEffect effect could not find the monster to heal.");
        target.heal(amount);
        return true;
    };
}

export function activePlayerMayAttackMonsterDeckEffect(game: Game, numberOfTimes: number): EffectFunction {
    return async (data: EffectData) => {
        const player = game.currentPlayer as Player;
        player.mayAttackForFreeThis("topDeck", numberOfTimes);
        return true;
    };
}

export function activePlayerMustMakeAdditionalAttackEffect(game: Game): EffectFunction {
    return async (data: EffectData) => {
        const player = game.currentPlayer as Player;
        game.playerMustAttack(player, "any", data.it);
        return true;
    };
}

export function activePlayerSelectAndCallEffect(game: Game, effectFunction: EffectFunction, currentPlayerIsTarget: boolean=false): EffectFunction {
    return async (data: EffectData) => {
        const player = game.currentPlayer as Player;
        
        const targetSelection = await data.selectAndRecord(game, player, 1, 1, game.players, "Select a player.", true, true);
        const targetPlayer = targetSelection.selected[0] as Player;
        if(!targetPlayer){
            throw new Error("No player selected for activePlayerForcesPlayerToDiscardLootEffect.");
        }
        await effectFunction(new EffectData(data.it, targetPlayer, (currentPlayerIsTarget ? [player] : [])));
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

export function activePlayerSelectTargetEffect(game: Game, effectFunction: EffectFunction, ts: TargetsSelector, record: boolean = true): EffectFunction {
    return async (data: EffectData) => {
        const issuer = game.currentPlayer as Player;
        const target = (await data.selectAndRecord(game, issuer as Player, ts.min, ts.max, ts.selector(issuer as Player), ts.description, true, record)).selected;
        if(target.length > 0)
            await effectFunction(new EffectData(data.it, issuer, target));
        return true;
    };
}

export function whenThisReaches1HP(game: Game, effectFunctions: EffectFunction[], description: string): EffectFunction {
    return (data: EffectData) => {
        let offDamage: (() => void) | null = null;
        offDamage = game.emitter.on("on:damage:taken", (eventData: OnDamageTakenData) => {
            const { eventIssuer, target, source, damage } = eventData;
            if (data.issuer !== eventIssuer) return;
            const currentHP = data.issuer.currentHealthPoints;
            if (currentHP === 1) {

               const effect = async (effectData: EffectData) => {
                    for (const func of effectFunctions) {
                        await func(effectData);
                    }
                    return true;
                };
                addPassiveEffectToStack(game, effect, data, description);
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

export function targetTakeDamageEffect(game: Game, damage: number): EffectFunction {
    return (data: EffectData) => {
        const target = data.next;
        if(!(target instanceof Entity))
            throw new Error("targetTakeDamageEffect can only be applied to entity targets.");
        game.dealDamage(data.issuer as Entity, data.targets[0] as Entity, data.it, damage);
        return true;
    };
}
/**
 * each time the active player deals damage to this, they roll-\n1-2: they take 1 damage.\n3-4: each player takes 1 damage.\n5-6: this takes 1 damage.
 */
export function OnDamageByActivePlayerRollDealDamageEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        let offDamage: (() => void) | null = null;
        offDamage = game.emitter.on("on:damage:taken", (eventData: OnDamageTakenData) => {
            const { eventIssuer, target, source, damage } = eventData;
            if (data.issuer !== eventIssuer) return;
            if(!(eventIssuer instanceof Monster)) return;
            if(!(target instanceof Player)) return;
            if(game.currentPlayer !== target) return;
            if(damage === undefined || damage < 1) return;
            const effect = async (effectData: EffectData) => {
                const roll = game.rollDice(target, false, data.it);
                const targets: Entity[][] = [[target], [target], game.players, game.players, [data.issuer], [data.issuer]];
                roll.attachEffect(
                    targets.map((group) => () => {
                        for (const t of group) {
                            game.dealDamage(data.issuer as Entity, t as Entity, data.it, 1);
                        }
                        return true;
                    }), data.it, []);
                return true;
            }
            addPassiveEffectToStack(game, effect, data, `Each time the active player deals damage to ${data.it.name}, they roll a die: on 1-2, they take 1 damage; on 3-4, each player takes 1 damage; on 5-6, ${data.it.name} takes 1 damage.`);

        }
        );
        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offDamage?.();
            offDamage = null;
        });
        return true;
    };
}

export function dealDamageToKillerOnDeathEffect(game: Game, damage: number = 1): EffectFunction {
return (data: EffectData) => {
        let offDamage: (() => void) | null = null;
        
        offDamage = game.emitter.on("on:death:monster", (eventData: OnDeathMonsterData) => {
            const { eventIssuer, target, source } = eventData;
            if (data.issuer !== eventIssuer) return;
            if(!(target instanceof Player)) return;
            
            // Add all effects as a single stack element
            const effect = (effectData: EffectData) => {
                game.dealDamage(eventIssuer as Entity, target as Entity, data.it, damage);
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
        const monsterDeck = game.decks.monster;
        if(!(data.it instanceof MonsterCard))
            throw new Error("putInMonsterDeck6FromTopEffect can only be applied to monster cards.");
        data.it.afterEffect = "nothing"; // Card placement is handled by this effect
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
        const selection = (await data.selectAndRecord(game, player, 1, 1, game.encounters.nonEngagedInCombat, "Where do you want to put The Bloat?", true, true)).selected[0];
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
        if(!(data.it instanceof MonsterCard))
            throw new Error("putOnTopOfMonsterDeckOnRollEffect can only be applied to monster cards.");
        data.it.afterEffect = "discard"; // Card placement is handled by the game by default
        
        const roll = game.rollDice(game.currentPlayer as Player, false, data.it);
        roll.attachEffect([1,2,3,4,5,6].map(n => (data:EffectData) => {
            if(rolls.includes(n)) {
                if(!(data.it instanceof MonsterCard))
                    throw new Error("putOnTopOfMonsterDeckOnRollEffect can only be applied to monster cards.");
                data.it.afterEffect = "nothing"; // Card placement is handled by this effect
                game.decks.monster.addTopPosition(data.it);
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
        
        offDamage = game.emitter.on("on:death:monster", (eventData: OnDeathMonsterData) => {
            const { eventIssuer, target, ability } = eventData;
            if (data.issuer !== eventIssuer) return;
            if(!(target instanceof Player)) return;
            
            // Add all effects as a single stack element
            const effect = (effectData: EffectData) => {
                const handSize = (target as Player).hand.length;
                for(let i=0; i < handSize; i++)
                {

                    game.discardFromHandAtIndex(target as Player, 0);
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
        
        offDeath = game.emitter.on("on:death:monster", (eventData: OnDeathMonsterData) => {
            const { eventIssuer, target, source } = eventData;
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
        
        offDamage = game.emitter.on("on:damage:would-take", (eventData: OnDamageWouldTakeData) => {
            const { eventIssuer, target, source, damageArray } = eventData;
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
        
        offDeath = game.emitter.on("on:death:monster", (eventData: OnDeathMonsterData) => {
            const { eventIssuer, target, source } = eventData;
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
        
        offDamage = game.emitter.on("on:damage:taken", (eventData: OnDamageTakenData) => {
            const { eventIssuer, target, source, damage } = eventData;
            if (data.issuer !== eventIssuer) return;
            if(eventIssuer !== data.issuer) return;
            if(damage === undefined)
                throw new Error("damageAlsoPlayerToTheEffect: damage is undefined.");
            // Add all effects as a single stack element
            const effect = (effectData: EffectData) => {
                const player = game.getPlayerToThe(direction);
                game.dealDamage(eventIssuer as Entity, player as Entity, source, damage);
                return true;
            };
            addPassiveEffectToStack(game, effect, data, `Damage dealt to ${data.it.name} is also dealt to the player to their ${direction}.`);
        });
        
        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offDamage?.();
            offDamage = null;
        });

        return true;
    };
}

export function damageDealtToActivePlayerAlsoToTheEffect(game: Game, direction: "left" | "right"): EffectFunction {
    return (data: EffectData) => {
        let offDamage: (() => void) | null = null;
        offDamage = game.emitter.on("on:damage:taken", (eventData: OnDamageTakenData) => {
            const { eventIssuer, target, source, damage } = eventData;
            if (data.issuer !== target) return;
            if(game.currentPlayer !== eventIssuer) return;
            if(damage === undefined)
                throw new Error("damageAlsoPlayerToTheEffect: damage is undefined.");
            // Add all effects as a single stack element
            const effect = (effectData: EffectData) => {
                const player = game.getPlayerToThe(direction);
                game.dealDamage(eventIssuer as Entity, player as Entity, source, damage);
                return true;
            };
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

export function statModifierWhileAtHealthEffect(game: Game, s: string): EffectFunction
{
    const numbers = s.match(/\d+/g)?.map(numStr => parseInt(numStr, 10)) || [];
    if(numbers.length != 2)
        throw new Error("statModifierWhileAtHealthEffect could not parse numbers from string: " + s);
    const healthThreshold = numbers[0]!;
    const statAmount = numbers[1]!;
    const orLess = s.includes("or less");
    let event: TriggerEvent | null = s.includes("[dc]") 
        ? "on:get:monster:evasion" 
            : s.includes("[atk]") 
            ? "on:get:monster:attackPoints" 
        : null;
    if(!event || (s.includes("[dc]") && s.includes("[atk]")))
        throw new Error("statModifierWhileAtHealthEffect could not determine stat to modify from string: " + s);
    
    return (data: EffectData) => {
        let offGetStat: (() => void) | null = null;
        let statApplied = false;

        offGetStat = game.emitter.on(event, (eventData: OnGetMonsterAttackPointsData | OnGetMonsterEvasionData) => {
            const { eventIssuer, stat } = eventData;
            if (data.issuer !== eventIssuer) return;
            const currentHP = (data.issuer as Entity).currentHealthPoints;
            if((orLess && currentHP <= healthThreshold) || (currentHP === healthThreshold)) {
                if (stat) {
                    stat[0]! += statAmount;
                }
            }
        });
        return true;
    };
}

export function OnDealsCombatDamageEffect(game: Game, s: string): EffectFunction {
    const rest = s.substring("each time this deals combat damage to a player, they ".length).trim();
    const effect = effectParser(rest, game, addInPlayEffect(game), true);
    return (data: EffectData) => {
        let offDamage: (() => void) | null = null;
        
        offDamage = game.emitter.on("on:damage:taken", async (eventData: OnDamageTakenData) => {
            const { eventIssuer, target, source, damage } = eventData;
            if (data.issuer !== target) return;
            if (!(eventIssuer instanceof Player)) return;
            const newData = new EffectData(data.it, eventIssuer as Player, []);
            addPassiveEffectToStack(game, effect.effectFunction, newData, `Each time ${data.it.name} deals combat damage to a player, they ${rest}`);
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offDamage?.();
            offDamage = null;
        });
        return true;
    };
}

export function OnDealsDamageEffect(game: Game, s: string): EffectFunction {
    const rest = s.substring(s.indexOf(",")+1).trim();
    const effect = effectParser(rest, game, addInPlayEffect(game), false);
    return (data: EffectData) => {
        let offDamage: (() => void) | null = null;
        
        offDamage = game.emitter.on("on:damage:taken", async (eventData: OnDamageTakenData) => {
            const { eventIssuer, target, source, damage } = eventData;
            if (data.issuer !== target) return;
            if(!(eventIssuer instanceof Player)) return;
            if(!(source instanceof DiceRoll)) return;
            const newData = new EffectData(data.it, target as Player, []);
            addPassiveEffectToStack(game, effect.effectFunction, newData, `Each time ${data.it.name} deals combat damage to a player, they ${rest}`);
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offDamage?.();
            offDamage = null;
        });
        return true;
    };
}

export function combatDamageIsEffect(game: Game, s: string): EffectFunction {
    const numbers =  s.match(/\d+/g)?.map(numStr => parseInt(numStr, 10)) || [];
    const effectOnDamage = s.includes("doubled") ? "double" : numbers.shift();
    if(numbers.length === 0)
        throw new Error("combatDamageIsEffect could not parse number from string: " + s);
    if(numbers.length > 1)
        throw new Error("combatDamageIsEffect found too many numbers in string: " + s + " it is unexpected so far.");
    return (data: EffectData) => {
        let offDamage: (() => void) | null = null;
        
        offDamage = game.emitter.on("on:damage:would-take", (eventData: OnDamageWouldTakeData) => {
            const { eventIssuer, target, source, damageArray } = eventData;
            if (data.issuer !== target) return;
            if(!(source instanceof DiceRoll)) return;
            if(numbers.includes((source as DiceRoll).value) === false) return;
            // Add all effects as a single stack element
            const effect = (effectData: EffectData) => {
                if(effectOnDamage === "double") {
                    damageArray[0]! *= 2;
                } else {
                    damageArray[0]! += effectOnDamage!;
                }
                return true;
            };
            addPassiveEffectToStack(game, effect, data, `Combat damage ${data.it.name} deals is ${effectOnDamage === "double" ? "doubled" : "increased by " + effectOnDamage}`);
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offDamage?.();
            offDamage = null;
        });
        return true;
    };
}

export function onAttackingPlayerActivatesItemEffect(game: Game, s: string): EffectFunction {
    const rest = s.substring("each time the attacking player activates an item, they ".length).trim();
    const effect = effectParser(rest, game, addInPlayEffect(game), true);
    return (data: EffectData) => {
        let offActivate: (() => void) | null = null;
        
        offActivate = game.emitter.on("on:item:activated", async (eventData: OnItemActivatedData) => {
            const { eventIssuer, item } = eventData;
            if (!(eventIssuer instanceof Player)) return;
            if (!(eventIssuer.isEngagedInCombat)) return;
            const newData = new EffectData(data.it, eventIssuer as Player, []);
            addPassiveEffectToStack(game, effect.effectFunction, newData, `Each time the attacking player activates an item, they ${rest}`);
        });
        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offActivate?.();
            offActivate = null;
        });
        return true;
    };
}

export function playerWithMostCoinsLosesAllEffect(game: Game): EffectFunction {
    return async (data: EffectData) => {
        let maxCoins = -1;
        game.players.forEach(p => {
            if(p.coins > maxCoins)
                maxCoins = p.coins;
        });
        const playersToLoseCoins = game.players.filter(p => p.coins === maxCoins);
        const selection = (await data.selectAndRecord(game, game.currentPlayer as Player, 1, 1, playersToLoseCoins, "Select a player who will lose all their coins.", true, true)).selected[0]!;
        game.loseCoins(selection as Player, selection.coins, true);
        return true;
    };
}

export function onAttackingPlayerRollsEffect(game: Game, s: string): EffectFunction {
    const roll = s.match(/\d+/g)?.map(numStr => parseInt(numStr, 10))[0];
    const rest = s.substring("when the attacking player rolls an attack roll of ".length +2).trim();
    const effect = effectParser(rest, game, addInPlayEffect(game), true);
    return (data: EffectData) => {
        let offRoll: (() => void) | null = null;
        
        offRoll = game.emitter.on("on:dice:resolved", async (eventData: OnDiceBeingRolledData) => {
            const { eventIssuer, diceRoll: attackRoll } = eventData;
            if (!(eventIssuer instanceof Player)) return;
            if (!(eventIssuer.isEngagedInCombat)) return;
            if(attackRoll?.value !== roll) return;
            const newData = new EffectData(data.it, eventIssuer as Player, []);
            addPassiveEffectToStack(game, effect.effectFunction, newData, `When the attacking player rolls an attack roll of ${roll} ${rest}`);
        });
        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offRoll?.();
            offRoll = null;
        });
        return true;
    };
}

export function activePlayerChoosePlayerDiscard2Effect(game: Game): EffectFunction {
    return async (data: EffectData) => {
        const player = game.currentPlayer as Player;
        
        const targetSelection = await data.selectAndRecord(game, player, 1, 1, game.players, "Select a player who discards 2 loot cards.", true, true);
        const targetPlayer = targetSelection.selected[0] as Player;
        if(!targetPlayer){
            throw new Error("No player selected for activePlayerChoosePlayerDiscard2Effect.");
        }
        active.discardNLootCardsEffect(2, game, true)(new EffectData(data.it, targetPlayer, []));
        return true;
    };
}

export function onAttackDeclaredEffect(game: Game, s: string): EffectFunction {
    const rest = s.substring("when an attack is declared on this, ".length).trim();
    const effect = effectParser(rest, game, addInPlayEffect(game), true);
    return (data: EffectData) => {
        let offAttackDeclared: (() => void) | null = null;
        offAttackDeclared = game.emitter.on("on:attack:declared:monster", async (eventData: OnAttackDeclaredMonsterData) => {
            const { eventIssuer, monster } = eventData;
            if (data.issuer !== monster[0]) return;
            if (!(eventIssuer instanceof Player)) return;
            const newData = new EffectData(data.it, eventIssuer as Player, []);
            addPassiveEffectToStack(game, effect.effectFunction, newData, `When an attack is declared on ${data.it.name}, the active player ${rest}`);
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offAttackDeclared?.();
            offAttackDeclared = null;
        });
        return true;
    };
}

export function preventDamageOnRollEffect(game: Game, rolls: number[]): EffectFunction {
    return (data: EffectData) => {

        let offDamage: (() => void) | null = null;
        
        offDamage = game.emitter.on("on:damage:would-take", (eventData: OnDamageWouldTakeData) => {
            const { eventIssuer, target, source, damageArray } = eventData;
            if (data.issuer !== eventIssuer) return;
            if(!(eventIssuer instanceof Monster)) return;
            // Add all effects as a single stack element
            const effect = (effectData: EffectData) => {
                const dice = game.rollDice(game.currentPlayer as Player, false, data.it); // to get the roll value
                dice.attachEffect([1,2,3,4,5,6].map(n => (data:EffectData) => {
                    if(rolls.includes(n)) {
                        damageArray[0] = 0; // remove all damage
                        return true;
                    }
                    return false;
                }), data.it, []);
                return true;
            };
            addPassiveEffectToStack(game, effect, data, `Each time ${data.it.name} would take damage, if the active player rolls ${rolls.join(" or ")}, prevent that damage.`);
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offDamage?.();
            offDamage = null;
        });
        return true;
    };
}

export function preventDeathFirstTimeEachTurnHealAndStatModifierEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        let offDamage: (() => void) | null = null;
        let offTurnStart: (() => void) | null = null;
        let hasPreventedDeathThisTurn = false;
        
        offDamage = game.emitter.on("on:death:would-death", (eventData: OnDeathWouldDeathData) => {
            const { eventIssuer, target, source } = eventData;
            if (data.issuer !== eventIssuer) return;
            if(!(eventIssuer instanceof Monster)) return;
            if(hasPreventedDeathThisTurn) return;
            const effect = (effectData: EffectData) => {
                if(data.issuer instanceof Monster === false)
                    throw new Error("preventDeathFirstTimeEachTurnHealAndStatModifierEffect can only be applied to monsters.");
                game.preventDeath(eventIssuer as Entity);
                data.issuer.heal(1); // heal 1 + 1 from death prevention.
                game.addDC(data.issuer, 1); // add +1 DC
                game.addAttack(data.issuer, -1); // lose 1 attack
                hasPreventedDeathThisTurn = true;
                return true;
            };
            addPassiveEffectToStack(game, effect, data, `The first time each turn ${data.it.name} would be reduced to 0 health, prevent that damage, heal 2 HP, and give it +2 attack.`);
        });

        offTurnStart = game.emitter.on("on:turn:start", (eventData: OnTurnEndData) => {
            if (!hasPreventedDeathThisTurn) return;
            // reset stats
            game.addDC(data.issuer, -1);
            game.addAttack(data.issuer, +1);
            hasPreventedDeathThisTurn = false;
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            if(hasPreventedDeathThisTurn) {
                // reset stats if needed
                game.addDC(data.issuer, -1);
                game.addAttack(data.issuer, +1);
            }
            offDamage?.();
            offDamage = null;
            offTurnStart?.();
            offTurnStart = null;
        });
        return true;
    };
}

export function forceAttackThisEachTurnEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        let offTurnStart: (() => void) | null = null;
        if(!data.issuer || !(data.issuer instanceof Monster)) 
            throw new Error("forceAttackThisEachTurnEffect can only be applied to monsters.");
        game.playerMustAttack(game.currentPlayer, [data.issuer], data.it);
        
        offTurnStart = game.emitter.on("on:turn:start", (eventData: OnTurnEndData) => {
            const { eventIssuer } = eventData;
            if(!data.issuer || !(data.issuer instanceof Monster)) return;
            if(!eventIssuer || !(eventIssuer instanceof Player)) return;
            if(eventIssuer.mustAttackMonster.some(req => (req.target instanceof Array) && req.target.includes(data.issuer as Monster) && req.source === data.it)) return; // if the player already must attack this monster, do not add another requirement
            game.playerMustAttack(eventIssuer, [data.issuer], data.it);
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offTurnStart?.();
            offTurnStart = null;
            game.currentPlayer.clearAttackRequirement(data.issuer as Monster);
        });
        return true;
    };
}


export function attackRequirementEachTurnEffect(game: Game, whom: "any" | "topDeck", times: number, type: "total" | "additional"): EffectFunction {
    return (data: EffectData) => {
        let offTurnStart: (() => void) | null = null;
        if(data.issuer instanceof Player === false)
            throw new Error("attackRequirementEachTurnEffect can only be applied to players.");
        if(game.currentPlayer === data.issuer) {
            const additionalTimes = type === "additional" ? times : times - game.currentPlayer.attackedIdsThisTurn.filter((id) => id === "topDeck" || whom === "any").length;
            for (let i = 0; i < additionalTimes; i++) {
                game.playerMustAttack(data.issuer as Player, whom, data.it);
            }
        }
        offTurnStart = game.emitter.on("on:turn:start", (eventData: OnTurnEndData) => {
            const { eventIssuer } = eventData;
            if(data.issuer instanceof Player === false) return;
            if(eventIssuer !== data.issuer) return;
            const additionalTimes = type === "additional" ? times : times - data.issuer.attackedIdsThisTurn.filter((id) => id === "topDeck" || whom === "any").length;
            for (let i = 0; i < additionalTimes; i++) {
                game.playerMustAttack(data.issuer as Player, whom, data.it);
            }
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offTurnStart?.();
            offTurnStart = null;
        });
            if(data.issuer instanceof Player) {
                data.issuer.clearAttackRequirement("topDeck");
                data.issuer.clearAttackRequirement("any");
            }
        return true;
    };
}

export function activePlayerChooseLivingPlayerTakeDamageEffect(game: Game, damage: number): EffectFunction {
    return async (data: EffectData) => {
        const player = game.currentPlayer as Player;
        const livingPlayers = game.players.filter(p => p.currentHealthPoints > 0);
        if(livingPlayers.length === 0)
            return false;
        const targetSelection = await data.selectAndRecord(game, player, 1, 1, livingPlayers, "Select a living player to take damage.", true, true);
        const targetPlayer = targetSelection.selected[0] as Player;
        if(!targetPlayer){
            throw new Error("No player selected for activePlayerChooseLivingPlayerTakeDamageEffect.");
        }
        game.dealDamage(data.issuer as Entity, targetPlayer as Entity, data.it, damage);
        return true;
    }
};

export function dealDamageToEachOtherMonsterEffect(game: Game, damage: number): EffectFunction {
    return (data: EffectData) => {
        game.monsters.forEach(monster => {
            if(monster !== data.issuer) {
                game.dealDamage(data.issuer as Entity, monster as Entity, data.it, damage);
            }
        });
        return true;
    };
}

export function dealDamageToAttackingPlayerEffect(game: Game, damage: number): EffectFunction {
    return (data: EffectData) => {
        game.dealDamage(data.issuer as Entity, game.currentPlayer as Player, data.it, damage);
        return true;
    };
}

export function bossRushEffect(game: Game): EffectFunction {
    return async (data: EffectData) => {
        let bosses = [];
        if(!(data.it instanceof MonsterCard))
            return false;
        data.it.afterEffect = "handled"; 
        // draw 2 boss cards 
        while(bosses.length < 2 && game.decks.monster.cards.length > 0) {
            const card = game.decks.monster.draw();
            if(card instanceof MonsterCard && card.subtype === "boss") {
                bosses.push(card);
            } else {
                game.discard(card);
            }
        }
        for(const card of bosses)
            game.addTopPosition("monster", card);
        const options = [...game.encounters.nonEngagedInCombat, data.it];
        const selection = await data.selectAndRecord(game, game.currentPlayer, 1, 2, [...game.encounters.nonEngagedInCombat, data.it], "Select slots to place the bosses in.", true, true);
        const selectedMonsters = selection.selected;
        const selectedIndices = selectedMonsters.map(slot => game.encounters.visible.indexOf(slot));
        for(let i=0; i < bosses.length; i++)
        {
            const slotIndex = selectedIndices[i%selectedIndices.length]!;
            game.encounters.draw(slotIndex);
        }
        const monsters = selectedIndices.map(index => game.encounters.monsters[index]!);
        game.encounters.removeFromSlot(data.it);
        game.encounters._deck.addDiscardTop(data.it); 
        game.playerMustAttack(game.currentPlayer, monsters, data.it);
        return true;
    };
}

export function playerWithMostSoulsWinsEffect(game: Game): EffectFunction {
    return async (data: EffectData) => {
        let offGainSoul: (() => void) | null = null;

        offGainSoul = game.emitter.on("on:soul:gained", async (eventData: OnSoulGainedData) => {
            const { eventIssuer, soul } = eventData;
            if(soul !== data.it) return;
            let maxSouls = -1;
            game.players.forEach(p => {
                if(p.totalSouls > maxSouls)
                    maxSouls = p.totalSouls;
            });
            const playersWithMostSouls = game.players.filter(p => p.totalSouls === maxSouls);
            const selectedPlayer = (await data.selectAndRecord(game, eventIssuer as Player, 1, 1, playersWithMostSouls, "Select a player with most souls to win the game.", true, true)).selected[0];
            game.win(selectedPlayer as Player);
            offGainSoul?.();
            offGainSoul = null;
        });
        data.it.cleaners.push(() => {
            if(game.monsters.some(m => m.card === data.it && m.isDead)) // Don't clean if the monster is dead, as the effect is meant to trigger on soul gain which happens after death.
                return
            offGainSoul?.();
            offGainSoul = null;
        });

        return true;
    };
}

export function onTakesCombatDamageEffect(game: Game, s: string, rolls: number[] = []): EffectFunction {
    const rest = s.substring(s.indexOf(",")+1).trim();
    const effect = effectParser(rest, game, addInPlayEffect(game), false);
    return (data: EffectData) => {
        let offDamage: (() => void) | null = null;
        
        offDamage = game.emitter.on("on:damage:taken", async (eventData: OnDamageTakenData) => {
            const { eventIssuer, target, source, damage } = eventData;
            if (data.issuer !== eventIssuer) return;
            if(!(eventIssuer instanceof Monster)) return;
            if(!(source instanceof DiceRoll)) return;
            if(rolls.length > 0 && !rolls.includes((source as DiceRoll).value)) return;
            const newData = new EffectData(data.it, data.issuer, []);
            addPassiveEffectToStack(game, effect.effectFunction, newData, `Each time ${data.it.name} takes combat damage, it ${rest}`);
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offDamage?.();
            offDamage = null;
        });
        return true;
    };
}

export function onEveryOtherDamageEffect(game: Game, effect: EffectFunction): EffectFunction {
    return (data: EffectData) => {
        let offDamage: (() => void) | null = null;
        let damageCount = 0;

        offDamage = game.emitter.on("on:damage:taken", (eventData: OnDamageTakenData) => {
            const { eventIssuer, target, source, damage } = eventData;
            if (data.issuer !== eventIssuer) return;
            // Add all effects as a single stack element
            damageCount += 1;
            if(damageCount % 2 === 0) {
                addPassiveEffectToStack(game, effect, data, `Every other time ${data.it.name} takes damage, ${effect.name}`);
            }
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

export function dealDamageToPlayerToTheEffect(game: Game, damage: number, direction: "left" | "right"): EffectFunction {
    return (data: EffectData) => {
        const player = game.getPlayerToThe(direction);
        game.dealDamage(data.issuer as Entity, player as Entity, data.it, damage);
        return true;
    };
}