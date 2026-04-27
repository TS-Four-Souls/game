// A room effect is an effect that is applied by a room card.


import { Game } from "../game";
import { EffectData, type EffectFunction } from "../types/cardTypes";
import { Player } from "../player";
import { Card, LootCard, MonsterCard, TreasureCard, ItemCard } from "../cards";
import type { OnAttackDeclaredTopDeckData, OnDamageTakenData, OnDeathMonsterData } from "../types/eventTypes";
import { flushMonsterSlotsEffect, flushShopEffect } from "./activeEffect";
import { addPassiveEffectToStack } from "./passiveEffect";
import { visibleItemSelector } from "../targetSelector";
import { Monster } from "../monster";
import { Animated, Entity } from "../entity";

export function preventGainSoulsEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        const addSoul = game.addSoul.bind(game);
        game.addSoul = (player: Player, soulCard: Card) => {
            game.discard(soulCard);
        }

        data.it.cleaners.push(() => {
            game.addSoul = addSoul;
        });
        return true;
    };
}

export function cancelAttackOnTopOfMonsterDeckEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
         let offAttack: (() => void) | null = null;
        // Listen for the next damage event on this player
        offAttack = game.emitter.on("on:attack:declared:topdeck", (eventData: OnAttackDeclaredTopDeckData) => {
            const { eventIssuer, drawInIndex } = eventData;
            if(eventIssuer !== game.currentPlayer) {
                return; // Not the current player, ignore
            }
            // Create the effect that will execute when the stack resolves
            const effect = async (effectData: EffectData) => {
                const selection = await effectData.selectAndRecord(game, game.currentPlayer, 0, 1, [data.it], "Do you want to cancel the attack?", false, true);
                if (selection.selected.length > 0) {
                    game.endCombat();
                }
                return true;
            };
            
            // Add to stack instead of executing immediately
            addPassiveEffectToStack(game, effect, data, "You may cancel your top deck attack.");
        });
        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offAttack?.();
            offAttack = null;
        });
        return true;
    };
}

export function otherPlayersAreAttackableEffect(game: Game, evasion: number): EffectFunction {
    return (data: EffectData) => {
        let offTurnStart: (() => void) | null = null;
        for(const player of game.players) {
            if(player !== game.currentPlayer) {
                game.makePlayerAttackable(player, evasion);
            }
        }
        game.makePlayerUnattackable(game.currentPlayer);

        offTurnStart = game.emitter.on("on:turn:start", (eventData) => {
            for(const player of game.players) {
                if(player !== game.currentPlayer) {
                    game.makePlayerAttackable(player, evasion);
                }
            }
            game.makePlayerUnattackable(game.currentPlayer);
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offTurnStart?.();
            offTurnStart = null;
            for(const player of game.players) {
                game.makePlayerUnattackable(player);
            }
        });
        return true;
    }
}

export function giveDeathPenaltyItemToActivePlayerEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        let offDeath: (() => void) | null = null;
        offDeath = game.emitter.on("on:death:penalty", (eventData) => {
            const { eventIssuer, itemsLost } = eventData;
            // // check if the receiver of the death penalty is a player, and not the active player.
            if(eventIssuer === game.currentPlayer || !(eventIssuer instanceof Player)) {
                return; // Not the current player or not a player, ignore
            }
            if(game.currentPlayer.attackedIdsThisTurn.includes(eventIssuer.id)) {
                for(const item of itemsLost) {
                    game.removeInPlay(eventIssuer, item);
                    game.addInPlay(game.currentPlayer, item);
                }
                eventData.itemsLost = []; // Clear the items lost as they are now given to the active player instead of being lost
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

export function gainCoinsAtStartOfTurnEffect(game: Game, coins: number, anyPlayer: boolean): EffectFunction {
    return (data: EffectData) => {
        let offTurnStart: (() => void) | null = null;
        offTurnStart = game.emitter.on("on:turn:start", (eventData) => {
            const { eventIssuer } = eventData;
            if(!anyPlayer && eventIssuer !== game.currentPlayer) {
                return; // Not the current player, ignore
            }
            game.gainCoins(game.currentPlayer, coins, data.it);
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offTurnStart?.();
            offTurnStart = null;
        });
        return true;
    };
}

export function cheaperShopItemsEffect(game: Game, discount: number): EffectFunction {
    return (data: EffectData) => {
        let offTurnStart: (() => void) | null = null;
        let offEndTurn: (() => void) | null = null;
        offTurnStart = game.emitter.on("on:turn:start", (eventData) => {
            game.currentPlayer.priceModifier -= discount;
        });

        offEndTurn = game.emitter.on("on:turn:end", (eventData) => {
            game.currentPlayer.priceModifier += discount;
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offTurnStart?.();
            offTurnStart = null;
            offEndTurn?.();
            offEndTurn = null;
            game.currentPlayer.priceModifier += discount;

        });
        return true;
    };
}

export function lookAtTopNOnAttackEffect(game: Game, n: number): EffectFunction {
    return (data: EffectData) => {
        let offAttack: (() => void) | null = null;
        offAttack = game.emitter.on("on:attack:declared", async (eventData) => {
            const { eventIssuer } = eventData;
            if(eventIssuer !== game.currentPlayer) {
                return; // Not the current player, ignore
            }
            const effect = async (effectData: EffectData) => { 
                const topN = game.decks.monster.drawSeveral(n);
                const order = (await data.selectAndRecord(game, game.currentPlayer, n, n, topN, `Look at the top ${n} cards of the monster deck and put them back in any order.`, false, false)).selected as MonsterCard[];
                for(let i = order.length - 1; i >= 0; i--) {
                    game.decks.monster.addTopPosition(order[i]!);
                }
                return true;
            };
            addPassiveEffectToStack(game, effect, data, `Look at the top ${n} cards of the monster deck and put them back in any order.`);
            // The selectAndRecord function will handle the reordering and putting back of the cards.
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offAttack?.();
            offAttack = null;
        });
        return true;
    };
}

export function doubleRewardsEffect(game: Game): EffectFunction {

    return (data: EffectData) => {
        let offDeath: (() => void) | null = null;
        
        offDeath = game.emitter.on("on:death:monster", (eventData: OnDeathMonsterData) => {
            
            // Add all effects as a single stack element
            const effect = (effectData: EffectData) => {
                game.entityRewards(eventData.eventIssuer as Monster);
                return true;
            };
            addPassiveEffectToStack(game, effect, data, `Double rewards.`);
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offDeath?.();
            offDeath = null;
        });
        return true;
    };
}

export function activePlayerMustAttackTopDeck(game: Game): EffectFunction {
    return (data: EffectData) => {
        let offTurnStart: (() => void) | null = null;
        game.playerMustAttack(game.currentPlayer, "topDeck", data.it);
        let init: Player | null = game.currentPlayer;

        offTurnStart = game.emitter.on("on:turn:start", (eventData) => {
            if(init === eventData.eventIssuer)
                return;
            init = null;
            game.playerMustAttack(game.currentPlayer, "topDeck", data.it);
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            init = null;
            game.currentPlayer.clearAttackRequirementsFromSource(data.it);
            offTurnStart?.();
            offTurnStart = null;
        });
        return true;
    };
}

export function activePlayerMustAttackAdditionalTimeEffect(game: Game): EffectFunction {
     return (data: EffectData) => {
        let offTurnStart: (() => void) | null = null;
        game.playerMustAttack(game.currentPlayer, "any", data.it);
        let init: Player | null = game.currentPlayer;

        offTurnStart = game.emitter.on("on:turn:start", (eventData) => {
            if(init === eventData.eventIssuer)
                return;
            init = null;
            game.playerMustAttack(game.currentPlayer, "any", data.it);
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            init = null;
            game.currentPlayer.clearAttackRequirementsFromSource(data.it);
            offTurnStart?.();
            offTurnStart = null;
        });
        return true;
    };
}

export function gainCoinsOnPlayerDeathEffect(game: Game, amount: number): EffectFunction {
    return (data: EffectData) => {
        let offDeath: (() => void) | null = null;
        offDeath = game.emitter.on("on:death:before-penalty", (eventData) => {
            const { eventIssuer } = eventData;
            for(const player of game.players) {
                if(player !== eventIssuer) {
                    game.gainCoins(player, amount, data.it);
                }
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


export function lootOnPlayerDeathEffect(game: Game, amount: number): EffectFunction {
    return (data: EffectData) => {
        let offDeath: (() => void) | null = null;
        offDeath = game.emitter.on("on:death:before-penalty", (eventData) => {
            const { eventIssuer } = eventData;
            for(const player of game.players) {
                if(player !== eventIssuer) {
                    game.loot(player, amount);
                }
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

export function CurrentPlayerDecidesToChangeRoom(game: Game): EffectFunction{
    return async (data: EffectData) => {
        if(game.rooms === undefined)
            return false;
        const selectedRoom = (await data.selectAndRecord(game, game.currentPlayer, 0, 1, [...game.rooms.activeRooms], "A monster died this turn, you can choose to put a room card into discard.", true)).selected[0];
        if(selectedRoom)
            game.discard(selectedRoom);
        return selectedRoom !== undefined;
    }
}

export function playersGainAttackEffect(game: Game, amount: number): EffectFunction {
    return (data: EffectData) => {
        for(const player of game.players)
            game.addAttack(player, amount);
        
        data.it.cleaners.push(() => {
            for(const player of game.players)
                game.addAttack(player, -amount);
        });
        return true;
    };
}


export function takeDamageOnLootEffect(game: Game, amount: number): EffectFunction {
    return (data: EffectData) => {
        let offLoot: (() => void) | null = null;
        offLoot = game.emitter.on("on:loot:added:after", (eventData) => {
            const effect: EffectFunction = (effectData: EffectData) => {
                game.dealDamage(eventData.eventIssuer, eventData.eventIssuer, data.it, amount);
                return true;
            };
            addPassiveEffectToStack(game, effect, data, `Take ${amount} damage each time you loot.`); // Add the damage as a separate stack element to avoid issues with the loot event data being modified by other effects in the stack
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offLoot?.();
            offLoot = null;
        });
        return true;
    };
}

export function discardLootAtEndOfTurnEffect(game: Game, amount: number): EffectFunction {
     return (data: EffectData) => {
        let offTurnStart: (() => void) | null = null;
        offTurnStart = game.emitter.on("on:turn:end", (eventData) => {
            const effect: EffectFunction = async (effectData: EffectData) => {
                const selected = (await effectData.selectAndRecord(game, game.currentPlayer, 1, amount, game.currentPlayer.hand.cards, `Discard ${amount} loot cards.`, true)).selected as LootCard[];
                for(const card of selected) {
                    game.removeCardFromHand(game.currentPlayer, card);
                }

                return true;
            }
            addPassiveEffectToStack(game, effect, data, `Discard ${amount} loot cards.`);
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offTurnStart?.();
            offTurnStart = null;
        });
        return true;
    };
}

export function deactivateCharacterAtEndOfTurnEffect(game: Game): EffectFunction {
     return (data: EffectData) => {
        let offTurnStart: (() => void) | null = null;
        offTurnStart = game.emitter.on("on:turn:end", (eventData) => {
            const effect: EffectFunction = async (effectData: EffectData) => {
                game.deactivateItem(game.currentPlayer.character);
                return true;
            }
            addPassiveEffectToStack(game, effect, data, `Deactivate your character at the end of the turn.`);
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offTurnStart?.();
            offTurnStart = null;
        });
        return true;
    };
}

export function loseCoinsAtEndOfTurnEffect(game: Game, amount: number): EffectFunction {
     return (data: EffectData) => {
        let offTurnStart: (() => void) | null = null;
        offTurnStart = game.emitter.on("on:turn:end", (eventData) => {
            game.loseCoins(game.currentPlayer, amount, true);
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offTurnStart?.();
            offTurnStart = null;
        });
        return true;
    };
}

export function monstersGainAttackEffect(game: Game, amount: number, includeSelf: boolean): EffectFunction {
    return (data: EffectData) => {
        game.addAttackToEachMonster(data.issuer as Entity, amount);
        if(!includeSelf) {
            (data.issuer as Monster).addEvasion(-amount);
        }
        data.it.cleaners.push(() => {
            game.addAttackToEachMonster(data.issuer as Entity, -amount);
            if(!includeSelf) {
            (data.issuer as Monster).addEvasion(amount);
        }
        });
        return true;
    };
}

export function targetNextKillsAnotherPlayerEffect(game: Game): EffectFunction {
    return async (data: EffectData) => {
        const killer = data.next as Player;
        if(!killer || !(killer instanceof Player))
            throw new Error("No valid killer found for targetNextKillsAnotherPlayerEffect.");
        if(game.players.filter(p => p !== killer && p.isDead == false).length === 0)
            return false; // No valid targets to kill
        const selected = (await data.selectAndRecord(game, killer, 1, 1, game.players.filter(p => p !== killer && p.isDead == false), "Select a player to kill.")).selected[0]! as Player;
        game.kill(killer, selected, data.it);
        return true;
    };
}

export function mayRerollItemAtStartOfTurnEffect(game: Game): EffectFunction {
     return (data: EffectData) => {
        let offTurnStart: (() => void) | null = null;
        offTurnStart = game.emitter.on("on:turn:start", (eventData) => {
            const effect: EffectFunction = async (effectData: EffectData) => {
                const selected = (await effectData.selectAndRecord(game, game.currentPlayer, 0, 1, game.inPlayTargetableCards(game.currentPlayer), "You may reroll an item you control.", false)).selected[0] as ItemCard | undefined;
                if(selected) {
                    game.reroll(selected);
                    return true;
                }
                return false;
            };
            addPassiveEffectToStack(game, effect, data, "You may reroll an item you control.");
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offTurnStart?.();
            offTurnStart = null;
        });
        return true;
    };
}

export function mayGainTreasureAtStartOfTurnEffect(game: Game): EffectFunction {
     return (data: EffectData) => {
        let offTurnStart: (() => void) | null = null;
        offTurnStart = game.emitter.on("on:turn:start", (eventData) => {
            const effect: EffectFunction = async (effectData: EffectData) => {
                const selected = (await effectData.selectAndRecord(game, game.currentPlayer, 0, 1, [data.it], "You may gain a treasure.", false)).selected[0] as ItemCard | undefined;
                if(selected !== undefined) {
                    game.gainTreasure(game.currentPlayer, 1);
                    return true;
                }
                return false;
            };
            addPassiveEffectToStack(game, effect, data, "You may gain a treasure.");
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offTurnStart?.();
            offTurnStart = null;
        });
        return true;
    };
}

export function damageIfLowLootAtEndOfTurnEffect(game: Game, amount: number): EffectFunction {
     return (data: EffectData) => {
        let offTurnStart: (() => void) | null = null;
        offTurnStart = game.emitter.on("on:turn:end", (eventData) => {
            const effect: EffectFunction = async (effectData: EffectData) => {
                if(game.currentPlayer.hand.length > 1) return false;
                game.dealDamage(game.currentPlayer, game.currentPlayer, data.it, amount);
                return false;
            };
            addPassiveEffectToStack(game, effect, data, "You may gain a treasure.");
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offTurnStart?.();
            offTurnStart = null;
        });
        return true;
    };
}

export function putThisIntoDiscardAtEndOfTurnEffect(game: Game): EffectFunction {
     return (data: EffectData) => {
        let offTurnStart: (() => void) | null = null;
        offTurnStart = game.emitter.on("on:turn:end", (eventData) => {
            game.discard(data.it);
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offTurnStart?.();
            offTurnStart = null;
        });
        return true;
    };
}

export function discardHandsAndLootEffect(game: Game, amount: number): EffectFunction {
    return (data: EffectData) => {
        for(const player of game.players)
        {
            for(const card of player.hand.cards) {
                game.discard(card);
            }
            game.loot(player, amount);
        }
        return true;
    };
}

export function enterPlayRerollItemsDiscardHandsLootAndFlushMonstersEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        flushMonsterSlotsEffect(game, "discard")(data);
        discardHandsAndLootEffect(game, 3)(data);
        for(const item of visibleItemSelector((c) => c.eternal === false, game)(data.issuer as Player)) {
            game.reroll(item);
        }
        return true;
    };
}

export function eachPlayerGainsCoinsEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        let offGainCoins: (() => void) | null = null;
        offGainCoins = game.emitter.on("on:coin:gained:after", (eventData) => {
            const { eventIssuer, coinGained, source } = eventData;
            if(source === data.it)
                return; // Prevent infinite loop if the coin gain is caused by this effect
            for(const player of game.players) {
                if(player !== eventIssuer) {
                    game.gainCoins(player, coinGained[0]!, data.it);
                }
            }
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offGainCoins?.();
            offGainCoins = null;
        });
        return true;
    };
}

export function discardHandIfNoShopPurchaseAtEndOfTurnEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        let offEndTurn: (() => void) | null = null;
        let offPurchase: (() => void) | null = null;
        let purchaseMade = false;

        offEndTurn = game.emitter.on("on:turn:end", (eventData) => {
            const { eventIssuer } = eventData;
            if(eventIssuer !== game.currentPlayer) {
                return; // Not the current player, ignore
            }
            if(!purchaseMade) {
                for(const card of [...game.currentPlayer.hand.cards]) {
                    game.discard(card);
                }
            }
            purchaseMade = false; // Reset for next turn
        });

        offPurchase = game.emitter.on("on:purchase:success", (eventData) => {
             const { eventIssuer, index } = eventData;
             if(eventIssuer === game.currentPlayer && index !== "top") {
                purchaseMade = true;
             }
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offEndTurn?.();
            offEndTurn = null;
            offPurchase?.();
            offPurchase = null;
        });
        return true;
    };
}

export function skipNextTurnOnSoulGainEffect(game: Game): EffectFunction {

    return (data: EffectData) => {
        let offGainSoul: (() => void) | null = null;
        offGainSoul = game.emitter.on("on:soul:gained", (eventData) => {
            const { eventIssuer, soul } = eventData;
            game.turnHandler.skipNextTurn(eventIssuer as Player);
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offGainSoul?.();
            offGainSoul = null;
        });
        return true;
    };
}

export function canBeAttackedEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        const card = data.it;
        if(card.json.stats === undefined)
            throw new Error("Expected card stats to be defined for canBeAttackedEffect.");
        const { healthPoints, attackPoints, evasionPoints } = card.json.stats;
        if(healthPoints === undefined || attackPoints === undefined || evasionPoints === undefined)
            throw new Error("Expected all card stats to be defined for canBeAttackedEffect.");
        card.entity = new Animated(card, card.slug, attackPoints, healthPoints, evasionPoints);
        card.entity.attackable = true;
        game.addAnimated(card.entity as Animated);
        data.it.cleaners.push(() => {
            game.removeAnimated(card.entity as Animated);
            data.it.entity!.attackable = false;
        });
        return true;
    };
}

export function makeAnAttackRollAfterEachAttackRollEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        let offAttackRolled: (() => void) | null = null;
        let offCombatEnd: (() => void) | null = null;

        offAttackRolled = game.emitter.on("on:attack:roll", (eventData) => {
            if(eventData.eventIssuer !== game.currentPlayer) {
                return; // Not the current player, ignore
            }
            if(data.issuer.isDead)
                return; // Dead, ignore
            const effect: EffectFunction = (effectData: EffectData) => {
                if(effectData.issuer instanceof Player === false)
                    throw new Error("Expected issuer to be a player for makeAnAttackRollAfterEachAttackRollEffect.");
                    game.attackRoll(effectData.issuer, data.it.entity as Entity);
                return true;
            };
            addPassiveEffectToStack(game, effect, data, "You must make an attack roll against this after each attack roll the active player makes this attack.");
        });

        offCombatEnd = game.emitter.on("on:combat:end", (eventData) => {
            offAttackRolled?.();
            offAttackRolled = null;
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offAttackRolled?.();
            offAttackRolled = null;
        });
        return true;
    };
}

export function playerMustDestroyItemOnDeathEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        let offAttackDeclared: (() => void) | null = null;
        offAttackDeclared = game.emitter.on("on:death:before-penalty", async (eventData) => {
            const { eventIssuer  } = eventData;
            if(eventIssuer instanceof Player === false)
                return;
            const effect: EffectFunction = async (effectData: EffectData) => {
                const selected = (await effectData.selectAndRecord(game, eventIssuer as Player, 1, 1, game.inPlayTargetableCards(eventIssuer as Player), "Select an item to destroy.", false)).selected[0] as ItemCard | undefined;
                if(selected) {
                    game.destroyCardsOrSouls([selected])
                }
                return true;
            };
            addPassiveEffectToStack(game, effect, data, "You must destroy an item you control.");
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offAttackDeclared?.();
            offAttackDeclared = null;
        });
        return true;
    };
}

export function onAttackDeclaredNonActivePlayersRollToJoinEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        let offAttackDeclared: (() => void) | null = null;
        offAttackDeclared = game.emitter.on("on:attack:declared:animated", async (eventData) => {
            const { eventIssuer, animated } = eventData;
            if(animated[0] !== data.it.entity!)
                return 
            if(eventIssuer !== game.currentPlayer) {
                return; // Not the current player, ignore
            }
            for(const player of game.players) {
                if(player !== game.currentPlayer && !player.isDead) {
                    const roll = game.rollDice(player, false, data.it);
                    roll.attachEffect([
                        (data: EffectData) => true, 
                        (data: EffectData) => true, 
                        (data: EffectData) => true, 
                        makeAnAttackRollAfterEachAttackRollEffect(game),
                        makeAnAttackRollAfterEachAttackRollEffect(game),
                        makeAnAttackRollAfterEachAttackRollEffect(game),
                        ], data.it, [], player);
                }
            }
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offAttackDeclared?.();
            offAttackDeclared = null;
        });
        return true;
    };
}

export function rerollOn1Or6Effect(game: Game): EffectFunction {
    return (data: EffectData) => {
        let offRoll: (() => void) | null = null;
        offRoll = game.emitter.on("on:dice:would-roll", (eventData) => {
            const { eventIssuer, diceRoll } = eventData;
            if(diceRoll.value === 1 || diceRoll.value === 6) {
                const effect: EffectFunction = async (effectData: EffectData) => {
                    const selected = (await effectData.selectAndRecord(game, game.currentPlayer, 0, 1, [data.it], "You rolled a 1 or a 6. Do you want to reroll?", false, true)).selected[0] as Card | undefined;
                    if(selected) {
                        diceRoll.roll();
                        return true;
                    }
                    return false;
                };
                addPassiveEffectToStack(game, effect, data, "You rolled a 1 or a 6. Do you want to reroll?");
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


// REPLACEMENT EFFECT: Continuous stat modification - does not use the stack.
export function allPlayersPermanentStatModifierEffect(
    adders: ((player: Player, value: number) => void)[],
    amount: number,
    game: Game
): EffectFunction {
    return (data: EffectData) => {
        if (amount < 0)
            throw new Error("allPlayersPermanentStatModifierEffect amount must be non-negative.");
        // Apply the stat modification
        for(const player of game.players) 
            for (const adder of adders)
                adder(player, amount);

        data.it.cleaners.push(() => {
            for(const player of game.players) 
                for (const adder of adders)
                    adder(player, -amount);
        });

        return true;
    };
}
export function payHpForTreasureBoostEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        let offTurnStart: (() => void) | null = null;
        offTurnStart = game.emitter.on("on:turn:start", (eventData) => {
            const effect: EffectFunction = async (effectData: EffectData) => {
                const difference = game.currentPlayer.currentHealthPoints - 1;
                const selected = (await effectData.selectAndRecord(game, game.currentPlayer, 0, 1, [data.it], "You can pay " + difference + " HP to gain a treasure each time a monster dies this turn. Do you want to?", false, true)).selected[0] as Card | undefined;
                if(selected !== undefined) {
                    game.dealDamage(game.currentPlayer, game.currentPlayer, data.it, difference, (data: EffectData) => {
                        let offMonsterDeath: (() => void) | null = null;
                        offMonsterDeath = game.emitter.on("on:death:monster", (eventData) => {
                             const { eventIssuer } = eventData;
                             if(eventIssuer instanceof Monster) {
                                 game.gainTreasure(game.currentPlayer, 1);
                             }
                        });
                        data.it.cleaners.push(() => {
                            offMonsterDeath?.();
                            offMonsterDeath = null;
                        });
                        return true
                    }); 
                    return true;
                }
                return false;
            };
            addPassiveEffectToStack(game, effect, data, "You can pay " + (game.currentPlayer.currentHealthPoints - 1) + " HP to gain a treasure each time a monster dies this turn. Do you want to?");
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offTurnStart?.();
            offTurnStart = null;
        });
        return true;
    };
}

export function WhenDealDamageMonsterDealDamageToPlayerToTheEffect(game: Game, amount: number, direction: "left" | "right"): EffectFunction {
    return (data: EffectData) => {
        let offDealDamage: (() => void) | null = null;
        offDealDamage = game.emitter.on("on:damage:taken", (eventData: OnDamageTakenData) => {
            const { eventIssuer, target, damage } = eventData;
            if(eventIssuer instanceof Monster && damage > 0 && target instanceof Player ) {
                const effect: EffectFunction = (effectData: EffectData) => {
                    game.dealDamage(target, game.turnHandler.getPlayerTo(target, direction), data.it, amount);
                    return true;
                };
                addPassiveEffectToStack(game, effect, data, `When a monster takes damage, the player to their ${direction} also takes ${amount} damage.`);
            }
        });
        data.it.cleaners.push(() => {
            offDealDamage?.();
            offDealDamage = null;
        });
        return true;
    };
}

export function playersWithFewestSoulsAttackBoostEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        let offTurnStart: (() => void) | null = null;
        let offSoulGained: (() => void) | null = null;
        let playersWithFewestSouls: Player[] = [];
        let shouldAddAttackThisTurn = true;
        function computeEffect() {
            let minSouls = Math.min(...game.players.map(p => p.totalSouls));
            playersWithFewestSouls = game.players.filter(p => p.totalSouls === minSouls);
            for(const player of playersWithFewestSouls) 
            {
                game.addAttack(player, 1);
            }
            if(playersWithFewestSouls.includes(game.currentPlayer) && shouldAddAttackThisTurn)
                game.currentPlayer.attackThisTurn += 1;
        }
        function removeEffect() {
            for(const player of playersWithFewestSouls) 
            {
                game.addAttack(player, -1);
            }
            if(playersWithFewestSouls.includes(game.currentPlayer))
            {
                if(game.currentPlayer.attackThisTurn > 0)
                    game.currentPlayer.attackThisTurn -= 1;
                else
                    shouldAddAttackThisTurn = false;
            }
        }
        computeEffect();
        offTurnStart = game.emitter.on("on:turn:start", (eventData) => {
            if(playersWithFewestSouls.includes(game.currentPlayer))
            {
                game.currentPlayer.attackThisTurn += 1;
                shouldAddAttackThisTurn = true;
            }
        });
        offSoulGained = game.emitter.on("on:soul:gained", (eventData) => {
            removeEffect();
            computeEffect();
        });
        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offTurnStart?.();
            offTurnStart = null;
            removeEffect();
        });
        return true;
    };
}


export function playersWithFewestSoulsFreeShopItemEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        let offTurnStart: (() => void) | null = null;
        let offPurchase: (() => void) | null = null;
        let offTurnEnd: (() => void) | null = null;
        let offSoulGained: (() => void) | null = null;
        let playersWithFewestSouls: Player[] = [];
        let pay0Next = true;
        /**
         * compute the players with least souls.
         * If the current player is among them, reduce their price modifier.
         */
        function computeEffect() {
            let minSouls = Math.min(...game.players.map(p => p.totalSouls));
            playersWithFewestSouls = game.players.filter(p => p.totalSouls === minSouls);
            if(playersWithFewestSouls.includes(game.currentPlayer) && pay0Next)
                game.currentPlayer.priceModifier -= 999;
        }
        /** When a shop item is purchase, if the current player has his cost reduced, remove the reduction.
         */
        offPurchase = game.emitter.on("on:purchase:success", (eventData) => {
             const { eventIssuer, index } = eventData;
             if(eventIssuer === game.currentPlayer && index !== "top" && playersWithFewestSouls.includes(game.currentPlayer) && pay0Next) {
                removeEffect();
                pay0Next = false;
             }
        });
        function removeEffect() {
            if(playersWithFewestSouls.includes(game.currentPlayer) && pay0Next)
            {
                game.currentPlayer.priceModifier += 999;
            }
        }
        
        computeEffect();
        offTurnStart = game.emitter.on("on:turn:start", (eventData) => {
            computeEffect();
            pay0Next = true;
        });
        offTurnEnd = game.emitter.on("on:turn:end", (eventData) => {
            removeEffect();
        });
        offSoulGained = game.emitter.on("on:soul:gained", (eventData) => {
            removeEffect();
            computeEffect();
        });
        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offTurnStart?.();
            offTurnStart = null;
            removeEffect();
        });
        return true;
    };
}

export function flushShopOrUnattackedMonstersEffect(game: Game): EffectFunction {
    return async (data: EffectData) => {
        const selected = (await data.selectAndRecord(game, game.currentPlayer, 0, 1, ["treasure", "monster"], "Put each shop item or each monster not being attacked into discard.", false)).selected[0] as string | undefined;
        if(selected === "treasure") {
            flushShopEffect(game, "discard")(data);
        }
        if(selected === "monster") {
            flushMonsterSlotsEffect(game, "discard")(data);
        }
        // Implementation for flushing shop items or unattacked monsters
        return true;
    };
}
/**
 * this room can't be put into discard till 4 goals are completed.
 * 
 *   - play 5 loot cards.
 *   - kill 3 monsters.
 *   - give at least 6¢ to another player at one time.
 *   - purchase 3 items.
 *   - roll a 6 three times. 
 * 
 * when 4 goals are completed, each player gains +2 treasure.
 */
export function socialGoalsEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        const originalDiscard = game.discard.bind(game);
        game.discard = (card: Card) => {
            if(card === data.it) {
                return; // Prevent discarding the card until goals are completed
            }
            originalDiscard(card);
        };
        data.it.tags.counters = 0;
        let sixCoinGiven: boolean = false;
        let lootPlayed = 0;
        let monstersKilled = 0;
        let itemsPurchased = 0;
        let sixesRolled = 0;

        function tryResolve() {
            let goalsCompleted = 0;
            if(lootPlayed >= 5) goalsCompleted++;
            if(monstersKilled >= 3) goalsCompleted++;
            if(sixCoinGiven) goalsCompleted++;
            if(itemsPurchased >= 3) goalsCompleted++;
            if(sixesRolled >= 3) goalsCompleted++;
            data.it.tags.counters = goalsCompleted;
            if(goalsCompleted >= 4)
            {
                for(const player of game.players) {
                    game.gainTreasure(player, 2);
                }
                game.discard = originalDiscard; // Restore original discard function
                game.discard(data.it);
            }
        }

        let offLootPlayed: (() => void) | null = null;
        let offMonsterKilled: (() => void) | null = null;
        let offPurchase: (() => void) | null = null;
        let offRoll: (() => void) | null = null;
        let offDonation: (() => void) | null = null;

        offLootPlayed = game.emitter.on("on:loot:added:after", (eventData) => {
            lootPlayed++;
            tryResolve();
        });

        offMonsterKilled = game.emitter.on("on:death:monster", (eventData) => {
            monstersKilled++;
            tryResolve();
        });

        offPurchase = game.emitter.on("on:purchase:success", (eventData) => {
            itemsPurchased++;
            tryResolve();
        });

        offRoll = game.emitter.on("on:dice:resolved", (eventData) => {
            const { diceRoll } = eventData;
            if(diceRoll.value === 6) {
                sixesRolled++;
                tryResolve();
            }
        });

        offDonation = game.emitter.on("on:coin:given", (eventData) => {
            const { eventIssuer, amount, target } = eventData;
            if(amount >= 6) {
                sixCoinGiven = true;
                tryResolve();
            }
        });

        return true;
    }
}

export function playersCanOnlyActivateOnceATurn(game: Game): EffectFunction {
    return (data: EffectData) => {
        let offActivate: (() => void) | null = null;
        let offStartTurn: (() => void) | null = null;
        let playersWhoActivatedThisTurn: Player[] = [];

        offStartTurn = game.emitter.on("on:turn:start", (eventData) => {
            playersWhoActivatedThisTurn = [];
        });
        offActivate = game.emitter.on("on:item:activated", (eventData) => {
            const { eventIssuer } = eventData;
            eventIssuer.addToCanIActivateThisTurn(1);
            playersWhoActivatedThisTurn.push(eventIssuer);
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offActivate?.();
            offActivate = null;
            for(const player of playersWhoActivatedThisTurn) {
                player.addToCanIActivateThisTurn(-1);
            }
            offStartTurn?.();
            offStartTurn = null;
            playersWhoActivatedThisTurn = []
        });
        return true;
    };
}

export function playersCanOnlyPlayLootOnceATurn(game: Game): EffectFunction {
    return (data: EffectData) => {
        let offPlayLoot: (() => void) | null = null;
        let offStartTurn: (() => void) | null = null;
        let playersWhoPlayedLootThisTurn: Player[] = [];

        offStartTurn = game.emitter.on("on:turn:start", (eventData) => {
            playersWhoPlayedLootThisTurn = [];
        });
        offPlayLoot = game.emitter.on("on:loot:played", (eventData) => {
            const { eventIssuer } = eventData;
            eventIssuer.addToCanIUseLootThisTurn(1);
            playersWhoPlayedLootThisTurn.push(eventIssuer);
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleaners.push(() => {
            offPlayLoot?.();
            offPlayLoot = null;
            for(const player of playersWhoPlayedLootThisTurn) {
                player.addToCanIUseLootThisTurn(-1);
            }
            offStartTurn?.();
            offStartTurn = null;
            playersWhoPlayedLootThisTurn = []
        });
        return true;
    };
}

export function payOtherPlayersToAttackEffect(game: Game, amount: number): EffectFunction {
    return (data: EffectData) => {
        let offCanDeclareAttack: (() => void) | null = null;
        let offAttackDeclared: (() => void) | null = null;

        function getTaxForMostSoulsAttack(game: Game, player: Player, amount: number): number {
            const maxSoul = Math.max(...game.players.map(p => p.totalSouls));
            if (maxSoul === 0) {
                return 0;
            }
            if (player.totalSouls < maxSoul) {
                return 0;
            }
            return amount * Math.max(0, game.players.length - 1);
        }
        
        offCanDeclareAttack = game.emitter.on("on:can:declare:attack", (eventData) => {
            const { eventIssuer } = eventData;
            const requiredCoins = getTaxForMostSoulsAttack(game, eventIssuer, amount);
            if (requiredCoins === 0) {
                return;
            }
            if (eventIssuer.coins < requiredCoins) {
                eventData.canDeclare[0] = false;
                eventData.reason[0] = `You must pay ${requiredCoins}¢ to attack, but you only have ${eventIssuer.coins}¢.`;
            }
        });

        offAttackDeclared = game.emitter.on("on:attack:declared", async (eventData) => {
            const { eventIssuer } = eventData;
            const requiredCoins = getTaxForMostSoulsAttack(game, eventIssuer, amount);
            if (requiredCoins > 0)
            {
                const effect: EffectFunction = async (effectData: EffectData) => {
                    for(const player of game.players) {
                        if(player !== eventIssuer)
                            game.giveCoins(eventIssuer, player, amount, true);
                    }
                    return true;
                };
                addPassiveEffectToStack(game, effect, data, `Pay each other player ${amount}¢ to attack.`);
            }
        });

        data.it.cleaners.push(() => {
            offCanDeclareAttack?.();
            offCanDeclareAttack = null;
            offAttackDeclared?.();
            offAttackDeclared = null;
        });

        return true;
    }
}
// export function playersWithFewestSoulsFreeShopItemEffect(game: Game): EffectFunction {
//     return (data: EffectData) => {
//         let offTurnStart: (() => void) | null = null;
//         let active = true;
//         offTurnStart = game.emitter.on("on:turn:start", (eventData) => {
//             active = false;
//         });

        
//         // Store cleanup function on the card for when it's removed/destroyed
//         data.it.cleaners.push(() => {
//             active = false;
//             offTurnStart?.();
//             offTurnStart = null;
//         });
//         return true;
//     };
// }