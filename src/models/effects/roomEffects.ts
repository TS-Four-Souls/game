// A room effect is an effect that is applied by a room card.


import { Game } from "../game";
import { EffectData, type EffectFunction } from "../types/cardTypes";
import { Player } from "../player";
import { Card, LootCard, MonsterCard, TreasureCard, ItemCard } from "../cards";
import type { OnAttackDeclaredTopDeckData, OnDeathMonsterData } from "../types/eventTypes";
import { flushMonsterSlotsEffect } from "./activeEffect";
import { addPassiveEffectToStack } from "./passiveEffect";
import { visibleItemSelector } from "../targetSelector";
import type { Monster } from "../monster";
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