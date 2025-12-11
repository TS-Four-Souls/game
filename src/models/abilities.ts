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
        offDamage = game.emitter.on("on:damage:would-take", ({ eventIssuer, damageArray }) => {
            if (targets[0] !== eventIssuer) return;
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

// Temporary stat modifier: adds value to a stat until end of turn
export function temporaryStatModifierEffect(
    adders: ((player: Player, value: number) => void)[],
    amount: number,
    game: Game
): EffectFunction {
    return (it: Card, issuer: Player, targets: any[]) => {
        if(amount < 0)
            throw new Error("temporaryStatModifierEffect amount must be non-negative.");
        // Apply the stat modification
        const target = targets[0] === undefined ? issuer : targets[0];
        for(const adder of adders)
            adder(target, amount);
        
        // Register cleanup to reverse at end of turn
        let offTurn = game.emitter.on("on:turn:end", () => {
            for(const adder of adders)
                adder(target, -amount);
            offTurn();
        });

        return true;
    };
}


// gain coins on damage taken.
export function gainCoinsOnDamageEffect(
    amount: number,
    game: Game
): EffectFunction {
    return (it: Card, issuer: Player, targets: any[]) => {
        let offDamage: (() => void) | null = null;

        const cleanup = () => {
            offDamage?.();
            offDamage = null;
        };

        // Listen for damage events on this player
        offDamage = game.emitter.on("on:damage:taken", ({ eventIssuer, target: dealer, abilityCard: usingAbilityFrom, damage: dmg }) => {
            if (issuer !== eventIssuer) return;
            if (dmg <= 0) return;
            game.gainCoins(issuer, amount);
        }); 

        // Store cleanup function on the card for when it's removed/destroyed
        it.cleanup = () => {
            cleanup();
        }

        return true;
    };
}

// "Each time a player dies, before paying penalties, loot 1."
export function lootOnPlayerDeathEffect(
    amount: number,
    game: Game
): EffectFunction {
    return (it: Card, issuer: Player, targets: any[]) => {
        let offDeath: (() => void) | null = null;

        const cleanup = () => {
            offDeath?.();
            offDeath = null;
        };

        // Listen for damage events on this player
        offDeath = game.emitter.on("on:death:before-penalty", ({ eventIssuer, target: from, abilityCard: usingAbilityFrom, damage: dmg }) => {
            if (eventIssuer instanceof Player) {
                game.loot(issuer, amount);
            }
        });

        // Store cleanup function on the card for when it's removed/destroyed
        it.cleanup = () => {
            cleanup();
        }

        return true;
    };
}
// If you would gain any number of ¢, gain that much + amount¢ instead.
export function gainPlusCoinsEffect(
    amount: number,
    game: Game
): EffectFunction {
    return (it: Card, issuer: Player, targets: any[]) => {
        let onCainCoin: (() => void) | null = null;

        const cleanup = () => {
            onCainCoin?.();
            onCainCoin = null;
        };

        // Listen for the next damage event on this player
        onCainCoin = game.emitter.on("on:coin:gained", ({ eventIssuer, coinGained }) => {
            if (issuer !== eventIssuer) return;
            const current = coinGained[0] ?? 0;
            coinGained[0] = current + amount;
        });
        
        // Store cleanup function on the card for when it's removed/destroyed
        it.cleanup = () => {
            cleanup();
        }

        return true;
    };
}
