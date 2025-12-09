import { DiceRoll, Player } from "./player";
import { type Card, type LootCard, type EffectFunction, type TargetsSelector, ItemCard, InplayType } from "./cards";
import { Game } from "./game";
import type { Entity } from "./entity";
import { effect } from "zod/v3";
import type { Stack, StackElement } from "./stack";// One-shot shield: prevent up to `amount` damage on the next instance to issuer this turn
export function preventNextDamageUpToEffect(amount: number, game: Game): EffectFunction {
    return (it: Card, issuer: Player, targets: any[]) => {
        let offDamage: (() => void) | null = null;
        let offTurn: (() => void) | null = null;

        const cleanup = () => {
            offDamage?.();
            offTurn?.();
            offDamage = null;
            offTurn = null;
        };

        // Listen for the next damage event on this player
        offDamage = game.emitter.on("on:damage:would-take", ({ issuer: victim, damageArray }) => {
            if (targets[0] !== victim) return;
            const current = damageArray[0] ?? 0;
            const prevented = Math.min(current, amount);
            damageArray[0] = current - prevented;
            cleanup(); // One-shot: remove listeners after first use
        });

        // Expire at end of turn if unused
        offTurn = game.emitter.on("on:turn:end", cleanup);

        return true;
    };
}