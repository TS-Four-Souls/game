import { DiceRoll, Player } from "./player";
import { type Card, type EffectData, type LootCard, type EffectFunction, type TargetsSelector, ItemCard, InplayType } from "./cards";
import { Game } from "./game";
import type { Stack, StackElement } from "./stack";// One-shot shield: prevent up to `amount` damage on the next instance to issuer this turn
import type { TriggerEvent } from "@/types/triggers";

export function preventNextDamageUpToEffect(amount: number, game: Game): EffectFunction {
    return (data:EffectData) => {
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
            if (data.targets[0] !== eventIssuer) return;
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

// 1 turn stat modifier: adds value to a stat until end of turn
export function temporaryStatModifierEffect(
    adders: ((player: Player, value: number) => void)[],
    amount: number,
    game: Game
): EffectFunction {
    return (data:EffectData) => {
        if(amount < 0)
            throw new Error("temporaryStatModifierEffect amount must be non-negative.");
        // Apply the stat modification
        const target = data.targets[0] === undefined ? data.issuer : data.targets[0];
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

// First attack roll stat modifier: adds value to a stat until end of turn
export function firstAttackRollStatModifierEffect(
    damageDealtModifier: number=0,
    damageReceivedModifier: number=0,
    evasionModifier: number=0,
    game: Game
): EffectFunction {
    return (data:EffectData) => {
        let offAttack: (() => void) | null = null;

        const cleanup = () => {
            offAttack?.();
            offAttack = null;
        };
        // Register cleanup to reverse at end of turn
        offAttack = game.emitter.on("on:attack:roll:first-time-each-turn", ({ eventIssuer, target, damageDealt, damageReceived, evasion } ) => {
            if (data.issuer !== eventIssuer) return;
            damageDealt[0]! += damageDealtModifier;
            damageReceived[0]! += damageReceivedModifier;
            evasion[0]! += evasionModifier;
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleanup = () => {
            cleanup();
        }
        return true;
    };
}

// gain coins on damage taken.
export function gainCoinsOnDamageEffect(
    amount: number,
    game: Game
): EffectFunction {
    return (data:EffectData) => {
        let offDamage: (() => void) | null = null;

        const cleanup = () => {
            offDamage?.();
            offDamage = null;
        };

        // Listen for damage events on this player
        offDamage = game.emitter.on("on:damage:taken", ({ eventIssuer, target: dealer, abilityCard: usingAbilityFrom, damage: dmg }) => {
            if (data.issuer !== eventIssuer) return;
            if (dmg <= 0) return;
            game.gainCoins(data.issuer, amount);
        }); 

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleanup = () => {
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
    return (data:EffectData) => {
        let offDeath: (() => void) | null = null;

        const cleanup = () => {
            offDeath?.();
            offDeath = null;
        };

        // Listen for damage events on this player
        offDeath = game.emitter.on("on:death:before-penalty", ({ eventIssuer, target: from, abilityCard: usingAbilityFrom, damage: dmg }) => {
            if (eventIssuer instanceof Player) {
                game.loot(data.issuer, amount);
            }
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleanup = () => {
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
    return (data:EffectData) => {
        let offGainCoin: (() => void) | null = null;

        const cleanup = () => {
            offGainCoin?.();
            offGainCoin = null;
        };

        // Listen for the next damage event on this player
        offGainCoin = game.emitter.on("on:coin:gained", ({ eventIssuer, coinGained }) => {
            if (data.issuer !== eventIssuer) return;
            const current = coinGained[0] ?? 0;
            coinGained[0] = current + amount;
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleanup = () => {
            cleanup();
        }

        return true;
    };
}

// Look at the top card of a deck. You may put it back.
export function LookAndPutBottomEffect(
    deckName: string,
    game: Game
): EffectFunction {
    return (data:EffectData) => {
        let offEffect: (() => void) | null = null;

        const cleanup = () => {
            offEffect?.();
            offEffect = null;
        };

        // Listen for the next damage event on this player
        offEffect = game.emitter.on("on:turn:start", ({ eventIssuer, coinGained }) => {
            if (data.issuer !== eventIssuer) return;
            const deck = game.decks[deckName];
            if (!deck) {
                throw new Error(`Deck ${deckName} does not exist.`);
            }
            const topCard = deck.draw();
            const res = game.select(data.issuer, 1, [topCard], true);
            if (res.selected.length > 0) {
                deck.addBottomPosition(topCard);
            } else {
                deck.addTopPosition(topCard);
            }   
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleanup = () => {
            cleanup();
        }

        return true;
    };
}

// Roll dice on trigger
export function rollDiceOnTriggerEffect(
    diceRollEffect: EffectFunction,
    triggerEvent: TriggerEvent,
    game: Game
): EffectFunction {
    return (data:EffectData) => {
        let offEffect: (() => void) | null = null;

        const cleanup = () => {
            offEffect?.();
            offEffect = null;
        };

        // Listen for the next damage event on this player
        offEffect = game.emitter.on(triggerEvent, ({ eventIssuer }) => {
            // if(_eventIssuer !== null && eventIssuer !== _eventIssuer) return;
            if (data.issuer !== eventIssuer) return;
            diceRollEffect(data);
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleanup = () => {
            cleanup();
        }
        return true;
    };
}

// Roll dice on trigger
export function preventDamageOnRollEffect(
    diceValues: number[],
    damagePrevented: number,
    game: Game
): EffectFunction {
    return (data:EffectData) => {
        let offEffect: (() => void) | null = null;

        const cleanup = () => {
            offEffect?.();
            offEffect = null;
        };

        // Listen for the next damage event on this player
        offEffect = game.emitter.on("on:damage:would-take", ({ eventIssuer, damageArray }) => {
            if (data.issuer !== eventIssuer) return;
            const roll:DiceRoll = game.rollDice(data.issuer, false);
            const effects: EffectFunction[] = new Array<EffectFunction>(6).fill((data:EffectData) => { return true; });
            for (const val of diceValues) {
                effects[val - 1] = (data:EffectData) => { 
                    damageArray[0]! -= damagePrevented; 
                    return true; 
                };
            }
            roll.attachEffect(effects, data.it, []);
        });

        // Store cleanup function on the card for when it's removed/destroyed
        data.it.cleanup = () => {
            cleanup();
        }
        return true;
    };  
}

export function goFirstInTurnOrderEffect(game: Game): EffectFunction {
    return (data:EffectData) => {
        let offEffect: (() => void) | null = null;

        const cleanup = () => {
            offEffect?.();
            offEffect = null;
        };

        // Listen for the next damage event on this player
        offEffect = game.emitter.on("on:game:start:before", () => {
            game.turnHandler.setFirstPlayer(data.issuer);
            cleanup();
        });
        return true;
    };
}