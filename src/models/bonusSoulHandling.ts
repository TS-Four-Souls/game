import { type Card, BsoulCard, ItemCard } from "./cards";
import { Game } from "./game";
import type {
    OnCoinGainedData,
    OnEnterPlayAfterData,
    OnLootAddedAfterData,
} from "./types/eventTypes";
export type OffEffectFunction = () => void;

// Bsouls are particular for several reasons.
// First, they are not owned by players.
// Their trigger and effect is also unique.
// Therefore, they are not put in the effect file, but handled specifically here.
// Furthermore, their effect is parsed on game start rather than on deck creation.

export function bSoulEffectParser(card: BsoulCard, game: Game): OffEffectFunction {
    const s = card.effectOutcomes[0]!;
    if (!s || card.effectOutcomes.length > 1)
        throw new Error("Invalid Bonus Soul effect: " + s);
    switch (s) {
        case "The first player to have 10 or more loot cards in their hand gains this soul.":
            return soulOfGluttonyEffect(game, card);
        case "The first player to have 25\u00A2 or more gains this soul.":
            return soulOfGreedEffect(game, card);
        case "The first player to control 2 or more guppy items gains this soul.":
            return soulOfGuppyEffect(game, card);
    }
    throw new Error("Unknown Bonus Soul effect: " + s);
}


function soulOfGluttonyEffect(game: Game, card: Card): OffEffectFunction {

    let offEffect: (() => void) | null = null;

    const cleanup = () => {
        offEffect?.();
        offEffect = null;
    };

    // Listen for the next damage event on this player
    offEffect = game.emitter.on("on:loot:added:after", (eventData: OnLootAddedAfterData) => {
        const { eventIssuer, card: lootCard } = eventData;
        if (eventIssuer.hand.length < 10) return;
        game.addSoul(eventIssuer, card);
        cleanup();
    });
    return offEffect;
}

function soulOfGreedEffect(game: Game, card: Card): OffEffectFunction {
    let offEffect: (() => void) | null = null;

    const cleanup = () => {
        offEffect?.();
        offEffect = null;
    };

    // Listen for the next damage event on this player
    offEffect = game.emitter.on("on:coin:gained:after", (eventData: OnCoinGainedData) => {
        const { eventIssuer, coinGained } = eventData;
        if (eventIssuer.coins < 25) return;
        game.addSoul(eventIssuer, card);
        cleanup();
    });
    return offEffect;
}

function soulOfGuppyEffect(game: Game, card: Card): OffEffectFunction {
    let offEffect: (() => void) | null = null;

    const cleanup = () => {
        offEffect?.();
        offEffect = null;
    };

    // Listen for the next damage event on this player
    offEffect = game.emitter.on("on:enter:play:after", (eventData: OnEnterPlayAfterData) => {
        const { eventIssuer, card: item } = eventData;
        if (eventIssuer.inPlay.filter((c: Card) => c instanceof ItemCard && c.isGuppy()).length < 2)
            return;
        game.addSoul(eventIssuer, card);
        cleanup();
    });
    return offEffect;
}