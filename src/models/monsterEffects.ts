// A monster effect is an effect that is applied by a monster card.


import { DamageOnStack, DiceRoll, Player } from "./player";
import { type Card, LootCard, type EffectFunction, type TargetsSelector, ItemCard, MonsterCard, InplayType, BsoulCard, EffectData } from "./cards";
import { Game } from "./game";
import type { Entity } from "./entity";
import { effect } from "zod/v3";
import type { Stack, StackElement } from "./stack";
import { it } from "zod/locales";
import { effectParser, type ParsedEffect } from "./effectParser";
import { deckSelector, visibleItemSelector, inplayUnchargedItemSelector } from "./targetSelector";
// import { firstAttackRollStatModifierEffect, gainCoinsOnDamageEffect, gainPlusCoinsEffect, goFirstInTurnOrderEffect, LookAndPutBottomEffect, lootOnPlayerDeathEffect, preventDamageOnRollEffect, preventNextDamageUpToEffect, rollDiceOnTriggerEffect, startingItemEffect, temporaryStatModifierEffect, gainTreasureOnDeathEffect } from "./abilities";
import *  as passive from "./passiveEffect";
import type { BonusSoulCardType } from "@/types/cardTypes";
import { Monster } from "./monster";
import { string } from "zod";


export function monsterIncreaseEvasionEffect(game: Game, amount: number, exceptSelf: boolean): EffectFunction {
    return (data: EffectData) => {
        if (amount < 0)
            throw new Error("monsterIncreaseEvasionEffect amount must be non-negative.");
        // Apply the stat modification
        // const monster = game.encounters.
        if(!(data.issuer instanceof Monster))
            throw new Error("monsterIncreaseEvasionEffect can only be applied to monsters.");

        game.addDCmodifier(data.issuer, amount);
        if(exceptSelf)
            data.issuer.addAttackDiceModifier( -amount);
        
        data.it.cleaners.push(() => {
        game.addDCmodifier(data.issuer, -amount);
        if(exceptSelf)
            data.issuer.addAttackDiceModifier( amount);
        });
        return true;
    };
}
