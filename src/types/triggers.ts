import { Player } from "@/models/player";
import { Monster } from "@/models/monster";
import { Card, type EffectFunction } from "@/models/cards";

export type TriggerEvent =
    | "on:death:would-death"
    | "on:death:before-penalty"
    | "on:death:after-penalty"
    | "on:damage:taken"
    | "on:damage:taken:first-time-each-turn"
    | "on:damage:would-take"
    | "on:combatdamage:dealt:to-monster"
    | "on:combatdamage:dealt:to-player"
    | "on:attack:declared"
    | "on:attack:roll:first-time-each-turn"
    | "on:attack:roll"
    | "on:coin:gained"
    | "on:dice:rolled"
    | "on:dice:would-roll"
    | "on:turn:start"
    | "on:turn:end"
    | "on:loot:step"
    | "on:item:activated"
    | "on:item:purchase"
    | "on:item:destroyed"
    | "on:enter:play"
    | "on:your:turn"
    | "on:monster:died"
    | "on:game:start:before"
    | "on:game:start";


export interface Ability {
    id: string;
    card: Card;
    trigger: TriggerEvent;
    effect: EffectFunction;
    scope: "owner" | "player" | "monster" | "this"; // who this applies to
    owner: Player | Monster | Card | null; // the entity that owns this ability
    isActive: boolean;
}

export interface AbilityListener {
    onTrigger(event: TriggerEvent, data: any): void;
}


// const triggers = [
//     ["When you die, before paying penalties", ["owner", "on death before penalty"]],
//     ["Each time you die, before paying penalties", ["owner", "on death before penalty"]],
//     ["Each time you die, after paying penalties", ["owner", "on death after penalty"]],
//     ["Each time you take damage", ["owner", "on damage taken"]],
//     ["Each time you declare an attack", ["owner", "on attack declared"]],
//     ["If you would gain any amount of ¢", ["owner", "on coin gain"]],
//     ["Each time a player rolls a ", ["player", "on roll"]],
//     ["Each time a player would roll a ", ["player", "on would roll"]],
//     ["At the start of your turn", ["owner", "on start of turn"]],
//     ["Damage you would take", ["owner", "on would take damage"]],
//     ["If you would take damage ", ["owner", "on would take damage"]],
//     ["Each time you would take damage", ["owner", "on would take damage"]],
//     ["If you would take any amount of damage", ["owner", "on would take damage"]],
//     ["At the end of your turn", ["owner", "on end of turn"]],
//     ["Each time you would die", ["owner", "on would death"]],
//     ["If another player would pay the death penalty", ["another player", "on would death"]],
//     ["When you would die", ["Owner", "on would death"]],
//     ["during your loot step", ["owner", "on loot step"]],
//     ["When you would roll a ", ["owner", "on would roll"]],
//     ["Each time you activate an item", ["owner", "on item activation"]],
//     ["Shop items you purchase", ["owner", "on purchase"]],
//     ["if this would be destroyed", ["this", "on destruction"]],
//     ["The first time you take damage each turn", ["owner", "on first time damage taken each turn"]],
//     ["Each time a monster dies", ["monster", "on death"]],
//     ["your first attack roll", ["owner", "on first attack roll each turn"]],
//     ["Each time you roll an attack roll", ["owner", "on attack roll"]],
//     ["Each time a player dies", ["player", "on death before penalty"]],
//     ["on your turn", ["owner", "on your turn"]],
//     ["[Tap Effect]", ["owner", "on activate"]],
//     ["[Paid Effect]", ["owner", "on pay"]],
//     ["This item starts", ["this", "on enter play"]],
//     ["This enters play", ["this", "on enter play"]],
//     ["When this enters play", ["this", "on enter play"]],
//     ["Each time you deal combat damage to a monster", ["owner", "on combat damage dealt to monster"]],
//     ["If you would gain any number of ¢", ["Owner", "on coin gain"]],
//     ["If you control this as the game starts", ["Owner", "on before game start"]],
//     ["When you start the game", ["Owner", "on game start"]]
// ];

    `
    // | "on:death:would-death"
    // | "on:death:before-penalty"
    // | "on:death:after-penalty"
    // | "on:damage:taken"
    // | "on:damage:taken:first-time-each-turn"
    // | "on:damage:would-take"
    // | "on:combatdamage:dealt:to-monster"
    // | "on:combatdamage:dealt:to-player"
    // | "on:attack:declared"
    // | "on:attack:roll:first-time-each-turn"
    // | "on:attack:roll"
    // | "on:coin:gained"
    // | "on:dice:rolled"
    // | "on:dice:would-roll"
    // | "on:turn:start"
    // | "on:turn:end"
    // | "on:loot:step"
    // | "on:item:activated"
    // | "on:item:purchased"
    // | "on:item:destroyed"
    // | "on:enter:play"
    // | "on:your:turn"
    // | "on:monster:died"
    // | "on:game:start:before"
    // | "on:game:start";
    `