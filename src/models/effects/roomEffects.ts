// A room effect is an effect that is applied by a room card.


import { Game } from "../game";
import { EffectData, type EffectFunction } from "../types/cardTypes";
import { Player } from "../player";
import { Card } from "../cards";
import type { OnAttackDeclaredTopDeckData } from "../types/eventTypes";
import { addPassiveEffectToStack } from "./passiveEffect";

export function preventGainSoulsEffect(game: Game): EffectFunction {
    return (data: EffectData) => {
        const addSoul = game.addSoul;
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