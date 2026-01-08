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
