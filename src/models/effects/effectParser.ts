import * as active from "./activeEffect";
import { Card, EffectOnStack, ItemCard, LootCard, LootCardEffect, MonsterCard, MonsterType } from "../cards";
import { Game } from "../game";
import * as monster from "./monsterEffects";
import * as passive from "./passiveEffect";
import * as room from "./roomEffects";
import { Player } from "../entities/player";
import { DiceRoll } from "../stackElement";
import { activeEntitySelector, anotherPlayerSelector, deckSelector, inAnotherplayItemSelector, inplayCurseSelector, itemAndSoulSelector as itemAndSoulSelector, inplayItemSelector, inplayUnchargedItemSelector, playerSelector, rollSelector, stackElementSelector, topAnyDiscardSelector, visibleItemSelector, YourItemSelector } from "../targetSelector";
import { EffectData, type DeckType, type EffectFunction, type TargetsSelector } from "../types/cardTypes";
import type { OnCounterModifiedData, OnDeathBeforePenaltyData, OnDeathMonsterData, OnEnterPlayData } from "../types/eventTypes";
import { Monster } from "../entities/monster";

const INFINITY = 999999;
/**
 * Represents a parsed effect with both its execution function and target selectors.
 * This unified structure eliminates the need to parse effect strings twice.
 */
export type ParsedEffect = {
    effectFunction: EffectFunction;
    targetSelectors: TargetsSelector[];
};

export class NumberRobustString extends String {
    private readonly _raw: string;
    private readonly _masked: string;
    private readonly _numbers: number[];
    private _normalizedMasked: string | null = null;
    private _index = 0;

    constructor(raw: string) {
        const { masked, numbers } = NumberRobustString.maskNumbers(raw);
        super(masked);
        this._raw = raw;
        this._masked = masked;
        this._numbers = numbers;
    }

    /** Original, unmasked string that the numbers were extracted from. */
    get raw(): string {
        return this._raw;
    }

    /** Extracted numbers, in encounter order. */
    get numbers(): number[] {
        return this._numbers;
    }

    /** Masked string with numbers replaced by x. */
    get masked(): string {
        return this._masked;
    }

    /** Normalized masked string for pattern matching. Cached because it is queried a lot. */
    get normalizedMasked(): string {
        if (this._normalizedMasked === null) {
            this._normalizedMasked = normalizeMaskedForMatch(this._masked);
        }
        return this._normalizedMasked;
    }

    /** Stateful iterator-style accessor (kept for convenience). */
    nextNumber(): number {
        if (this._index >= this._numbers.length)
            throw new Error("No more numbers available in the string");
        return this._numbers[this._index++]!;
    }

    resetIndex(): void {
        this._index = 0;
    }

    /**
     * Returns the raw remainder after a masked prefix.
     * The prefix is expressed in the masked form (numbers replaced by 'x').
     */
    restAfter(maskedPrefix: string): string | null {
        const masked = this._masked;
        if (!masked.startsWith(maskedPrefix)) return null;
        const rawEndIndex = NumberRobustString.rawIndexAfterMaskedPrefix(this._raw, maskedPrefix.length);
        return this._raw.slice(rawEndIndex);
    }

    private static rawIndexAfterMaskedPrefix(raw: string, maskedPos: number): number {
        if (maskedPos <= 0) return 0;

        let rawIndex = 0;
        let maskedIndex = 0;

        while (rawIndex < raw.length && maskedIndex < maskedPos) {
            const ch = raw[rawIndex]!;
            if (ch >= "0" && ch <= "9") {
                maskedIndex++;
                while (rawIndex < raw.length) {
                    const digit = raw[rawIndex]!;
                    if (digit < "0" || digit > "9") break;
                    rawIndex++;
                }
                continue;
            }

            maskedIndex++;
            rawIndex++;
        }

        return rawIndex;
    }

    private static maskNumbers(raw: string): { masked: string; numbers: number[] } {
        const numbers: number[] = [];
        let masked = "";

        let cursor = 0;
        for (const match of raw.matchAll(/\d+/gu)) {
            const start = match.index ?? 0;
            const digits = match[0]!;
            const end = start + digits.length;

            if (cursor < start) {
                masked += raw.slice(cursor, start);
            }

            const parsed = Number(digits);
            if (!Number.isNaN(parsed)) numbers.push(parsed);

            masked += "x";
            cursor = end;
        }

        if (cursor < raw.length) {
            masked += raw.slice(cursor);
        }

        return { masked, numbers };
    }
}

const normalizedPatternCache = new Map<string, string>();

function normalizePatternForMatch(pattern: string): string {
    const cached = normalizedPatternCache.get(pattern);
    if (cached !== undefined) return cached;
    const normalized = normalizeMaskedForMatch(pattern);
    normalizedPatternCache.set(pattern, normalized);
    return normalized;
}

function normalizeMaskedForMatch(s: string): string {
    // Keep internal punctuation, but ignore trailing punctuation variants (.,?,!) so we can match e.g. "loot 3" and "loot 3.".
    // Also normalize leading plus signs before masked numbers so existing `x` patterns still match `+x` text,
    // while preserving `-x` for cases that need to treat a negative sign explicitly.
    return s
        .trim()
        .replace(/(^|[^\w])\+\s*x/gu, "$1x")
        .replace(/\s*[.?!,]+$/gu, "")
        .trim();
}

function maskedEqualsAny(nr: NumberRobustString, patterns: readonly string[]): boolean {
    const m = nr.normalizedMasked;
    return patterns.some((p) => normalizePatternForMatch(p) === m);
}

function numberAtIfMaskedEqualsAny(nr: NumberRobustString, patterns: readonly string[], index = 0): number | null {
    if (!maskedEqualsAny(nr, patterns)) return null;
    return nr.numbers[index] ?? null;
}

function numberAtOrThrow(nr: NumberRobustString, index: number, context: string): number {
    const n = nr.numbers[index];
    if (n === undefined)
        throw new Error(`Expected number #${index + 1} while parsing '${context}', but none was found in: ${nr.raw}`);
    return n;
}

function parseLvXEffect(s: string, game: Game, nr?: NumberRobustString): ParsedEffect {
    nr = nr ?? new NumberRobustString(s);
    const lvl = nr.nextNumber();
    const effectString = s.substring(s.indexOf("]") + 1).trim();

    return {
        effectFunction: passive.lvlXaddListenerEffect([effectParser(effectString, game, ()=>{throw new Error("Failed to parse effect");}, true, [false]).effectFunction], lvl, game),
        targetSelectors: noTargets,
    };
}
/**
 * Common selector helpers for effect parsing.
 * These are module-scope functions that create selector arrays on demand.
 */

/**
 * Helper function to create a TargetsSelector with default values.
 */
const createSelector = (
    description: string,
    selector: (player: Player, card: Card) => any[],
    min: number = 1,
    max: number = 1,
): TargetsSelector => ({ description, selector, min, max });

const noTargets: TargetsSelector[] = [];

const selectPlayer = (game: Game, min: number = 1, max: number = min): TargetsSelector[] => 
    [createSelector("Choose a player", playerSelector(() => true, game), min, max)];

const selectAlivePlayer = (game: Game, min: number = 1, max: number = min): TargetsSelector[] => 
    [createSelector("Choose a player", playerSelector((player) => !player.isDead, game), min, max)];

const selectXCardsFromDiscard = (game: Game, type: DeckType, min: number = 1, max: number = min, filter?: (card: Card) => boolean): TargetsSelector[] =>
[createSelector(`Choose ${min === max ? min : `up to ${max}`} ${type} card${max > 1 ? "s" : ""} in discard`, (issuer: Player) => {
    return game.decks[type].discard.filter(card => filter ? filter(card) : true);
})];

export const selectAliveNonActivePlayer = (game: Game, min: number = 1, max: number = min): TargetsSelector[] => 
    [createSelector("Choose a player", playerSelector((player) => !player.isDead && player !== game.currentPlayer, game), min, max)];

const selectAnotherPlayer = (game: Game, min: number = 1, max: number = min): TargetsSelector[] => 
    [createSelector("Choose another player", anotherPlayerSelector(() => true, game), min, max)];

const selectMonsterBeingAttacked = (game: Game, min: number = 1, max: number = min): TargetsSelector[] =>
    [createSelector("Choose a monster being attacked", (issuer: Player) => game.monsters.filter(m => m.isEngagedInCombat), min, max)];

const selectMonsterNotBeingAttacked = (game: Game, min: number = 1, max: number = min): TargetsSelector[] =>
    [createSelector("Choose a monster not being attacked", (issuer: Player) => game.monsters.filter(m => !m.isEngagedInCombat), min, max)];

const selectMonster = (game: Game, min: number = 1, max: number = min): TargetsSelector[] => 
    [createSelector("Choose a monster", (issuer: Player) => game.monsters, min, max)];

const selectAttackableMonster = (game: Game, min: number = 1, max: number = min): TargetsSelector[] => 
    [createSelector("Choose a monster", (issuer: Player) => game.monsters.filter(m => m.attackable), min, max)];

const selectPassiveAbilityOrMonsterAbility = (game: Game, min: number = 1, max: number = min): TargetsSelector[] =>
    [createSelector("Choose a triggered ability of a monster or non-eternal item.", (issuer: Player) => { 
        return game.stack.elements.filter(e => 
            e instanceof EffectOnStack 
            && ((e.data.it instanceof ItemCard && e.isReorderable) || e.data.it instanceof MonsterCard))
    }, min, max)];
export const selectCardInPlayOrLootBeingPlayed = (game: Game, min: number = 1, max: number = min): TargetsSelector[] =>
    [createSelector("Choose a card in play or a loot being played", (issuer: Player) => {
        const inPlayCards = game.players.flatMap(p => p.inPlay);
        const lootOnStack = game.stack.elements.filter(e => e.json.type === "LootCardEffect");
        return [...inPlayCards, ...lootOnStack];
    }, min, max)];

export const selectPlayerOrMonster = (game: Game, min: number = 1, max: number = min): TargetsSelector[] => 
    [createSelector("Choose a player or monster", activeEntitySelector(() => true, game), min, max)];

const selectDeck = (game: Game, min: number = 1, max: number = min, filter?: (name: string) => boolean): TargetsSelector[] => 
    [createSelector("Select a deck", deckSelector(filter || (() => true), game), min, max)];

const selectTopAnyDiscard = (game: Game, min: number = 1, max: number = min): TargetsSelector[] =>
    [createSelector("Select the top card of any discard pile", topAnyDiscardSelector(() => true, game), min, max)];

const selectRoll = (game: Game, min: number = 1, max: number = min): TargetsSelector[] => 
    [createSelector("Choose a dice roll", rollSelector(() => true, game), min, max)];

const selectRollAndNumber = (game: Game, numbers: number[], min: number = 1, max: number = min,  rollType: "attack" | "non-attack" | "any" = "any"): TargetsSelector[] => 
    [createSelector("Choose a dice roll", rollSelector((roll: DiceRoll) => {
        if (roll.attackRoll && rollType === "non-attack" || 
           !roll.attackRoll && rollType === "attack") {
            return false;
        }
        return true;
    }, game), min, max),
    createSelector(`Choose a number (${Math.min(...numbers)}-${Math.max(...numbers)})`, () => {
        return numbers;
    }, min, max)];


const selectItem = (game: Game, min: number = 1, max: number = min): TargetsSelector[] => 
    [createSelector("Select a rechargeable item", inplayUnchargedItemSelector(game), min, max)];

const selectCurse = (game: Game, min: number = 1, max: number = min): TargetsSelector[] => 
    [createSelector("Select a curse", inplayCurseSelector((player, card) => true, game), min, max)];

const selectNonEternalItem = (game: Game, min: number = 1, max: number = min): TargetsSelector[] => 
    [createSelector("Choose a non-eternal item", inplayItemSelector((player: Player, card: ItemCard) => card.eternal === false, game), min, max)];

const selectTapItem = (game: Game, min: number = 1, max: number = min): TargetsSelector[] => 
    [createSelector("Choose a tap item", inplayItemSelector((player: Player, card: ItemCard) => card.hasTapEffect(), game), min, max)];

const selectCharacterCardFromOutside = (game: Game, min: number = 1, max: number = min): TargetsSelector[] =>
    [createSelector("Choose a character card from outside the game", () => game.decks.character.cards, min, max)];

const selectShopItem = (game: Game, min: number = 1, max: number = min): TargetsSelector[] =>
[createSelector("Choose an item in the shop", (issuer: Player) => game.shop.itemsInShop.filter((slot) => slot !== undefined) as ItemCard[], min, max)];
const selectNonEternalItemOrASoul = (game: Game, min: number = 1, max: number = min): TargetsSelector[] => 
    [createSelector("Choose a non-eternal item or a soul", itemAndSoulSelector((player: Player, card: ItemCard) => card.eternal === false, game), min, max)];

const selectNonEternalTapItem = (game: Game, min: number = 1, max: number = min): TargetsSelector[] => 
    [createSelector("Choose a non-eternal item", visibleItemSelector((card: ItemCard, issuer: Player) => card.eternal === false && card.activeEffectList.length > 0 && card.hasTapEffect() && card.slug != "b2-placebo", false, game), min, max)];

const selectAnyTapItem = (game: Game, min: number = 1, max: number = min): TargetsSelector[] => 
    [createSelector("Choose any tap item", visibleItemSelector((card: ItemCard, issuer: Player) => card.activeEffectList.length > 0 && card.hasTapEffect(), false, game), min, max)];

const selectAnotherPlayerNonEternalItem = (game: Game, min: number = 1, max: number = min): TargetsSelector[] => 
    [createSelector("Choose another player's non-eternal item", inAnotherplayItemSelector((player: Player, card: ItemCard) => card.eternal === false, game), min, max)];

const selectNonEternalPassiveItem = (game: Game, min: number = 1, max: number = min): TargetsSelector[] => 
    [createSelector("Choose a non-eternal passive item", visibleItemSelector((card: ItemCard, issuer: Player) => card.eternal === false && card.activeEffectList.length === 0, false, game), min, max)];

const selectItemYouControl = (game: Game, min: number = 1, max: number = min): TargetsSelector[] => 
    [createSelector("Select an item you control", YourItemSelector((player: Player, card: ItemCard) => card.eternal === false, false, game), min, max)];

const selectEternalItemYouControl = (game: Game, min: number = 1, max: number = min): TargetsSelector[] => 
    [createSelector("Select an item you control", YourItemSelector((player: Player, card: ItemCard) => card.eternal === true, false, game), min, max)];

const selectAnotherItemYouControl = (game: Game, min: number = 1, max: number = min): TargetsSelector[] => 
    [createSelector("Select an item you control", YourItemSelector((player: Player, card: ItemCard) => card.eternal === false, true, game), min, max)];

const selectSoulYouControl = (game: Game, min: number = 1, max: number = min): TargetsSelector[] => 
    [createSelector("Destroy a soul you control", (issuer: Player) => issuer.souls, min, max)];

const selectNonEternalItemFromAnywhere = (game: Game, min: number = 1, max: number = min): TargetsSelector[] => 
    [createSelector("Select a non-eternal item from a player or from the shop", visibleItemSelector((card: ItemCard, issuer: Player) => card.eternal === false, false, game), min, max)];

const selectAnotherNonEternalItemFromAnywhere = (game: Game, min: number = 1, max: number = min): TargetsSelector[] => 
    [createSelector("Select a non-eternal item from a player or from the shop", visibleItemSelector((card: ItemCard, issuer: Player) => card.eternal === false, true, game), min, max)];

const selectAnotherItemFromAnywhere = (game: Game, min: number = 1, max: number = min): TargetsSelector[] => 
    [createSelector("Select a non-eternal item from a player or from the shop", visibleItemSelector((card: ItemCard, issuer: Player) => true, true, game), min, max)];


const selectPlayerWithMostSouls = (game: Game, min: number = 1, max: number = min): TargetsSelector[] => 
    [createSelector("Choose a player with the most souls or tied for the most", playerSelector((p) => p.souls.length === Math.max(...game.players.map(p => p.souls.length)), game), min, max)];

const selectRollAddOrSubtract = (game: Game, x: number): TargetsSelector[] => [
    createSelector("Choose a dice roll", rollSelector(() => true, game)),
    createSelector(`Choose to add or subtract ${x}`, (issuer: Player) => [x, -x])
];

const selectLootInYourHand = (game: Game, min: number = 1, max: number = min, selectionOnResolve: boolean = false): TargetsSelector[] => 
    selectionOnResolve ? noTargets :
    [createSelector("Select a loot card in your hand", (issuer: Player) => issuer.hand.cards, min, max)];

const selectUsableAbilityStackElement = (game: Game, min: number = 1, max: number = min): TargetsSelector[] => 
    [createSelector("Select the ↷ or $ ability of an item", stackElementSelector((element) => element instanceof EffectOnStack && element.data.it instanceof ItemCard && element.isReorderable === false, game), min, max)];

const selectStackElementOrLoot = (game: Game, min: number = 1, max: number = min): TargetsSelector[] => 
    [createSelector("Select the ↷ or $ ability of an item or a loot card on the stack", stackElementSelector((element) => element instanceof LootCardEffect || (element instanceof EffectOnStack && element.data.it instanceof ItemCard && element.isReorderable === false), game), min, max)];
const selectLootOnStack = (game: Game, min: number = 1, max: number = min): TargetsSelector[] =>
    [createSelector("Select a loot card on the stack", stackElementSelector((element) => element instanceof LootCardEffect, game), min, max)];
const selectNumber1to6 = (): TargetsSelector[] => 
    [createSelector("Choose a number (1-6)", () => [1, 2, 3, 4, 5, 6], 1, 1)];


function replaceDiceSymbols(s: string): string {
    return s
        .replace(/[❶➀]/g, "1")
        .replace(/[❷➁]/g, "2")
        .replace(/[❸➂]/g, "3")
        .replace(/[❹➃]/g, "4")
        .replace(/[❺➄]/g, "5")
        .replace(/[❻➅]/g, "6");
}

// Returns the numeric amount if matched, otherwise null
export function parseNumber(text: string, re: RegExp): number | null {
    const m = text.trim().match(re);
    return m ? Number(m[1]) : null;
}
export function parseText(text: string, re: RegExp): string {
    const m = text.trim().match(re);
    return m ? m[1]! : "";
}

export function eachTimeActivateItemEffect(s: string, game: Game): ParsedEffect {
    const restOfEffect = s.substring("each time a player activates an item, they".length).trim();
    const restParsed = effectParser(restOfEffect, game, active.addInPlayEffect(game), true);
    return {
        effectFunction: passive.onAnyEventEffect("on:item:activated", [restParsed.effectFunction], game, s),
        targetSelectors: restParsed.targetSelectors
    };
}

export function parseEachTimeRollEffect(s: string, game: Game, nr?: NumberRobustString): ParsedEffect {
    const numberRobustString = nr ?? new NumberRobustString(s);
    const masked = numberRobustString.toString();

    // Check for "each time the attacking player rolls an attack roll of X"
    const attackingPrefix = "each time the attacking player rolls an attack roll of x";
    if (masked.startsWith(attackingPrefix)) {
        const rollValue = numberRobustString.numbers[0]!;
        let restOfEffect = (numberRobustString.restAfter(attackingPrefix) ?? "").trim();
        if (restOfEffect.startsWith(",")) restOfEffect = restOfEffect.substring(1).trim();
        restOfEffect = restOfEffect.replace(/^they\b/iu, "").trim();
        if (restOfEffect.startsWith("may") ||
            restOfEffect.startsWith("must")
        )
        {
            restOfEffect = "you " + restOfEffect;
        }
        const restParsed = effectParser(restOfEffect, game, (data:EffectData) => {throw new Error("Not implemented");}, true);
        const diceIssueTheEvent = !restOfEffect.startsWith("this");
        return {
            effectFunction: passive.onAttackingPlayerRollEffect([rollValue], restParsed.effectFunction, game, diceIssueTheEvent),
            targetSelectors: restParsed.targetSelectors
        };
    }

    const theyPrefixes = [
        "each time a player rolls a x, they ",
        "each time a player rolls a x they ",
    ] as const;
    // If "you" is present, handling it requires having both you and they.
    // So far only "they must give you a loot card" is using it.
    const theyPrefix = theyPrefixes.find((p) => masked.startsWith(p));
    if (theyPrefix && !s.split(" ").includes("you")) {
        const rollValue = numberRobustString.numbers[0]!;
        let restOfEffect = (numberRobustString.restAfter(theyPrefix) ?? "").trim();
        if (restOfEffect.startsWith("may") ||
            restOfEffect.startsWith("must")
        )
        {
            restOfEffect = "you " + restOfEffect;
        }
        const restParsed = effectParser(restOfEffect, game, active.addInPlayEffect(game), true);
        return {
            effectFunction: passive.onRollEffect([rollValue], restParsed.effectFunction, game, true),
            targetSelectors: restParsed.targetSelectors
        };
    }

    const genericPrefix = "each time a player rolls a x";
    if (masked.startsWith(genericPrefix)) {
        const rollValue = numberRobustString.numbers[0]!;
        let restOfEffect = (numberRobustString.restAfter(genericPrefix) ?? "").trim();
        if (restOfEffect.startsWith(",")) restOfEffect = restOfEffect.substring(1).trim();
        const restParsed = effectParser(restOfEffect, game, active.addInPlayEffect(game), true);
        return {
            effectFunction: passive.onRollEffect([rollValue], restParsed.effectFunction, game),
            targetSelectors: restParsed.targetSelectors
        };
    }
    throw new Error(`Could not parse 'Each time a player rolls a X' effect: ${s}`);
}

export function parseWhenActivePlayerRollsEffect(s: string, game: Game, nr?: NumberRobustString): ParsedEffect {
    const numberRobustString = nr ?? new NumberRobustString(s);
    const masked = numberRobustString.toString();
    const prefix = "when the active player rolls a x";
    if (masked.startsWith(prefix)) {
        const rollValue = numberRobustString.numbers[0]!;
        let restOfEffect = (numberRobustString.restAfter(prefix) ?? "").trim();
        if (restOfEffect.startsWith(",")) restOfEffect = restOfEffect.substring(1).trim();
        const restParsed = effectParser(restOfEffect, game, active.addInPlayEffect(game), true);
        return {
            effectFunction: passive.onActivePlayerRollEffect([rollValue], restParsed.effectFunction, game),
            targetSelectors: restParsed.targetSelectors
        };
    }
    throw new Error(`Could not parse 'When the active player rolls a X' effect: ${s}`);
}

export function ParseWhenGainOrPurchaseThis(s: string, game: Game): ParsedEffect {
    const restOfEffect = s.substring("when you gain or purchase this, ".length).trim();
    const restParsed = effectParser(restOfEffect, game, active.addInPlayEffect(game), true);
    return noTargetEffect(passive.onYourEventEffect("on:enter:play:after", [restParsed.effectFunction], game, s, false, false, (effect: EffectData, event: OnEnterPlayData) => event.card === effect.it));
}

export function parseYouMayEffect(s: string, game: Game): ParsedEffect {
    const restOfEffect = s.substring("you may".length).trim();
    const shouldHandleYouMay = [true];
    const restParsed = effectParser(restOfEffect, game, active.addInPlayEffect(game), true, shouldHandleYouMay);
    return {
        effectFunction: async (data:EffectData) => {
            if (data.issuer instanceof Player === false) return false;
            let choice = !shouldHandleYouMay[0];
            if(!choice){
                const selection = await data.selectAndRecord(game, data.issuer, 0, 1, [data.it], "Use " + data.it.name + "'s effect?", false, true, false);
                choice = selection.selected.length > 0;
            }
            if (choice) {
                return restParsed.effectFunction(data);
            }
            return false;
        },
        targetSelectors: restParsed.targetSelectors
    };
}

export function parseAtTheEndOfYourTurnEffect(s: string, game: Game): ParsedEffect {
    const restOfEffect = s.substring("at the end of your turn, ".length).trim();
    const restParsed = effectParser(restOfEffect, game, active.addInPlayEffect(game), true);
    return {
        effectFunction: passive.onYourEventEffect("on:turn:end", [restParsed.effectFunction], game, s),
        targetSelectors: restParsed.targetSelectors
    };
}

export function parseWhenThisDiesEffect(s: string, game: Game): ParsedEffect {
    const restOfEffect = s.substring("when this dies, ".length).trim();
    const restParsed = effectParser(restOfEffect, game, (data:EffectData) => {throw new Error("Not implemented");}, true);
    return {
        effectFunction: passive.onYourEventEffect("on:death:monster", [restParsed.effectFunction], game, s),
        targetSelectors: restParsed.targetSelectors
    };
}

export function parseAtTheStartOfYourTurnEffect(s: string, game: Game): ParsedEffect {
    const restOfEffect = s.substring("at the start of your turn ".length).trim();
    const restParsed = effectParser(restOfEffect, game, active.addInPlayEffect(game), true);
    return {
        effectFunction: passive.onYourEventEffect("on:turn:start", [restParsed.effectFunction], game, s),
        targetSelectors: restParsed.targetSelectors
    };
}

export function parseOnDamageTakenEffect(s: string, game: Game): ParsedEffect {
    const restOfEffect = s.substring(s.indexOf(",") + 1).trim();
    const restParsed = effectParser(restOfEffect, game, active.addInPlayEffect(game), true);
    return {
        effectFunction: passive.onDamageTakenEffect([restParsed.effectFunction], game),
        targetSelectors: restParsed.targetSelectors
    };
}

export function parseWhenThisEntersPlay(s: string, game: Game): ParsedEffect {
    const restOfEffect = s.substring("when this enters play,".length).trim();
    return effectParser(restOfEffect, game, (data:EffectData) => {throw new Error("Not implemented");}, true);
}
 
export function parseFirstKillMonsterTurnEffect(s: string, game: Game): ParsedEffect {
    const restOfEffect = s.substring("the first time you kill a monster on your turn, ".length).trim();
    const restParsed = effectParser(restOfEffect, game, active.addInPlayEffect(game), true);
    return {
        effectFunction: passive.onFirstKillMonsterYourTurnEffect([restParsed.effectFunction], game),
        targetSelectors: restParsed.targetSelectors
    };
}

export function parseEachTimeDeclareAttackEffect(s: string, game: Game): ParsedEffect {
    const restOfEffect = s.substring(s.indexOf(",") + 1).trim();
    const restParsed = effectParser(restOfEffect, game, active.addInPlayEffect(game), true);
    return {
        effectFunction: passive.onYourEventEffect("on:attack:declared", [restParsed.effectFunction], game, s),
        targetSelectors: restParsed.targetSelectors
    };
}

export function parseEachTimeYouKillSpecificTypeEffect(s: string, game: Game, type: "monster" | "player"): ParsedEffect {
    const restOfEffect = s.substring(`each time you kill a ${type}, `.length).trim();
    const restParsed = effectParser(restOfEffect, game, active.addInPlayEffect(game), true);
    return {
        effectFunction: passive.onYourKillEffect([restParsed.effectFunction], game, s, false, (effectData: EffectData, eventData: OnDeathMonsterData) => {
            return eventData.eventIssuer instanceof (type === "monster" ? Monster : Player);
    }),
        targetSelectors: restParsed.targetSelectors
    };
}

export function parseEachTimeAnotherPlayerDiesEffect(s: string, game: Game): ParsedEffect {
    const restOfEffect = s.substring("each time another player dies, ".length).trim();
    const restParsed = effectParser(restOfEffect, game, active.addInPlayEffect(game), true);
    return noTargetEffect(passive.onAnotherPlayerEventEffect("on:death:before-penalty", [restParsed.effectFunction], game, s));
}

export function parseEachTimeWouldRollEffect(s: string, game: Game): ParsedEffect {
    const nr = new NumberRobustString(s);
    const masked = nr.toString();
    const prefix = "each time a player would roll a x";
    if (!masked.startsWith(prefix))
        throw new Error(`Could not parse 'Each time a player would roll a X' effect: ${s}`);

    const value = nr.numbers[0]!;
    let restOfEffect = (nr.restAfter(prefix) ?? "").trim();
    if (restOfEffect.startsWith(",")) restOfEffect = restOfEffect.substring(1).trim();
    const restParsed = effectParser(restOfEffect, game, active.addInPlayEffect(game), true);
    return {
        effectFunction: passive.onWouldRollEffect([restParsed.effectFunction], [value], game),
        targetSelectors: restParsed.targetSelectors
    };
}

export function parseCurseEffect(s: string, game: Game): ParsedEffect {
    const restOfEffect = s.trim();
    const restParsed = effectParser(restOfEffect, game, active.addInPlayEffect(game), true);
    return {
        effectFunction: passive.curseEffect(restParsed.effectFunction, game),
        targetSelectors: restParsed.targetSelectors
    };
}

export function decideEntitySelector(s: string, game: Game): TargetsSelector[] {
let selector = selectMonster(game);
    if( s.includes("player"))
    {    selector = selectPlayer(game);
        if(s.includes("monster"))
            selector = selectPlayerOrMonster(game);
    }
    return selector;
}

function noTargetEffect(effectFunction: EffectFunction): ParsedEffect {
    return { effectFunction, targetSelectors: noTargets };
}
export function parseTheActivePlayerEffect(s: string, game: Game, nr?: NumberRobustString): ParsedEffect {
    nr = nr ?? new NumberRobustString(s);
    if(s.startsWith("the active player rolls-"))
    {
        const rest = "roll" + s.substring("the active player rolls".length).replace("they", "the active player");
        return active.rollEffect(rest, nr , game, true);
    }
    {
        const numberRobustString = nr ?? new NumberRobustString(s);
        const masked = numberRobustString.toString();
        if (masked.startsWith("the active player may attack other players. attacked players have x+ [dc]")) {
            const evasion = numberRobustString.numbers[0];
            if (evasion !== undefined)
                return noTargetEffect(room.otherPlayersAreAttackableEffect(game, evasion));
        }
        switch (masked) {
            case "the active player must attack the monster deck x times this turn.":
                return { effectFunction: active.forceAttackMonsterDeckEffect(game, numberRobustString.nextNumber(), "total"), targetSelectors: noTargets }; 
            case "the active player forces a player to discard x loot cards.":
                return noTargetEffect(monster.activePlayerSelectAndCallEffect(game, active.discardNLootCardsEffect(numberRobustString.nextNumber(), game, true)));
            case "the active player chooses a player. they lose x¢.":
                return noTargetEffect(monster.activePlayerSelectAndCallEffect(game, active.loseCoinsEffect(game, numberRobustString.nextNumber())));
            case "the active player deals x damage to a player.":
                return noTargetEffect(active.dealDamageToAPlayerEffect(game, numberRobustString.nextNumber(), true, true));
            case "the active player deals x damage divided as they choose to any number of monsters or players.":
                return noTargetEffect(monster.activePlayerSelectTargetEffect(game, active.dealXDamageDividedAsYouChooseEffect(game, numberRobustString.nextNumber()), selectPlayerOrMonster(game, 1, 2)[0]!));
            case "the active player chooses a player. that player discards x loot cards.":
                return noTargetEffect(monster.activePlayerChoosePlayerDiscardXEffect(game, numberRobustString.nextNumber()));
            case "the active player chooses a living player. this deals x damage to that player.":
                return noTargetEffect(monster.activePlayerChooseLivingPlayerTakeDamageEffect(game, numberRobustString.nextNumber()));
            case "the active player loots +x during their loot step.":
                return { effectFunction: passive.lootStepEffect([active.lootCardsEffect(game, numberRobustString.nextNumber())], game, true), targetSelectors: noTargets };
        }
    }
    switch (s) {
        case "the active player rerolls each item they control.":
            return noTargetEffect(active.rerollEachItemEffect(game, "currentPlayer"));
        case "the active player may attack an additional time this turn.":
            return { effectFunction: passive.temporaryStatModifierEffect([game.addAttackThisTurn.bind(game)], 1, game, "current"), targetSelectors: noTargets };
        case "the active player must attack this once each turn if able.":
            return noTargetEffect(monster.forceAttackThisEachTurnEffect(game));
        case "the active player must attack the monster deck once each turn if able.":
            return noTargetEffect(room.activePlayerMustAttackTopDeck(game));
        case "the active player must attack each turn if able.":
        case "the first time the active player declares an attack each turn, they must attack an additional time this turn.":
            return noTargetEffect(room.activePlayerMustAttackAdditionalTimeEffect(game));
        case "the active player may attack the monster deck any number of times till end of turn.":
            return noTargetEffect(monster.activePlayerMayAttackMonsterDeckEffect(game, INFINITY));
        case "the active player may attack the monster deck an additional time.":
            return noTargetEffect(monster.activePlayerMayAttackMonsterDeckEffect(game, 1));
        case "the active player must make an additional attack.":
        case "the active player must make an additional attack this turn.":
            return noTargetEffect(monster.activePlayerMustMakeAdditionalAttackEffect(game));
        case "the active player kills a player.":
            return noTargetEffect(active.killTargetEffect(game, decideEntitySelector(s, game), true, true));
        case "the active player skips their next turn.":
            return noTargetEffect(active.issuerSkipNextTurnEffect(game, true));
        case "the active player may steal a non-eternal item another player controls.":
            return noTargetEffect(monster.activePlayerSelectTargetEffect(game, active.stealNonEternalItemEffect(game), selectAnotherPlayerNonEternalItem(game, 0, 1)[0]!));
        case "the active player may look at a player's hand.":
            return noTargetEffect(monster.activePlayerSelectTargetEffect(game, active.lookAtAPlayerHand(game), selectPlayer(game, 0, 1)[0]!, false));
        case "the active player recharges each item they control.":
            return noTargetEffect(active.rechargeEachItemsOfTargetEffect(game, "current"));
        case "the active player may choose another player. they give you a soul they control.":
            return noTargetEffect(monster.activePlayerSelectAndCallEffect(game, active.giveSoulEffect(game), true));
        case "the active player chooses a player. that player destroys a soul they control.":
            return noTargetEffect(monster.activePlayerSelectAndCallEffect(game, active.destroyOneOfYourSoulEffect(game)));
        default:
            return noTargetEffect(active.addInPlayEffect(game));
            // throw new Error(`Could not parse 'The active player ...' effect: ${s}`);
    }
}

// youMayEffectHanging: true if we are currently parsing a "you may" effect and haven't yet handled the "you may" part. 
// Some effects can handle the you may part by allowing selection of 0 items. In that case, we set youMayEffectHanging to false and let the rest of the effect handle the choice.
//  For other effects, we need to handle the "you may" part at this level by prompting the user for a choice, and then if they choose yes, we parse and execute the rest of the effect.
export function effectParser(s: string, game: Game, defaultEffect: EffectFunction = active.addInPlayEffect(game), selectionOnResolve = false, youMayEffectHanging = [false]): ParsedEffect {
    s = s.replace("[Tap Effect] ", ""); // remove tap effect marker
    s = s.replace("[Curse Effect] ", ""); // remove curse effect marker
    s = s.replace("!", "");

    s = s.toLowerCase();
    s = replaceDiceSymbols(s);
    const nr = new NumberRobustString(s);
    if(s.startsWith("[curse] "))
        return parseCurseEffect(s.substring(8).trim(), game);
    if (s.startsWith("when you die, ")) {
        let restString = s.substring(s.indexOf(",") + 1).trim();
        if(restString.startsWith("before paying penalties, "))
            restString = restString.substring(restString.indexOf(",") + 1).trim();
        const restParsed = effectParser(restString, game, defaultEffect, true);
        return {
            effectFunction: passive.onYourEventEffect("on:death:before-penalty", [restParsed.effectFunction], game, s),
            targetSelectors: restParsed.targetSelectors
        };
    }
    if (s.startsWith("when you would die on your turn, "))
    {
        const restParsed = effectParser(s.substring(s.indexOf(",") + 1).trim(), game, defaultEffect, true);
        return noTargetEffect(passive.WouldDieYourTurnEffect([restParsed.effectFunction], game, s, false, true));
    }
    if(s.startsWith("each time you miss an attack roll, ")){
        const restParsed = effectParser(s.substring(s.indexOf(",") + 1).trim(), game, defaultEffect, true);
        return {
            effectFunction: passive.onYourEventEffect("on:attack:roll:failed", [restParsed.effectFunction], game, s),
            targetSelectors: noTargets
        };
    }
    if(s.startsWith("the active player ") || s.startsWith("the first time the active player"))
        return parseTheActivePlayerEffect(s, game, nr);
    if (s.startsWith("each time you deal combat damage to a monster,")) {
        const restParsed = effectParser(s.substring(s.indexOf(",") + 1).trim(), game, defaultEffect, true);
        return {
            effectFunction: passive.onYourEventEffect("on:combatdamage:dealt:to-monster", [restParsed.effectFunction], game, s),
            targetSelectors: restParsed.targetSelectors
        };
    }
    if (s.startsWith("each time you deal combat damage,")) {
        const restParsed = effectParser(s.substring(s.indexOf(",") + 1).trim(), game, defaultEffect, true);
        return {
            effectFunction: passive.onYourEventEffect("on:combatdamage:dealt", [restParsed.effectFunction], game, s),
            targetSelectors: restParsed.targetSelectors
        };
    }
    if (s.startsWith("each time you deal damage,")) {
        const restParsed = effectParser(s.substring(s.indexOf(",") + 1).trim(), game, defaultEffect, true);
        return {
            effectFunction: passive.onDamageYouDealtEffect([restParsed.effectFunction], game, s),
            targetSelectors: restParsed.targetSelectors
        };
    }
    if(s.startsWith("each time a player activates an item, they")){
        return eachTimeActivateItemEffect(s, game);
    }
    if (s.startsWith("each time you die, after paying penalties, ")) {
        const restParsed = effectParser(s.substring(s.indexOf(",", s.indexOf(",")+1) + 1).trim(), game, defaultEffect, true);
        return {
            effectFunction: passive.onYourEventEffect("on:death:after-penalty", [restParsed.effectFunction], game, s),
            targetSelectors: restParsed.targetSelectors
        };
    }
    if (s.startsWith("each time you die, before paying penalties, ")) {
        const restParsed = effectParser(s.substring(s.indexOf(",", s.indexOf(",")+1) + 1).trim(), game, defaultEffect, true);
        return {
            effectFunction: passive.onYourEventEffect("on:death:before-penalty", [restParsed.effectFunction], game, s),
            targetSelectors: restParsed.targetSelectors
        };
    }
    if (s.startsWith("each time you kill a monster or player, ")) {
        const restParsed = effectParser(s.substring(s.indexOf(",") + 1).trim(), game, defaultEffect, true);
        return {
            effectFunction: passive.onYourKillEffect([restParsed.effectFunction], game, s),
            targetSelectors: restParsed.targetSelectors
        };
    }
    if(s.startsWith("as your turn starts, "))
        s = "at the start of your turn " + s.substring("as your turn starts, ".length).trim();
    if (s.startsWith("at the start of your turn"))
        return parseAtTheStartOfYourTurnEffect(s, game);
    if (s.startsWith("each time you activate an item, ")) {
        const restParsed = effectParser(s.substring(s.indexOf(",") + 1).trim(), game, defaultEffect, true);
        return {
            effectFunction: passive.onYourEventEffect("on:item:activated", [restParsed.effectFunction], game, s),
            targetSelectors: restParsed.targetSelectors
        };
    }
    if (s.startsWith("when you would die, ") || s.startsWith("each time you would die, ")) {
        const restParsed = effectParser(s.substring(s.indexOf(",") + 1).trim(), game, defaultEffect, true);
        return {
            effectFunction: passive.WouldDieYourTurnEffect([restParsed.effectFunction], game, s, false, false),
            targetSelectors: restParsed.targetSelectors
        };
    }
    if (s.startsWith("each time you declare an attack, "))
        return parseEachTimeDeclareAttackEffect(s, game);
    if (s.startsWith("when this enters play"))
        return parseWhenThisEntersPlay(s, game);
    
    if(s.startsWith("the first time you kill a monster on your turn, "))
        return parseFirstKillMonsterTurnEffect(s, game);
    if (s.startsWith("the first time you would gain ¢ on each of your turns, ")) {
        const restParsed = effectParser(s.substring(s.indexOf(",") + 1).trim(), game, defaultEffect, true);
        return {
            effectFunction: passive.interceptFirstGainCoinYourTurnEffect([restParsed.effectFunction], game, s),
            targetSelectors: restParsed.targetSelectors
        };
    }
    // before You may handling for playdough cookie.
    if(s.includes("otherwise, ")){
        const parts = s.split(" otherwise, ");
        const firstParsed = effectParser(parts[0]!.trim(), game, defaultEffect, selectionOnResolve);
        const secondParsed = effectParser(parts[1]!.trim(), game, defaultEffect, selectionOnResolve);
        return {
            effectFunction: async (data:EffectData) => {
                if(!await firstParsed.effectFunction(data))
                    await secondParsed.effectFunction(data);
                return true;
            },
            targetSelectors: [...firstParsed.targetSelectors, ...secondParsed.targetSelectors]
        };
    }
    if (s.startsWith("each time a monster or player dies, "))
        return noTargetEffect(passive.onAnyEventEffect("on:death:before-penalty", [effectParser(s.substring(s.indexOf(",") + 1).trim(), game, defaultEffect, true).effectFunction], game, s, 
            (ef: EffectData, ev: OnDeathBeforePenaltyData) => {return ev.eventIssuer instanceof Monster || ev.eventIssuer instanceof Player;}));
    if (s.startsWith("each time another player dies, "))
        return parseEachTimeAnotherPlayerDiesEffect(s, game);
    if(s.startsWith("each time you kill a monster, "))
        return parseEachTimeYouKillSpecificTypeEffect(s, game, "monster");
    if(s.startsWith("each time you kill a player, "))
        return parseEachTimeYouKillSpecificTypeEffect(s, game, "player");
    if (s.startsWith("each time a player would roll a ") && !s.includes(" or "))
        return parseEachTimeWouldRollEffect(s, game);
    if(s.startsWith("as your turn ends, "))
        s = "at the end of your turn, " + s.substring("as your turn ends, ".length).trim();
    if (s.startsWith("at the end of your turn, "))
        return parseAtTheEndOfYourTurnEffect(s, game);
    if (s.startsWith("when you gain or purchase this, "))
        return ParseWhenGainOrPurchaseThis(s, game);
    if (s.startsWith("when this dies, ") && !s.includes("killed")) // effects that include "killed" refers to the killer and need to be handled differently.
        return parseWhenThisDiesEffect(s, game);
    if (s.startsWith("when the active player rolls a"))
        return parseWhenActivePlayerRollsEffect(s, game, nr);
    if (s.startsWith("each time a player rolls a"))
        return parseEachTimeRollEffect(s, game, nr);
    if(s.startsWith("each time the attacking player rolls an attack roll of"))
        return parseEachTimeRollEffect(s, game, nr);
    if (s.startsWith("each time you take damage, "))
        return parseOnDamageTakenEffect(s, game);
    if(s.startsWith("each time this takes damage, "))
        return parseOnDamageTakenEffect(s, game);
    if (s.startsWith("you may") &&
    // exceptions where "you may" is not a choice, but an extra action
        !s.startsWith("you may put") &&
        !s.startsWith("you may purchase") && 
        !s.startsWith("you may play") && 
        !s.startsWith("you may attack") && 
        s !== "you may look at the top card of the treasure deck at any time on your turn."
        )
        return parseYouMayEffect(s, game);
    if (s.startsWith("choose one-"))
        return active.chooseOneEffect(s, game, selectionOnResolve);
    if (s.startsWith("roll-"))
        return active.rollEffect(s, nr, game);
    if (nr.masked.startsWith("destroy x items you control")) {
        const nbItems = nr.nextNumber();
        return { effectFunction: active.destroyXItemsEffect(game, nbItems), targetSelectors: selectItemYouControl(game, nbItems) };
    }
    if(nr.masked.startsWith("[lvx effect]"))
        return parseLvXEffect(s, game, nr);
    if (nr.masked.startsWith("when this reaches x [hp] , ")) {
        // const val = nr.nextNumber();
        const restParsed = effectParser(s.substring(s.indexOf(",") + 1).trim(), game, defaultEffect, true);
        return noTargetEffect(monster.whenThisReachesXHP(game, nr.nextNumber(), [restParsed.effectFunction], s))
    }
    if(nr.masked.startsWith("roll x times"))
    {
        const numberOfRolls = nr.nextNumber();
        const restTxt = "roll-" + s.substring(`roll x times`.length);
        const restEffect = active.rollEffect(restTxt, nr, game);
        const effect: EffectFunction = async (data:EffectData) => {
            const discardedLoot = data.targets[0];
            data.targets = []; // clear targets to avoid confusion for the restEffect, which shouldn't care about the discarded loot
            for(let i = 0; i < numberOfRolls; i++){
                await restEffect.effectFunction(data);
            }
            data.targets = [discardedLoot];
            return true;
        }
        return noTargetEffect(effect);
    }
    if(s.startsWith(`roll. if the discarded card had \"`))
    {
        const word = s.split(`\"`)[1]!;
        const restTxt = "roll-" + s.substring(`roll. if the discarded card had \"${word}\" in its name, roll 3x instead-`.length);
        const restEffect = active.rollEffect(restTxt, nr, game);
        const effect: EffectFunction = async (data:EffectData) => {
            const discardedLoot = data.targets[0];
            data.targets = []; // clear targets to avoid confusion for the restEffect, which shouldn't care about the discarded loot
            if(!(discardedLoot instanceof LootCard))
                throw new Error("Expected a loot card to be discarded.");
            for(let i = 0; i < (discardedLoot.slug.includes(word) ? 3 : 1); i++){
                await restEffect.effectFunction(data);
            }
            data.targets = [discardedLoot];
            return true;
        }
        return noTargetEffect(effect);
    }
    if (s.startsWith("kill ")) {
        const selector = decideEntitySelector(s, game);
        return { effectFunction: active.killTargetEffect(game, selector, selectionOnResolve), targetSelectors: selector };
    }
    if(s.includes(" if you do, ")){
        const parts = s.split(" if you do, ");
        const firstParsed = effectParser(parts[0]!.trim(), game, defaultEffect, selectionOnResolve);
        const secondParsed = effectParser(parts[1]!.trim(), game, defaultEffect, selectionOnResolve);
        return {
            effectFunction: async (data:EffectData) => {
                if(await firstParsed.effectFunction(data))
                    await secondParsed.effectFunction(data);
                return true;
            },
            targetSelectors: [...firstParsed.targetSelectors, ...secondParsed.targetSelectors]
        };
    }
    if (s.startsWith("destroy this.")) {
        const restParsed = effectParser(s.substring("destroy this.".length).trim(), game, defaultEffect, selectionOnResolve, youMayEffectHanging);
        return {
            effectFunction: (data:EffectData) => { 
                const destroyResult = game.destroyCardsOrSouls([data.it]); 
                if (s.substring("destroy this.".length).trim() === ".")
                    return destroyResult;
                if(destroyResult)
                    return restParsed.effectFunction(data);
                return false;
            },
            targetSelectors: restParsed.targetSelectors
        };
    }
    if (s === "put a counter on this." || s === "put a counter on this")
        return { effectFunction: active.putCountersOnItemEffect(1, game), targetSelectors: noTargets };
    if(s.includes(", then") 
        && s !== "choose another player. they give you half of their ¢ and loot cards rounded down, then gives you an item."
        && s !== "choose a monster being attacked. heal that monster to full [hp] , then deal damage equal to the number of [hp] healed in this way to another monster. if it's not your turn, cancel the attack and the active player may make an additional attack this turn."
        && !s.startsWith("the player attacking this gains its reward, then you flip it.")
        ){
        const [first, ...rest] = s.split(", then");

        const firstTrimmed = first!.trim();
        const secondTrimmed = (rest.join(", then")).trim();
        const firstParsed = effectParser(firstTrimmed, game, defaultEffect, selectionOnResolve, youMayEffectHanging);
        const secondParsed = effectParser(secondTrimmed, game, defaultEffect, true, youMayEffectHanging);
        return {
            effectFunction: async (data:EffectData) => {
                await firstParsed.effectFunction(data); 
                await secondParsed.effectFunction(data);
                return true;
            },
            targetSelectors: [...firstParsed.targetSelectors, ...secondParsed.targetSelectors]
        };
    }
    if(s.startsWith("each time a monster dies, "))
    {
        const rest = s.substring("each time a monster dies, ".length).trim();
        const restParsed = effectParser(rest, game, defaultEffect, true);
        return noTargetEffect(passive.onMonsterDeathEffect([restParsed.effectFunction], game, s));
    }
    switch (nr.normalizedMasked) {
        case "gain x¢":
            return { effectFunction: active.gainCoinsEffect(game, numberAtOrThrow(nr, 0, nr.normalizedMasked)), targetSelectors: noTargets };
        case "steal x¢ from a player":
        case "steal x¢ from another player":
            return { effectFunction: active.stealCoinsEffect(game, numberAtOrThrow(nr, 0, nr.normalizedMasked)), targetSelectors: selectAnotherPlayer(game) };
    }
    const exactCardTxt =  parseText(s, /^put a card named (.+) from the loot discard into your hand\.$/u);
    if (exactCardTxt !== "")
        return { effectFunction: active.getCardFromLootDiscardEffect(exactCardTxt, game, true), targetSelectors: noTargets };
    const cardTxt = parseText(s, /^put a card with "(\w+)" in its name from the loot discard into your hand\.$/u);
    if (cardTxt !== "")
        return { effectFunction: active.getCardFromLootDiscardEffect(cardTxt, game, false), targetSelectors: noTargets };
    const deckName = parseText(s, /^look at the top 5 cards of the (\w+) deck\. put 1 on top and the rest on the bottom\./u);
    if (deckName !== "")
    {
        return { effectFunction: active.look5Put1TopRestBottomEffect(deckName, game), targetSelectors: noTargets };
    }
    {
        switch (nr.normalizedMasked) {
            case "gain x treasure":
            case "gain x treasures":
                return { effectFunction: active.gainTreasuresEffect(game, numberAtOrThrow(nr, 0, nr.normalizedMasked)), targetSelectors: noTargets };
            case "each monster heals x [hp]":
                return noTargetEffect(active.healEachMonsterEffect(game, numberAtOrThrow(nr, 0, nr.normalizedMasked)));
            case "heal x [hp]":
            case "this heals x [hp]":
                // Preserve existing behavior: "this heals ..." resolves to active.healEffect here.
                return { effectFunction: active.healEffect(game, numberAtOrThrow(nr, 0, nr.normalizedMasked)), targetSelectors: noTargets };
            case "lose x¢":
                return { effectFunction: active.loseCoinsEffect(game, numberAtOrThrow(nr, 0, nr.normalizedMasked)), targetSelectors: noTargets };
            case "loot x":
                return { effectFunction: active.lootCardsEffect(game, numberAtOrThrow(nr, 0, nr.normalizedMasked)), targetSelectors: noTargets };
            case "remove x counter from this":
            case "remove x counters from this":
                return { effectFunction: active.removeCountersFromThisEffect(game, numberAtOrThrow(nr, 0, nr.normalizedMasked)), targetSelectors: noTargets };
            case "pay x [hp]":
                return { effectFunction: active.payHealthEffect(game, numberAtOrThrow(nr, 0, nr.normalizedMasked)), targetSelectors: noTargets };
            case "pay x¢:":
                return { effectFunction: active.payCoinsEffect(game, numberAtOrThrow(nr, 0, nr.normalizedMasked)), targetSelectors: noTargets };
            case "put x counters on this":
                return noTargetEffect(active.putCountersOnItemEffect(nr.nextNumber(), game));
            case "pay x¢":
                // Normalized form of "pay x¢." (trailing punctuation stripped)
                return { effectFunction: active.payCoinsEffect(game, numberAtOrThrow(nr, 0, nr.normalizedMasked)), targetSelectors: noTargets };
            case "put counters on it equal to the number of loot cards in your hand":
                return noTargetEffect(active.putCountersBasedOnLootCardsInHandEffect(game));
            case "if you have fewer loot cards in your hand than there are counters on this, loot x":
                return noTargetEffect(active.conditionalLootBasedOnCountersEffect(game, nr.nextNumber()));
            case "expand shop slots by x":
                return noTargetEffect(active.expandSlotsEffect("shop", nr.nextNumber(), game));
            case "each player gains x¢":
                return { effectFunction: active.eachPlayerGainsCoinsEffect(game, numberAtOrThrow(nr, 0, nr.normalizedMasked)), targetSelectors: noTargets };
            case "force a player to discard x loot card":
            case "force a player to discard x loot cards":
                return { effectFunction: active.discardNLootCardsEffect(numberAtOrThrow(nr, 0, nr.normalizedMasked), game, true, true), targetSelectors: selectPlayer(game) };
            case "discard a loot card":
                return { effectFunction: active.discardNLootCardsEffect(1, game, selectionOnResolve), targetSelectors: selectLootInYourHand(game, 1, 1, selectionOnResolve) };
            case "discard x loot card":
            case "discard x loot cards": {
                const toDiscard = numberAtOrThrow(nr, 0, nr.normalizedMasked);
                return { effectFunction: active.discardNLootCardsEffect(toDiscard, game, selectionOnResolve), targetSelectors: selectLootInYourHand(game, toDiscard, toDiscard, selectionOnResolve) };
            }
            case "each player loots x":
                return { effectFunction: active.eachPlayerLootsEffect(game, numberAtOrThrow(nr, 0, nr.normalizedMasked)), targetSelectors: noTargets };
            case "then put x cards from your hand on top of the loot deck in any order":
                return { effectFunction: active.putXCardFromYourHandOnTopOfLootDeck(game, numberAtOrThrow(nr, 0, nr.normalizedMasked)), targetSelectors: noTargets };
            case "put the top card of the loot discard into your hand":
                return noTargetEffect(active.getCardFromLootDiscardEffect("top", game, false));
            case "look at the top x cards of the loot deck. put one in your hand and put the rest in another player's hand":
                return noTargetEffect(active.lookAtTopXPut1InYourHandRestInAnotherPlayerHandEffect(game, nr.nextNumber()));
            case "prevent all damage you would take while it's not your turn":
                return noTargetEffect(passive.preventDamageNotOnYourTurnEffect(game));
            case "choose a monster. it gains -x [dc] , till end of turn":
                return noTargetEffect(passive.temporaryStatModifierEffect([game.addDC.bind(game)], -nr.nextNumber(), game, "selectionOnResolve", selectMonster(game, 1, 1)[0]!));
            case "look at the top x cards of the room or monster deck. you may put one of those in a slot and the rest back. this can't be activated during an attack":
                return { effectFunction: active.lookAtTop3Put1InSlotEffect(game, nr.nextNumber()), targetSelectors: selectDeck(game, 1, 1, (name) => ["room", "monster"].includes(name)) };
        }

        // Keep legacy fallback for this specific phrase (currently unreachable because of the switch case above,
        // but left as-is to avoid surprising behavioral change during refactor).
        const thisHeals = numberAtIfMaskedEqualsAny(nr, ["this heals x [hp]"]);
        if (thisHeals !== null)
            return { effectFunction: monster.thisHealsEffect(game, thisHeals), targetSelectors: noTargets };
    }
    var deckName1 = parseText(s, /^look at the top \d+ cards of the (\w+) deck\. you may put them back in any order\.?$/u);
    if (deckName1 === "")
        deckName1 = parseText(s, /^look at the top \d+ cards of the (\w+) deck\. put them back in any order\.?$/u);
    if (deckName1 !== "")
        return { effectFunction: active.lookAndOrderEffect(deckName1, nr.nextNumber(), game), targetSelectors: noTargets };
    {
        const nr2 = new NumberRobustString(s);
        switch (nr2.normalizedMasked) {
            case "each player loses x¢":
                return { effectFunction: active.eachPlayerLosesCoinsEffect(game, numberAtOrThrow(nr2, 0, nr2.normalizedMasked)), targetSelectors: noTargets };
            case "each player takes x damage":
            case "deal x damage to each player":
                return { effectFunction: active.dealDamageToEachPlayerEffect(game, numberAtOrThrow(nr2, 0, nr2.normalizedMasked)), targetSelectors: noTargets };
            case "each monster takes x damage":
            case "deal x damage to each monster":
                return { effectFunction: active.dealDamageToEachMonsterEffect(game, numberAtOrThrow(nr2, 0, nr2.normalizedMasked)), targetSelectors: noTargets };
            case "shop items you purchase cost x¢ less":
                return { effectFunction: passive.shopItemsCostLessEffect(numberAtOrThrow(nr2, 0, nr2.normalizedMasked), game), targetSelectors: noTargets };
            case "you take x damage":
            case "take x damage":
            case "this takes x damage":
                return { effectFunction: active.takeDamageEffect(game, numberAtOrThrow(nr2, 0, nr2.normalizedMasked)), targetSelectors: noTargets };
            case "take x damage and gain x¢":
                return { effectFunction: active.takeDamageGainCoinsEffect(s, numberAtOrThrow(nr2, 0, nr2.normalizedMasked), numberAtOrThrow(nr2, 1, nr2.normalizedMasked), game), targetSelectors: noTargets };
            case "deal x damage to a monster or player":
            case "deal x damage to a player":
            case "deal x damage to a monster":
                return { effectFunction: active.dealDamageToTargetEffect(game, numberAtOrThrow(nr2, 0, nr2.normalizedMasked), selectionOnResolve, decideEntitySelector(s, game)), targetSelectors: decideEntitySelector(s, game) };
            case "deal x damage to them":
                return { effectFunction: active.dealDamageToTargetEffect(game, numberAtOrThrow(nr2, 0, nr2.normalizedMasked), false, decideEntitySelector(s, game)), targetSelectors: decideEntitySelector(s, game) };
            case "$ items you control cost x¢ less to activate":
                return noTargetEffect(passive.itemCostLessToActivateEffect(game, nr.nextNumber()));
        }
    }
    const slot = parseText(s, /^expand (\w+)s? slots by \d+\.?$/u)
    if (slot !== "")
    {
        const numberToExpand = nr.numbers[0] ?? null;
        if (numberToExpand === null)
            throw new Error(`Could not parse number of slots to expand in effect: ${s}`);
        return { effectFunction: active.expandSlotsEffect(slot, numberToExpand, game), targetSelectors: noTargets };
    }
    {
        let countersToRemove = numberAtIfMaskedEqualsAny(nr, ["remove x counter from this", "remove x counters from this"]);
        if (countersToRemove === null && maskedEqualsAny(nr, ["remove a counter from this"]))
            countersToRemove = 1;
        if( countersToRemove !== null)
            return { effectFunction: active.removeCountersEffect(game, countersToRemove), targetSelectors: noTargets };

        const toAdd = numberAtIfMaskedEqualsAny(nr, ["add x to a dice roll"]);
        if( toAdd !== null)
            return { effectFunction: active.addToDiceRollEffect(game, toAdd), targetSelectors: selectRoll(game) };

        switch (nr.masked) {
            case "you have +x [hp] .":
            case "+x [hp]":
                return { effectFunction: passive.permanentStatModifierEffect([game.addHealth.bind(game)], numberAtOrThrow(nr, 0, nr.normalizedMasked), game), targetSelectors: noTargets };
            case "+x [atk]":
                return { effectFunction: passive.permanentStatModifierEffect([game.addAttack.bind(game)], numberAtOrThrow(nr, 0, nr.normalizedMasked), game), targetSelectors: noTargets };
        }
    }
    // Parse standard string-matched effects
    const standardEffect = parseStandardEffect(s, game, nr, selectionOnResolve, youMayEffectHanging);
    if (standardEffect !== null) {
        return standardEffect;
    }
    // Parse standard string-matched monster effects
    const standardMonsterEffect = parseStandardMonsterEffect(s, game, nr);
    if (standardMonsterEffect !== null) {
        return standardMonsterEffect;
    }

    const roomEffect = parseRoomEffect(s, game, nr);
    if (roomEffect !== null) {
        return roomEffect;
    }

    // multiple effects separated by ., try to parse them individually.
    // To do so, replace by ", then " and parse again.
    if (s.indexOf(".") !== s.length - 1 && s.indexOf(".") !== -1) 
    {
        s = s.replace(".", ", then ");
        return effectParser(s, game, defaultEffect, selectionOnResolve, youMayEffectHanging);
    }
    if(s.indexOf(" and ") !== -1)
    {
        s = s.replace(" and ", " if you do, ");
        return effectParser(s, game, defaultEffect, selectionOnResolve, youMayEffectHanging);
    }
    if (s.indexOf(",") !== s.length - 1 && s.indexOf(",") !== -1) 
    {
        s = s.replace(",", ", then ");
        return effectParser(s, game, defaultEffect, selectionOnResolve, youMayEffectHanging);
    }
    console.log(`Could not parse effect: "${s}"`);
    throw new Error(`Could not parse effect: "${s}"`);
    // return { effectFunction: defaultEffect, targetSelectors: noTargets };
}

/**
 * Parse standard string-matched effects that don't require special handling.
 * Returns null if no match is found.
 * Returns a complete ParsedEffect with inline target selectors.
 */
function parseStandardEffect(s: string, game: Game, nr: NumberRobustString, selectionOnResolve: boolean, youMayEffectHanging: boolean[]): ParsedEffect | null {
    // Number-robust parsing for standard effects.
    // Keep this limited to cases where the extracted number(s) are actually used by the returned effect.
    const n = (i: number): number => numberAtOrThrow(nr, i, nr.normalizedMasked);
    switch (nr.normalizedMasked) {
        case "flip your character if able. then recharge it. discard your hand and loot x":
            return {
                effectFunction: active.combineEffectFunctions([
                    active.flipCharacterEffect(game),
                    active.rechargeCharaEffect(game, [false]),
                    active.discardHandEffect(game),
                    active.lootCardsEffect(game, n(0)),
                ]),
                targetSelectors: noTargets,
            };
        case "when this is flipped to this side, loot x":
            return {
                effectFunction: passive.lootAfterFlippingEffect(game, n(0)),
                targetSelectors: noTargets,
            };
        case "choose a monster or player. the next instance of damage they take this turn is reduced to x":
            return {
                effectFunction: passive.setNextDamageToXEffect(n(0), game),
                targetSelectors: selectPlayerOrMonster(game),
            };
        case "loot x during your loot step":
            return {
                effectFunction: passive.lootStepEffect([active.lootCardsEffect(game, n(0))], game),
                targetSelectors: noTargets,
            };
        case "prevent the next x damage you would take this turn":
            return {
                effectFunction: passive.preventNextDamageUpToEffect(n(0), game),
                targetSelectors: noTargets,
            };
        case "choose a player. prevent the next x damage they would take this turn":
            return {
                effectFunction: passive.preventNextDamageUpToEffect(n(0), game),
                targetSelectors: selectPlayer(game),
            };
        case "choose a player or monster. prevent the next instance of up to x damage they would take this turn":
        case "choose a player. prevent the next instance of up to x damage they would take this turn":
        case "choose a player or monster. prevent the next x damage they would take this turn":
            return {
                effectFunction: passive.preventNextDamageUpToEffect(n(0), game),
                targetSelectors: selectPlayerOrMonster(game),
            };
        case "while you have x¢, you have x to your attack rolls": {
            const coinCount = n(0);
            const diceMod = n(1);
            return {
                effectFunction: passive.ConditionalStatModifierEffect(
                    [game.addAttackDiceModifier.bind(game)],
                    diceMod,
                    (player: Player) => player.coins === coinCount,
                    ["on:coin:gained:after", "on:coin:lost:after"],
                    game,
                    false,
                ),
                targetSelectors: noTargets,
            };
        }
        case "when you have x loot cards in your hand, you have x [atk]": {
            const lootCount = n(0);
            const atk = n(1);
            return {
                effectFunction: passive.ConditionalStatModifierEffect(
                    [game.addAttack.bind(game)],
                    atk,
                    (player: Player) => player.hand.length === lootCount,
                    ["on:loot:added:after", "on:loot:removed:after"],
                    game,
                ),
                targetSelectors: noTargets,
            };
        }
        case "you gain x [atk] till the end of turn":
            return {
                effectFunction: passive.temporaryStatModifierEffect([game.addAttack.bind(game)], n(0), game, "issuer"),
                targetSelectors: noTargets,
            };
        case "prevent the next x damage you would take this turn. when you prevent damage this way, deal x damage to another player": {
            const preventAmount = n(0);
            const damageAmount = n(1);
            return {
                effectFunction: passive.preventDamageAndDealDmgOnPreventEffect(preventAmount, damageAmount, game),
                targetSelectors: selectAnotherPlayer(game),
            };
        }
        case "choose a player or monster. they gain x [atk] till end of turn":
            return {
                effectFunction: passive.temporaryStatModifierEffect([game.addAttack.bind(game)], n(0), game, "next"),
                targetSelectors: selectPlayerOrMonster(game),
            };
        case "gain x [atk] till end of turn":
        case "you gain x [atk] till end of turn":
            return {
                effectFunction: passive.temporaryStatModifierEffect([game.addAttack.bind(game)], n(0), game, "issuer"),
                targetSelectors: selectPlayerOrMonster(game),
            };
        case "each monster gains x [atk] till end of turn":
            return {
                effectFunction: passive.temporaryStatModifierEffect(
                    [game.addAttackToEachMonster.bind(game)],
                    n(0),
                    game,
                    "issuer",
                ),
                targetSelectors: noTargets,
            };
        case "each monster gains x [dc] till end of turn":
            return {
                effectFunction: passive.temporaryStatModifierEffect([game.addDCToEachMonster.bind(game)], n(0), game, "issuer"),
                targetSelectors: noTargets,
            };
        case "if you would take any amount of damage, take that much damage x instead":
            return { effectFunction: passive.takeDamagePlusEffect(n(0), game), targetSelectors: noTargets };
        case "each time a player dies, before paying penalties, loot x":
            return { effectFunction: passive.lootOnPlayerDeathEffect(n(0), game), targetSelectors: noTargets };
        case "if you would gain any number of ¢, gain that much x¢ instead":
            return { effectFunction: passive.gainPlusCoinsEffect(n(0), game), targetSelectors: noTargets };
        case "this item starts with x counters on it":
            return { effectFunction: passive.startWithNCountersEffect(n(0), game), targetSelectors: noTargets };
        case "reveal the top x cards of the monster deck. give any curse cards revealed to the player or players of your choosing. put the rest on the bottom of the deck in any order":
            return noTargetEffect(active.revealTopCardsOfMonsterDeckEffect(game, n(0)));
        case "gain x [atk] for your first attack roll each turn":
        case "you have x [atk] for your first attack roll each turn":
            return { effectFunction: passive.firstAttackRollStatModifierEffect(n(0), 0, 0, game), targetSelectors: noTargets };
        case "each time you would take damage, roll-\nx: prevent x of that damage": {
            const rollValue = n(0);
            const preventAmount = n(1);
            return { effectFunction: passive.preventDamageOnRollEffect([rollValue], preventAmount, game), targetSelectors: noTargets };
        }
        case "each time you roll an attack roll of x, deal x damage to each other player": {
            const rollValue = n(0);
            const damage = n(1);
            return { effectFunction: passive.onAttackRollEffect([rollValue], active.dealDamageToEachOtherPlayerEffect(game, damage), game), targetSelectors: noTargets };
        }
        case "deal x damage to another player":
            return { effectFunction: active.dealDamageToAPlayerEffect(game, n(0), false), targetSelectors: selectAnotherPlayer(game) };
        case "each time another player gains ¢, they must give you x¢":
            return noTargetEffect(passive.stealCoinOnGainEffect(n(0), game));
        case "if you have x¢, gain x¢": {
            const coinsCondition = n(0);
            const gainAmount = n(1);
            return { effectFunction: active.gainXCoinsIfYEffect(coinsCondition, gainAmount, game), targetSelectors: noTargets };
        }
        case "if you have x or more loot cards in your hand, loot x": {
            const threshold = n(0);
            const lootAmount = n(1);
            return { effectFunction: active.lootXIfYEffect(threshold, true, lootAmount, game), targetSelectors: noTargets };
        }
        case "if you have x loot cards in your hand, loot x": {
            const threshold = n(0);
            const lootAmount = n(1);
            return { effectFunction: active.lootXIfYEffect(threshold, false, lootAmount, game), targetSelectors: noTargets };
        }
        case "each other player takes x damage":
            return { effectFunction: active.dealDamageToEachOtherPlayerEffect(game, n(0)), targetSelectors: noTargets };
        case "look at the top x cards of a deck. put them back in any order":
        case "look at the top x cards of a deck and put them back in any order":
            return noTargetEffect(active.lookAndReorderTopCardsEffect(game, n(0), "selectOnResolve"));
        case "gain x ¢ instead": {
            const fixed = n(0);
            return { effectFunction: active.modifyCoinGainedEffect(game, () => fixed), targetSelectors: noTargets };
        }
        case "deal x damage to up to x monsters or players": {
            const damage = n(0);
            const maxTargets = n(1);
            return {
                effectFunction: active.dealDamageToUpToXMonstersOrPlayersEffect(game, maxTargets, damage),
                targetSelectors: selectPlayerOrMonster(game, 1, maxTargets),
            };
        }
        case "combat damage you take is doubled on attack rolls of x":
            return noTargetEffect(passive.combatDamageModifierOnAttackRollEffect(game, [n(0)], "double", "taken"));
        case "combat damage you deal is doubled on attack rolls of x":
            return noTargetEffect(passive.combatDamageModifierOnAttackRollEffect(game, [n(0)], "double", "dealt"));
        case "combat damage you deal on attack rolls of x is increased by x": {
            const rollValue = n(0);
            const increaseBy = n(1);
            return noTargetEffect(passive.combatDamageModifierOnAttackRollEffect(game, [rollValue], increaseBy, "dealt"));
        }
        case "if this has x+ counters, remove all of them and loot x": {
            const threshold = n(0);
            const lootAmount = n(1);
            return noTargetEffect(active.removeCounterAndLootIfAbove(game, threshold, lootAmount));
        }
        case "choose a monster. its [atk] becomes x":
            return { effectFunction: active.setMonsterAttackToXEffect(game, n(0)), targetSelectors: selectMonster(game) };
        case "you have x [hp] for each counter on this":
            return noTargetEffect(passive.statModifierBasedOnCountersEffect(game, [game.addHealth.bind(game)], 1, n(0)));
        case "you have x [atk] for every x counters on this": {
            const atkPer = n(0);
            const countersPer = n(1);
            return noTargetEffect(passive.statModifierBasedOnCountersEffect(game, [game.addAttack.bind(game)], countersPer, atkPer));
        }
    }
    
    if(nr.masked.startsWith("when the xth counter is put on this, ") ||
        nr.masked.startsWith("when the xnd counter is put on this, ") ||
        nr.masked.startsWith("when the xst counter is put on this, "))
        {
            const nbCounters = nr.nextNumber();
            const restString = s.substring("when the xnd counter is put on this, ".length).trim();
            return { effectFunction: passive.onYourEventEffect("on:counter:modified", [effectParser(restString, game, () => {throw new Error("Failed to parse effect")}, true).effectFunction], game, s, false, false, (effect: EffectData, event: OnCounterModifiedData) => { return effect.it === event.card && event.newValue === nbCounters && event.previousValue < nbCounters }), targetSelectors: noTargets };
        }
    switch (nr.masked) {
        case "destroy this":
            return { effectFunction: active.destroyThisEffect(game), targetSelectors: noTargets };
        case "give another player a loot card.":
            return noTargetEffect(active.giveLootCardToAnotherPlayerEffect(game));
        case "till end of turn, if a player would roll a x or x, it becomes a x instead.":
            return noTargetEffect(passive.changeRollToXIfItIsXEffect(game, [nr.nextNumber(), nr.nextNumber()], nr.nextNumber()));
        case "then if this has x+ counters, remove all counters from this and deal x damage to a player or monster.":
            return noTargetEffect(active.removeCounterAndDamageIfAboveX(game, nr.nextNumber(), nr.nextNumber()));
        case "recharge up to x other items in play.":
            const upTo = nr.nextNumber();
            return { effectFunction: active.rechargeUpToXOtherItemsEffect(game, upTo), targetSelectors: selectTapItem(game, 1, upTo) };
        case "you have +x to your first attack roll each turn.":
            return noTargetEffect(passive.firstAttackRollDiceModifier(nr.nextNumber(), game));
        case "you have +x [atk] .":
            return noTargetEffect(passive.permanentStatModifierEffect([game.addAttack.bind(game)], nr.nextNumber(), game));
        case "you may attack any number of times on your turn.":
            return noTargetEffect(passive.onYourTurnModifier([game.addAttackThisTurn.bind(game)], INFINITY, game));
        case "you may attack players who control more souls than you. they have +x [dc] for the attack.":
            return noTargetEffect(room.otherPlayersAreAttackableEffect(game, nr.nextNumber(), true, (player: Player) => player.totalSouls > game.currentPlayer.totalSouls));
        case "subtract up to x from a roll.":
            return { effectFunction: active.subtractUpToXFromRollEffect(game), targetSelectors: selectRollAndNumber(game, [...Array(nr.nextNumber()+1).keys()]) };
        case "add up to x to an attack roll.":
            return { effectFunction: active.addUpToXToRollEffect(game, "attack"), targetSelectors: selectRollAndNumber(game, [...Array(nr.nextNumber()+1).keys()], 1, 1, "attack") };
        case "add up to x to a non-attack roll.":
            return { effectFunction: active.addUpToXToRollEffect(game, "non-attack"), targetSelectors: selectRollAndNumber(game, [...Array(nr.nextNumber()+1).keys()], 1, 1, "non-attack") };
        case "change a number in the effect text of a card in play or loot being played by x till end of turn. the number can't go below x or above x.":
            return { effectFunction: active.changeNumberInEffectTextEffect(game, nr.nextNumber(), nr.nextNumber(), nr.nextNumber()), targetSelectors: selectCardInPlayOrLootBeingPlayed(game) };
        case "add or subtract x from any of your non-attack rolls.":
            const val = nr.nextNumber();
            return noTargetEffect(passive.addToYourRollValueEffect(game, [-val, val], "non-attack", youMayEffectHanging));
        case "add x to a roll.":
            return { effectFunction: active.addXToRollEffect(nr.nextNumber()), targetSelectors: selectRoll(game) };
        case "choose a shop item. other players may bid ¢ for it, starting at x or more ¢. in turn order, other players may top the high bid. bidding ends when the high bid stands. the high bidder pays you the number of ¢ they bid and steals the chosen item.":
            return { effectFunction: active.shopItemAuctionEffect(game, nr.nextNumber()), targetSelectors: selectShopItem(game) };
        case "when you control x or x souls, you have +x [atk]":
            const nbSouls1 = nr.nextNumber();
            const nbSouls2 = nr.nextNumber();
            const atkBonus = nr.nextNumber();
            return { effectFunction: passive.ConditionalStatModifierEffect([game.addAttack.bind(game)], atkBonus, (player: Player) => [nbSouls1, nbSouls2].includes(player.totalSouls), ["on:soul:gained", "on:soul:removed"], game, true), targetSelectors: noTargets };
        case "this can't be recharged except by its own abilities.":
                return noTargetEffect(passive.onlyRechargeableByOwnAbilitiesEffect(game));
        case "while this has x counters on it, you have +x [atk] .":
            const counters = nr.nextNumber();
            const atkBonus2 = nr.nextNumber();
            return { effectFunction: passive.ConditionalStatModifierEffect([game.addAttack.bind(game)], atkBonus2, (player: Player, card: Card) => card.tags.counters === counters, ["on:counter:modified"], game, false), targetSelectors: noTargets };
        case "if you control x+ souls, you have +x [atk] instead.":
            const nbSouls = nr.nextNumber();
            const atk = nr.nextNumber();
            return { effectFunction: passive.ConditionalStatModifierEffect([game.addAttack.bind(game)], atk, (player: Player) => player.totalSouls >= nbSouls, ["on:soul:gained", "on:soul:removed"], game, true), targetSelectors: noTargets };
        case "choose a dice roll. its controller rerolls it, but rolls x dice instead. they choose another player. that player chooses one of the rolls as the result.":
            return { effectFunction: active.rerollDiceRollXEffect(game, nr.nextNumber()), targetSelectors: selectRoll(game) };
        case "reveal the top x cards of the loot deck. put each card with \"bomb\" in its name in your hand and the rest on the bottom of the loot deck.":
            return noTargetEffect(active.bombInLootDeckEffect(game, nr.nextNumber()));
        case "reveal the top x cards of the loot deck. put each card named pills in your hand and the rest on the bottom of the deck.":
            return noTargetEffect(active.pillsInLootDeckEffect(game, nr.nextNumber()));
        case "gain ¢ equal to the number of counters on this":
            return noTargetEffect(active.gainCoinsBasedOnCountersEffect(game));
        case "deal x damage to another monster or player.": 
            // It is used in "Each time you deal combat damage, deal x damage to another monster or player."
            // "another monster or player." is handled as "not engaged in combat monster or player, or yourself."
            return noTargetEffect(active.dealDamageNotEngagedInCombatOrYourselfEffect(game, nr.nextNumber()));
        case "destroy this and loot x.":
            return { effectFunction: active.destroyThisAndLootXEffect(game, nr.nextNumber()), targetSelectors: noTargets };
        case "choose another player. you and that player each loot x.":
            return { effectFunction: active.chooseAnotherPlayerAndLootXEffect(game, nr.nextNumber()), targetSelectors: selectPlayer(game) };
        case "change the result of a dice roll to a x.":
            return { effectFunction: active.changeRollDiceResultEffect(game), targetSelectors: selectRollAndNumber(game, [nr.nextNumber()]) };
        case "change the result of a dice roll to a x or x.":
            return { effectFunction: active.changeRollDiceResultEffect(game), targetSelectors: selectRollAndNumber(game, [nr.nextNumber(), nr.nextNumber()]) };
        case "then put x card from your hand on top of the loot deck.":
            return { effectFunction: active.putXCardFromYourHandOnTopOfLootDeck(game, nr.nextNumber()), targetSelectors: noTargets };
        case "choose a non-eternal item. put a counter on that item or remove one from it.":
            return { effectFunction: active.addOrRemoveCounterOnCardEffect(game, 1, "any", "selectionOnResolve", youMayEffectHanging, selectNonEternalItemFromAnywhere(game)), targetSelectors: selectNonEternalItemFromAnywhere(game) };
        case "choose a non-eternal card in play. put a counter on it of a type already on it or remove a counter from it.":
            return { effectFunction: active.addOrRemoveCounterOnCardEffect(game, 1, "alreadyOnIt", "next", youMayEffectHanging), targetSelectors: selectNonEternalItem(game) };
        case "put a card from your hand on top of the loot deck.":
        case "put a loot card from your hand on top of the loot deck.":
            return { effectFunction: active.putXCardFromYourHandOnTopOfLootDeck(game, 1), targetSelectors: noTargets };
        case "when this is destroyed, gain +x treasure.":
            return { effectFunction: passive.gainTreasureOnDestroyEffect(game, nr.nextNumber()), targetSelectors: noTargets };
        case "when this is destroyed, gain x¢ and loot x, where x is equal to the number of counters on this.":
            return noTargetEffect(passive.gainCoinsAndLootOnDestroyBasedOnCountersEffect(game));
        case "each time another player purchases a shop item, gain x¢ and loot x.":
            return noTargetEffect(passive.onAnotherPlayerEventEffect("on:purchase:success", [active.gainCoinsEffect(game, nr.nextNumber()), active.lootCardsEffect(game, nr.nextNumber())], game, s, (data:EffectData, e:any) => e.index !== "top"));
        case "each time you purchase from the shop or treasure deck, gain x¢.":
            return noTargetEffect(passive.onYourEventEffect("on:purchase:success", [active.gainCoinsEffect(game, nr.nextNumber())], game, s,false, false));
        case "damage you would take is reduced to x.":
            return { effectFunction: passive.reduceDamageToXEffect(game, nr.nextNumber()), targetSelectors: noTargets };
        case "when you would roll a x, you may change the result to a x.":
            return { effectFunction: passive.changeRollXToYEffect(game, nr.nextNumber(), nr.nextNumber()), targetSelectors: noTargets };
        case "destroy all souls. each player discards their hand and loots x.":
            return { effectFunction: active.combineEffectFunctions([active.destroyAllSoulsEffect(game), room.discardHandsAndLootEffect(game, nr.nextNumber())]), targetSelectors: noTargets };
        case "if you would loot, except during the loot step, instead loot that much +x.":
            return { effectFunction: passive.lootPlusXExceptLootStepEffect(game, nr.nextNumber()), targetSelectors: noTargets };
        case "when you start the game, look at the top x cards of the treasure deck and choose one. it becomes your starting item and gains eternal. put the rest on the bottom of the treasure deck.":
            return { effectFunction: passive.startingItemEffect(game, nr.nextNumber()), targetSelectors: noTargets };
        case "before a dice is rolled, choose a number. if the next roll is that number, loot x.":
            return { effectFunction: passive.lootOnNextRollEffect(game, nr.nextNumber()), targetSelectors: selectNumber1to6() };
        case "each other player may choose to gain x¢. gain x¢ + x¢ for each player who did.":
            return noTargetEffect(active.eachOtherPlayerMayGainCoinEffect(game, nr.nextNumber(), nr.nextNumber(), nr.nextNumber()));
        case "when you roll an attack roll of x, end your turn. cancel everything that hasn't resolved.":
            return noTargetEffect(passive.endTurnOnAttackRollXEffect(game, nr.nextNumber()));
        case "the next time a player would roll a dice, they instead roll x dice. you choose one of the rolls as the result.":
            return noTargetEffect(passive.rollXChoose1Effect(game, nr.nextNumber()));
        case "you gain +x [hp] till the end of turn.":
        case "you gain +x [hp] till end of turn":
        case "gain +x [hp] till end of turn.":
            return { effectFunction: passive.temporaryStatModifierEffect([game.addHealth.bind(game)], nr.nextNumber(), game, "issuer"), targetSelectors: noTargets };
        case "choose a player.\nthey gain +x [hp] till end of turn.":
            return { effectFunction: passive.temporaryStatModifierEffect([game.addHealth.bind(game)], nr.nextNumber(), game, "next"), targetSelectors: selectPlayer(game) };
        case "choose a player.\nthey gain +x [atk] and +x [hp] till end of turn.":
            return { effectFunction: passive.temporaryStatModifierEffect([game.addAttack.bind(game), game.addHealth.bind(game)], nr.nextNumber(), game, "next"), targetSelectors: selectPlayer(game) };
        case "choose a player.\nthey gain +x [atk] and +x to dice rolls till end of turn.":
            return { effectFunction: passive.temporaryStatModifierEffect([game.addAttack.bind(game), game.addDiceModifier.bind(game)], nr.nextNumber(), game, "next"), targetSelectors: selectPlayer(game) };
        case "choose a player.\nthey gain +x [atk] till end of turn and may attack an additional time this turn.":
            return { effectFunction: passive.temporaryStatModifierEffect([game.addAttack.bind(game), game.addAttackThisTurn.bind(game)], nr.nextNumber(), game, "next"), targetSelectors: selectPlayer(game) };
        case "you have +x [hp] while this has a counter on it.":
            return { effectFunction: passive.ConditionalStatModifierEffect([game.addHealth.bind(game)], nr.nextNumber(), (player, card) => card.tags.counters > 0, ["on:counter:modified"], game, false ), targetSelectors: noTargets };
        case "choose a player. prevent the next x damage they would take this turn. till end of turn, when that player dies, deal x damage to each player other than that player and you.":
            return { effectFunction: passive.preventDamageAndDealOnDeathEffect(game, nr.nextNumber(), nr.nextNumber()), targetSelectors: selectAlivePlayer(game) };
        case "you have +x to attack rolls.":
            return { effectFunction: passive.permanentStatModifierEffect([game.addAttackDiceModifier.bind(game)], nr.nextNumber(), game), targetSelectors: noTargets };
        case "monsters have +x [dc] on your turn.":
            return { effectFunction: passive.onYourTurnModifier([game.addDCToEachMonster.bind(game)], nr.nextNumber(), game), targetSelectors: noTargets };
        case "look at the top x cards of the monster or room deck and put them back in any order":
            return { effectFunction: active.lookAndReorderTopCardsEffect(game, nr.nextNumber(), undefined, "dataIssuer"), targetSelectors: selectDeck(game, 1, 1, (name) => ["room", "monster"].includes(name)) };
        case "choose up to x non-event monster cards in discard. put them in one or more monster slots not being attacked.":
            const numberToPut = nr.nextNumber();
            return { effectFunction: active.putMonstersFromDiscardIntoSlotsEffect(game, numberToPut), targetSelectors: selectXCardsFromDiscard(game, "monster", 0, numberToPut, (card) => card instanceof MonsterCard && !card.isEvent) };
        case "before a dice is rolled, choose a number. till the end of turn, each time that number is rolled, deal x damage to a monster or player.":
            return { effectFunction: passive.chooseNumberDamageOnRollThisTurnEffect(game, nr.nextNumber()), targetSelectors: selectNumber1to6() };
        case "you may attack an additional time this turn.":
            return noTargetEffect(active.giveAdditionalAttackThisTurnEffect(game, 1));
        case "put counters on this equal to the amount of damage taken. then, if this has x+ counters, remove x counters from this and gain +x treasure.":
            return { effectFunction: active.addCountersAndGainTreasureEffect(nr.nextNumber(), nr.nextNumber(), nr.nextNumber(), game), targetSelectors: noTargets };
        case "add or subtract x from a roll.":
            return { effectFunction: active.addOrSubtractXFromRollEffect(game), targetSelectors: selectRollAddOrSubtract(game, nr.nextNumber()) };
        case "if this has x+ counters, it becomes a soul and loses all abilities.":
        case "then, if this has x+ counters, it becomes a soul and loses all abilities.":
            return noTargetEffect(active.becomeSoulIfAboveXCountersEffect(nr.nextNumber(), game));
        case "if you would gain any number of treasures, instead gain that many +x.":
            return noTargetEffect(passive.gainPlusTreasureEffect(game, nr.nextNumber()));
        case "when an attack is declared on this, each non-active player rolls:\nx-x: they must make an attack roll against this after each attack roll the active player makes this attack.":
            const n1 = nr.nextNumber();
            const n2 = nr.nextNumber();
            return noTargetEffect(room.onAttackDeclaredNonActivePlayersRollToJoinEffect(game, Math.min(n1, n2), Math.max(n1, n2)));
        case "each other player may choose to loot x. each player that does gives you a loot card.":
            return noTargetEffect(active.eachOtherPlayerLootsAndYouLootEffect(game, nr.nextNumber()));
        case "the player attacking this gains its reward, then you flip it. that player may attack an additional time this turn.":
            return noTargetEffect(active.flipAndAddAttackEffect(game));
        case "put a non-event monster card in discard in a monster slot not being attacked.":
            return { effectFunction: active.putMonstersFromDiscardIntoSlotsEffect(game, 1), targetSelectors: selectXCardsFromDiscard(game, "monster", 1, 1, (card) => card instanceof MonsterCard && !card.isEvent) };
        // passive effects
        case "[paid effect]":
        case "":
            return noTargetEffect(()=>true);
        case "each time you roll the same result twice in a row on an attack roll on the same turn, kill the monster you're attacking.":
            return { effectFunction: passive.killOnDoubleAttackRollEffect(game), targetSelectors: noTargets };
        case "the next time a player would loot, they loot from the top of the loot discard instead.":
            return noTargetEffect(passive.lootFromDiscardEffect(game));
        case "if you control this as the game starts, you go first.":
            return { effectFunction: passive.goFirstInTurnOrderEffect(game), targetSelectors: noTargets };
        case "this has the abilities of other items with gold counters on them.":
            return noTargetEffect(passive.copyAbilitiesFromGoldCounterItemsEffect(game));
        case "this enters play deactivated.":
            return { effectFunction: passive.enterPlayDeactivatedEffect(game), targetSelectors: noTargets };
        case "take x damage and put a counter on this. then, if this has x+ counters, it becomes a soul and loses all abilities.":
            return noTargetEffect(active.takeDamageAndAddCounterEffect(game, nr.nextNumber(), nr.nextNumber()));
        case "cancel your attack on a monster.":
            return { effectFunction: active.cancelAttackOnMonsterEffect(game), targetSelectors: noTargets };
        case "give this to another player.":
        case "give this card to another player.":
            return noTargetEffect(active.giveThisToAnotherPlayerEffect(game));
        case "discard a loot card. if you can't, take x damage.":
            return noTargetEffect(active.discardLootOrTakeDamageEffect(game, nr.nextNumber()));
        case "choose a non-active player. the next time the active player declares an attack this turn, the chosen player must make an attack roll after each attack roll the active player makes for the attack. if that monster dies this attack, the chosen player also gains the rewards.":
            return { effectFunction: active.nonActivePlayerHelpFight(game), targetSelectors: selectAliveNonActivePlayer(game) };
        case "choose a player. each item they control gains eternal till end of turn.":
            return { effectFunction: passive.gainEternalTillEndOfTurnEffect(game), targetSelectors: selectPlayer(game) };
        case "each time you die, choose another player. that player dies.":
            return { effectFunction: passive.afterDeathPenaltyEffect([active.killTargetEffect(game, selectAnotherPlayer(game), true, false)], game), targetSelectors: noTargets };
        case "prevent all non-combat damage you would take.":
            return { effectFunction: passive.preventNonCombatDamageEffect(game), targetSelectors: noTargets };
        case "flip this item.":
            return { effectFunction: active.flipThisItemEffect(game), targetSelectors: noTargets };
        
        case "you don't lose ¢ or discard loot cards when paying the death penalty.":
            return { effectFunction: passive.noDeathPenaltyCoinsAndLootEffect(game), targetSelectors: noTargets };
        case "if this would be destroyed, it becomes a soul instead.":
            return { effectFunction: passive.becomeSoulInsteadOfDestructionEffect(game), targetSelectors: noTargets };
        case "the first time you take damage each turn, you may recharge an item.":
            return { effectFunction: passive.onFirstDamageEachTurnEffect([active.rechargeItemsEffect(game, true)], game), targetSelectors: noTargets };
        case "if another player would pay the death penalty, you choose what item they would destroy and you gain any loot cards and ¢ they would lose.":
            return { effectFunction: passive.replaceDeathPenaltyEffect(game), targetSelectors: noTargets };
        
        case "choose a player or monster. prevent the next instance of damage they would take this turn.":
            return { effectFunction: passive.preventNextDamageUpToEffect(INFINITY, game), targetSelectors: selectPlayerOrMonster(game) };
        
        case "choose a player. till end of turn, if they would loot any number of loot cards, they loot double that number instead.":
            return { effectFunction: passive.lootDoubleThisTurnEffect(game), targetSelectors: selectPlayer(game) };
        case "other players can't play loot cards or activate items on your turn.":
            return { effectFunction: passive.noPriorityPassesOnYourTurnEffect(game), targetSelectors: noTargets };
        case "other players can't play loot cards or activate items till end of turn.":
            return { effectFunction: passive.noPriorityPassesTillEndOfTurnEffect(game), targetSelectors: noTargets };
        case "the next time you play a non-trinket, non-ambush loot card this turn, copy it.":
            return { effectFunction: passive.copyNextNonTrinketNonAmbushLootThisTurnEffect(game), targetSelectors: noTargets };
        case "put a room or monster not being attacked into discard.":
            return { effectFunction: active.putRoomOrMonsterIntoDiscardEffect(game, false), targetSelectors: noTargets };
        case "you may put a room or monster not being attacked into discard.":
            return { effectFunction: active.putRoomOrMonsterIntoDiscardEffect(game, true), targetSelectors: noTargets };
        case "choose a monster being attacked. heal that monster to full [hp] , then deal damage equal to the number of [hp] healed in this way to another monster. if it's not your turn, cancel the attack and the active player may make an additional attack this turn.":
            return {effectFunction: active.healMonsterThenDamageAnotherEffect(game), targetSelectors: selectMonsterBeingAttacked(game) };
        
        case "each other player plays with their hand revealed.":
            return noTargetEffect(passive.eachOtherPlayerRevealsHandEffect(game));
        case "if another player declares an attack on a monster, you may choose which monster they attack.":
            return noTargetEffect(passive.chooseMonsterWhenAnotherPlayerAttacksMonsterEffect(game));
        case "play an additional loot card this turn.":
        case "play an additional loot card this turn":
            return { effectFunction: passive.temporaryStatModifierEffect([game.addLootPlay.bind(game)], 1, game, "issuer"), targetSelectors: noTargets };
        case "if this would be destroyed, if it has no counters on it, put a counter on it instead.":
            return { effectFunction: passive.putCounterInsteadOfDestructionEffect(game), targetSelectors: noTargets };
        case "if you would take damage while this has counters on it, remove that many counters and prevent that much damage.":
            return { effectFunction: passive.preventDamageByRemovingCountersEffect(game), targetSelectors: noTargets };
        case "if you would gain any amount of ¢, this levels up by that much instead.":
            return { effectFunction: passive.gainCoinsLevelUpEffect(game), targetSelectors: noTargets };
        case "each time a player dies, this levels up.":
            return { effectFunction: passive.onAnyEventEffect("on:death:penalty", [(data:EffectData)=>{game.addToCounter(data.issuer, data.it, "counters", 1); return true;}], game, nr.masked), targetSelectors: noTargets };
        case "rewards are doubled till end of turn.":
            return { effectFunction: passive.doubleRewardsTillEndOfTurnEffect(game), targetSelectors: noTargets };
        case "you may look at the top card of the treasure deck at any time on your turn.":
            return { effectFunction: passive.onYourTurnModifier([game.addCanSeeTopOfTreasureDeck.bind(game)], 1, game), targetSelectors: noTargets };
        case "you may purchase an additional time on your turn.":
            return { effectFunction: passive.onYourTurnModifier([game.addPurchaseThisTurn.bind(game)], 1, game), targetSelectors: noTargets };
        case "you may attack an additional time on your turn.":
            return { effectFunction: passive.onYourTurnModifier([game.addAttackThisTurn.bind(game)], 1, game), targetSelectors: noTargets };
        case "you may play an additional loot card on your turn.":
            return { effectFunction: passive.onYourTurnModifier([game.addLootPlay.bind(game)], 1, game), targetSelectors: noTargets };
        
        // active effects
        case "put a gold counter on another non-eternal item you control.":
            return noTargetEffect(passive.giveCounterToAnotherItemOnEnterPlayEffect(game, "goldCounters"));
        case "choose a shop item. this gains the abilities of that item till end of turn.":
            return { effectFunction: passive.gainAbilitiesUntilEffect(game, "on:turn:end", selectShopItem(game)[0]!, false), targetSelectors: selectShopItem(game) };
        case "choose a shop item. this gains the abilities of that item till the start of your next turn. recharge this.":
            return { effectFunction: passive.gainAbilitiesUntilEffect(game, "on:turn:start", selectShopItem(game)[0]!, true), targetSelectors: selectShopItem(game) };
        case "prevent death, heal to full [hp] , and cancel your attack":
            return { effectFunction: active.preventDeathHealFullCancelAttackEffect(game), targetSelectors: noTargets };
        case "choose another player. they give you a loot card. reveal it":
            return { effectFunction: active.playerGivesLootCardEffect(game, true, true), targetSelectors: selectAnotherPlayer(game) };
        case "you must play that loot card if able. this doesn't use a loot play.":
            return { effectFunction: active.playForFreeTargetEffect(game), targetSelectors: noTargets };
        case "choose a player or monster":
            return { effectFunction: (data:EffectData) => { return true; }, targetSelectors: selectPlayerOrMonster(game) };
        case "monster have -x [dc] on your turn, where x is the number of souls the player with the most souls controls minus the number of souls you control.":
            return noTargetEffect(passive.soulDiffDCModifierOnYourTurnEffect(game));
        case "prevent death. if it's your turn, cancel everything that hasn't resolved and end it.":
            return { effectFunction: active.preventDeathEndTurnEffect(game), targetSelectors: noTargets };
        case "remove x or more counters from this:\nloot x. if x+ counters were removed, deal x damage to a monster instead.":
            return noTargetEffect(active.removeCountersAndLootOrDamageEffect(game, nr.nextNumber(), nr.nextNumber(), nr.nextNumber(), nr.nextNumber()));
        case "prevent death. if it's your turn, cancel everything that hasn't resolved and end your turn.":
            return { effectFunction: active.preventDeathEndTurnEffect(game), targetSelectors: noTargets };
        case "discard any number of loot cards":
            return { effectFunction: active.discardAnyNumberOfLootCardsEffect(game, youMayEffectHanging), targetSelectors: noTargets };
        case "give another non-eternal item you control to another player": 
            return { effectFunction: active.giveItemToAnotherPlayerEffect(game), targetSelectors: [selectAnotherItemYouControl(game)[0]!, selectAnotherPlayer(game)[0]!] };
        case "put a monster not being attacked under this if there are no cards under this.":
            return { effectFunction: active.putMonsterUnderThisEffect(game), targetSelectors: selectMonsterNotBeingAttacked(game) };
        case "put a monster from under this in a monster slot not being attacked. the active player must make an additional attack on it this turn.":
            return noTargetEffect(active.putMonsterFromUnderThisIntoSlotEffect(game));
        case "put the top card of any discard on top of its deck.":
            return { effectFunction: active.putTopCardFromDiscardOnTopEffect(game), targetSelectors: selectTopAnyDiscard(game) };
        case "the first time each turn another player plays a loot card that targets you or something you control, you may cancel it.":
            return noTargetEffect(passive.cancelLootCardThatTargetsYouEffect(game));
        case "reroll an item they control.":
            return noTargetEffect(active.rerollItemTheyControlEffect(game, youMayEffectHanging));
        case "choose a dice roll. its controller rerolls it.":
            return { effectFunction: active.rerollDiceEffect(), targetSelectors: selectRoll(game) };
        case "they must give you a loot card.":
            return { effectFunction: active.makePlayerGiveLootCardEffect(game, "diceRoll"), targetSelectors: noTargets };
        case "recharge your character.":
            return { effectFunction: active.rechargeCharaEffect(game, youMayEffectHanging), targetSelectors: noTargets };
        case "choose a living player. that player dies.":
            return { effectFunction: active.deathTargetEffect(game, true), targetSelectors: selectAlivePlayer(game) };
        case "choose another player. they give you half of their ¢ and loot cards rounded down, then gives you an item.":
            return { effectFunction: active.halfLootAndCoinsAndGiveItemEffect(game), targetSelectors: selectAnotherPlayer(game) };
        case "recharge an item.":
            return { effectFunction: active.rechargeItemsEffect(game, selectionOnResolve, youMayEffectHanging), targetSelectors: selectItem(game) };
        case "cancel an attack on a monster and put that monster card on the bottom of the monster deck.":
            return { effectFunction: active.cancelAttackAndPutMonsterOnBottomEffect(game), targetSelectors: selectMonsterBeingAttacked(game) };
        case "you may put the top card of a deck into discard.":
            youMayEffectHanging[0] = true;
            return { effectFunction: active.discardTopOfDeckEffect(game, youMayEffectHanging), targetSelectors: selectDeck(game) };
        case "put the top card of a deck into discard.":
            return { effectFunction: active.discardTopOfDeckEffect(game, youMayEffectHanging), targetSelectors: selectDeck(game) };
        case "look at a player's hand and the top card of a deck":
            return { effectFunction: active.lookAtPlayerHandAndTopOfDeckEffect(game), targetSelectors: [...selectPlayer(game), ...selectDeck(game)] };
        case "look at the top card of the loot deck. you may put it on the bottom.":
            return { effectFunction: active.LookAndPutBottomEffect("loot", game), targetSelectors: noTargets };
        case "look at the top card of the monster deck. you may put it on the bottom.":
            return { effectFunction: active.LookAndPutBottomEffect("monster", game), targetSelectors: noTargets };
        case "look at the top card of the treasure deck, you may put it on the bottom.":
            return { effectFunction: active.LookAndPutBottomEffect("treasure", game), targetSelectors: noTargets };
        case "recharge another item.":
            return { effectFunction: active.rechargeItemsEffect(game, selectionOnResolve), targetSelectors: selectAnotherItemFromAnywhere(game) };
        case "look at a player's hand. you may swap a card from your hand with one of theirs.":
            return { effectFunction: active.lookAtPlayerHandAndSwapEffect(game), targetSelectors: selectPlayer(game) };
        case "look at their hand and steal a loot card from them.":
            return { effectFunction: active.lookAtHandAndStealLootEffect(game), targetSelectors: noTargets };
        case "force that player to reroll it.":
            return { effectFunction: active.forcePlayerRerollDiceEffect(game), targetSelectors: noTargets };
        case "destroy a curse.":
            return { effectFunction: active.destroyCurseEffect(game), targetSelectors: selectCurse(game) };
        case "shuffle the monster deck.":
            return { effectFunction: active.shuffleDeckEffect(game, "monster"), targetSelectors: noTargets };
        case "shuffle the treasure deck.":
            return { effectFunction: active.shuffleDeckEffect(game, "treasure"), targetSelectors: noTargets };
        case "the next time your turn ends, destroy a non-eternal item you control.":
            return { effectFunction: active.destroyYourItemOnYourNextTurnEndEffect(game), targetSelectors: noTargets };
        case "search the treasure deck for a guppy item, gain it":
            return { effectFunction: active.searchGuppyItemEffect(game), targetSelectors: noTargets };
        case "deactivate each item you control and your character.":
            return noTargetEffect(active.deactivateAllYourItemsAndCharaEffect(game));
        case "choose a player at random. that player destroys an item they control.":
            return { effectFunction: active.destroyItemOfRandomPlayerEffect(game), targetSelectors: noTargets };
        case "destroy an item or soul.":
            return { effectFunction: active.destroyOneEffect(game), targetSelectors: selectNonEternalItemOrASoul(game) };
        case "destroy another item":
            return { effectFunction: active.destroyOneEffect(game), targetSelectors: selectAnotherNonEternalItemFromAnywhere(game) };
        case "discard your hand":
            return { effectFunction: active.discardHandEffect(game), targetSelectors: noTargets };
        case "destroy an item. if that item was controlled by a player, they steal an item from the shop.":
            return { effectFunction: active.destroyItemStealFromShopEffect(game, false), targetSelectors: selectNonEternalItemFromAnywhere(game) };
        case "destroy an item. if it was controlled by a player, they may steal an item from the shop.":
            return { effectFunction: active.destroyItemStealFromShopEffect(game, true), targetSelectors: selectNonEternalItemFromAnywhere(game) };
        case "destroy an item you control.":
            return { effectFunction: active.destroyOneEffect(game), targetSelectors: selectItemYouControl(game) };
        case "destroy a soul you control.":
            return { effectFunction: active.destroyOneEffect(game, selectSoulYouControl(game)[0]), targetSelectors: noTargets };
        case "each player votes on an item in play. destroy the item with the most votes. if there is a tie, nothing happens.":
            return { effectFunction: active.eachPlayersVoteToDestroyItemEffect(game), targetSelectors: noTargets };
        
        case "gain double the number of ¢ you would've gained.":
            return { effectFunction: active.modifyCoinGainedEffect(game, (original) => original * 2), targetSelectors: noTargets };
        case "swap this with a non-eternal item another player controls.":
            return {
              effectFunction: active.swapWithNonEternalItemEffect(game),
              targetSelectors: selectAnotherPlayerNonEternalItem(game),
            };
        case "as you play this, choose an item. this copies one of that item's ↷ abilities.":
            return { effectFunction: active.copyTapAbilityEffect(game), targetSelectors: selectAnyTapItem(game) };
        case "this copies a ↷ ability of a non-eternal item.":
            return { effectFunction: active.copyTapAbilityEffect(game), targetSelectors: selectNonEternalTapItem(game) };
        case "choose a non-eternal item. this becomes a copy of that item.\n(this change is indefinite.)":
            return { effectFunction: active.becomesCopyOfItemIndefinitelyEffect(game), targetSelectors: selectNonEternalItemFromAnywhere(game) };
        case "choose a non-eternal passive item. this becomes a copy of that item till end of turn.":
            return { effectFunction: active.becomesCopyOfItemUntilEndOfTurnEffect(game), targetSelectors: selectNonEternalPassiveItem(game) };
        case "choose a shop item. this becomes a copy of that item till the start of your next turn. recharge this.":
            return { effectFunction: active.becomesCopyOfItemUntilStartOfYourNextTurnAndRechargeEffect(game), targetSelectors: selectShopItem(game) };
        case "choose a character card from outside the game. replace your character with it and your starting item with the chosen card's starting item.":
            return { effectFunction: active.replaceCharacterWithOutsideCardEffect(game), targetSelectors: selectCharacterCardFromOutside(game) };
        case "you may put a shop item into discard.":
            return noTargetEffect(active.discardAnyNumberOfShopItemsEffect(game, 0, 1, "onResolve"));
        case "put a shop item into discard.":
            return { effectFunction: active.discardAnyNumberOfShopItemsEffect(game, 1, 1, "next"), targetSelectors: selectShopItem(game) };
        case "you may put any number of shop items into discard.":
            return { effectFunction: active.discardAnyNumberOfShopItemsEffect(game, 0, "any", "onResolve"), targetSelectors: noTargets };
        case "cancel the triggered ability of a monster or non-eternal item.":
                return { effectFunction: active.cancelStackElementEffect(game), targetSelectors: selectPassiveAbilityOrMonsterAbility(game) };
        case "cancel the ↷ or $ ability of an item.":
            return { effectFunction: active.cancelStackElementEffect(game), targetSelectors: selectUsableAbilityStackElement(game) };
        case "put any number of non-event monster cards in discard on top of the monster deck.":
            return { effectFunction: active.putAnyNumberFromDiscardOnTopEffect("monster", game, (card) => card instanceof MonsterCard && card.encounterType !== MonsterType.EVENT), targetSelectors: noTargets };
        case "steal a soul from another player.":
            return { effectFunction: active.stealSoulEffect(game), targetSelectors: selectAnotherPlayer(game) };
        case "put this into discard.": // this should be only used in events
            return { effectFunction: active.putThisIntoDiscardEffect(game), targetSelectors: noTargets };
        case "steal a non-eternal item from a player.":
            return { effectFunction: active.stealNonEternalItemEffect(game), targetSelectors: selectAnotherPlayerNonEternalItem(game) };
        case "steal a non-eternal item a player controls.":
            return { effectFunction: active.stealNonEternalItemEffect(game), targetSelectors: selectAnotherPlayerNonEternalItem(game) };
        case "loot equal to the number of cards discarded in this way.":
            return { effectFunction: active.lootEqualToCardsDiscardedEffect(game), targetSelectors: noTargets };
        case "each player votes on an item in play. destroy the item with the most votes. If there is a tie, nothing happens.":
            return { effectFunction: active.eachPlayersVoteToDestroyItemEffect(game), targetSelectors: noTargets };
        case "abilities and the death penalty can't make you discard loot cards or lose ¢.":
            return { effectFunction: passive.noLootDiscardOrCoinLossEffect(game), targetSelectors: noTargets };
        case "die":
        case "you die.":
            return noTargetEffect(active.dieEffect(game));
        case "swap a non-eternal item you control with a non-eternal item they control.":
            return { effectFunction: active.swapNonEternalItemsEffect(game, youMayEffectHanging), targetSelectors: [selectItemYouControl(game)[0]!, selectAnotherPlayerNonEternalItem(game)[0]!] };
        case "choose a player. loot and gain ¢ until you have the same number of each as they do.":
            return { effectFunction: active.lootAndGainAsPlayerEffect(game), targetSelectors: selectPlayer(game) };
        case "put a monster into discard and replace it with the top card of the monster deck":
            return { effectFunction: active.flushOneMonsterSlotEffect(game, 1), targetSelectors: noTargets };
        case "you may put a monster not being attacked into discard and replace it with the top card of the monster deck.":
            return { effectFunction: active.flushOneMonsterSlotEffect(game, 0), targetSelectors: noTargets };
        case "put the top card of the monster deck in a monster slot not being attacked.":
            return { effectFunction: active.putTopMonsterInValidSlotEffect(game, false), targetSelectors: noTargets };
        case "you may put the top card of the monster deck in a monster slot not being attacked.":
            return { effectFunction: active.putTopMonsterInValidSlotEffect(game, true), targetSelectors: noTargets };
        case "it becomes a soul.\n(it's no longer an item.)":
            return { effectFunction: active.enterPlayBecomeSoulEffect(game), targetSelectors: noTargets };
        case "cancel the ↷ or $ ability of an item or loot being played.":
        case "cancel the ↷ or $ ability of an item or a loot being played.":
            return { effectFunction: active.cancelStackElementEffect(game), targetSelectors: selectStackElementOrLoot(game) };
        case "cancel the effect of a loot being played.":
            return { effectFunction: active.cancelStackElementEffect(game, selectLootOnStack(game), selectionOnResolve ), targetSelectors: selectLootOnStack(game) };
        case "each other player discards a loot card.":
            return { effectFunction: active.eachOtherPlayerDiscardsLootEffect(game), targetSelectors: noTargets };
        case "put each monster not being attacked into discard and replace each with the top card of the monster deck.":
            return { effectFunction: active.flushMonsterSlotsEffect(game, "discardAndDraw"), targetSelectors: noTargets };
        case "put each monster not being attacked on the bottom of the monster deck.":
            return { effectFunction: active.flushMonsterSlotsEffect(game, "bottom"), targetSelectors: noTargets };
        case "look at each player's hand":
            return { effectFunction: active.lookAtHands(game), targetSelectors: noTargets };
        case "look at the top card of a deck. you may put that card on the bottom of that deck.":
            return { effectFunction: active.lookAtTopCardOfDeckEffect(game, "bottom"), targetSelectors: selectDeck(game) };
        case "look at the top card of a deck. you may put it into discard or put it back on top.":
            return { effectFunction: active.lookAtTopCardOfDeckEffect(game, "discard"), targetSelectors: selectDeck(game) };
        case "reveal the top card of any deck. put it back or put it into discard.":
            return { effectFunction: active.lookAtTopCardOfDeckEffect(game, "discard", true, true), targetSelectors: selectDeck(game) };
        case 'choose a player. they reroll each item they control.':
            return { effectFunction: active.rerollEachItemEffect(game), targetSelectors: selectPlayer(game) };
        case "choose another player. steal a loot card from them at random.":
            return { effectFunction: active.stealRandomLootCardEffect(game), targetSelectors: selectAnotherPlayer(game) };
        case "you must steal a loot card from from another player at random.":
            return { effectFunction: active.stealAPlayerRandomLootCardEffect(game), targetSelectors: noTargets };
        case "choose a monster. the active player must attack that monster this turn if able.":
            return { effectFunction: active.forceAttackMonsterEffect(game), targetSelectors: selectAttackableMonster(game) };
        case "you may play any number of additional loot cards till end of turn.":
            return { effectFunction: active.playUnlimitedLootCardsThisTurnEffect(game), targetSelectors: noTargets };
        case "recharge each item you control.":
            return { effectFunction: active.rechargeEachItemsOfTargetEffect(game, "issuer"), targetSelectors: selectPlayer(game) };
        case "recharge each item a player controls.":
        case "choose a player. recharge each item they control.":
            return { effectFunction: active.rechargeEachItemsOfTargetEffect(game, "next"), targetSelectors: selectPlayer(game) };
        case "deactivate an item.":
            return { effectFunction: active.deactivateItemEffect(game, selectionOnResolve, youMayEffectHanging), targetSelectors: selectTapItem(game) };
        case "choose a player. that player gives you a loot card.":
            return { effectFunction: active.makePlayerGiveLootCardEffect(game, "player"), targetSelectors: selectPlayer(game) };
        case "look at the top card of a deck.":
            return { effectFunction: active.lookAtTopCardOfDeckEffect(game, "just_watch"), targetSelectors: selectDeck(game) };
        case "end the turn. cancel everything that hasn't resolved.":
        case "cancel everything that hasn't resolved and end the turn.":
            return { effectFunction: active.endTurnAndResetStackEffect(game), targetSelectors: noTargets };
        
        case "choose the player with the most souls or tied for the most. that player destroys a soul they control.":
            return { effectFunction: active.makeAPlayerWithMostSoulsDestroyASoulEffect(game), targetSelectors: selectPlayerWithMostSouls(game) };
        case "loot x, where x is the number of souls the player with the most souls controls minus the number of souls you control.":
            return { effectFunction: active.lootBasedOnSoulsComparedToPlayerWithMostSoulsEffect(game), targetSelectors: noTargets };
        case "put the top card of each deck into discard.":
            return { effectFunction: active.putTopCardOfEachDeckIntoDiscardEffect(game), targetSelectors: noTargets };
        case "this becomes a copy of an eternal item you control. this loses eternal.":
            return { effectFunction: active.becomesCopyOfEternalItemLosesEternalEffect(game), targetSelectors: selectEternalItemYouControl(game) };
        case "each player gives their hand to the player to their left.":
            return { effectFunction: active.passHandsLeftEffect(game), targetSelectors: noTargets };
        case "steal a non-eternal item from a player or from the shop.":
            return { effectFunction: active.stealNonEternalItemFromAnywhereEffect(game), targetSelectors: selectNonEternalItemFromAnywhere(game) };
        case "look at the top card of each deck. you may put any of those cards on the bottom of their deck":
            return { effectFunction: active.look1EachDeckEffect(game), targetSelectors: noTargets };
        case "this becomes a soul and loses all abilities.":
            return { effectFunction: active.BecomesSoulEffect(game), targetSelectors: noTargets };
        case "put this on the bottom of the loot deck.":
            return { effectFunction: active.putThisOnBottomOfLootDeckEffect(game), targetSelectors: noTargets };
        case "take an extra turn after this one if it's your turn.":
            return { effectFunction: active.takeExtraTurnEffect(game), targetSelectors: noTargets };
        case "each player destroys a soul they control.":
            return { effectFunction: active.eachPlayerDestroysASoulEffect(game), targetSelectors: noTargets };
        case "choose a dice roll. its controller rerolls it.":
            return { effectFunction: active.rerollDiceByControllerEffect(game), targetSelectors: selectRoll(game) };
        case "give this to the player to your left.":
            return { effectFunction: active.giveThisToPlayerOnLeftEffect(game), targetSelectors: noTargets };
        case "change the result of a dice roll to a number of your choosing.":
            return { effectFunction: active.changeRollDiceResultEffect(game), targetSelectors: selectRollAndNumber(game, [1, 2, 3, 4, 5, 6]) };
        case "reroll an item you control.":
            return { effectFunction: active.rerollItemEffect(game, selectItemYouControl(game), selectionOnResolve), targetSelectors: selectItemYouControl(game) };
        case "reroll an item. (destroy that item and replace it with the top card of the treasure deck.)":
        case "reroll an item.\n(destroy that item and replace it with the top card of the treasure deck.)":
        case "reroll an item.":
            return { effectFunction: active.rerollItemEffect(game, selectNonEternalItemFromAnywhere(game), selectionOnResolve), targetSelectors: selectNonEternalItemFromAnywhere(game) };
        case "reroll each item you control.":
            return { effectFunction: active.rerollEachItemEffect(game, "issuer"), targetSelectors: noTargets };
        case "your character doesn't recharge during your recharge step.":
            return noTargetEffect(passive.noRechargeCharaDuringRechargeStepEffect(game));
        case "put each shop item on the bottom of the treasure deck.":
            return { effectFunction: active.flushShopEffect(game, "bottom"), targetSelectors: noTargets };
        case "that player gives you a loot card.":
            return { effectFunction: active.playerGivesLootCardEffect(game), targetSelectors: noTargets };
        case "put a non-event monster card in discard on top of the monster deck.":
            return { effectFunction: active.putMonsterFromDiscardOnTopEffect(game), targetSelectors: noTargets };
        case "recharge this.":
            return { effectFunction: active.rechargeThisEffect(game), targetSelectors: noTargets };
        case "this becomes a soul. gain it.":
            return { effectFunction: active.thisBecomeSoulGainItEffect(game), targetSelectors: noTargets };
        case "gain x¢, where x is the number of monster slots plus the number of loot cards in your hand.":
            return { effectFunction: active.gainCoinsBasedOnMonsterSlotsAndLootInHandEffect(game), targetSelectors: noTargets };
        case "choose another player. loot x, where x is the number of loot cards in that player's hand.":
            return { effectFunction: active.lootBasedOnTargetPlayersLootCardsEffect(game), targetSelectors: selectPlayer(game) };
        default:
            return null; // No match found
        }
}

function parseStandardMonsterEffect(s: string, game: Game, nr: NumberRobustString): ParsedEffect | null {

    if(s.startsWith("this takes no combat damage on attack rolls of") || s.startsWith("you take no combat damage on attack rolls of"))
    {
        const numbers = nr.numbers;
        return noTargetEffect(monster.noCombatDamageOnAttackRollEffect(game, numbers));
    }
    if(nr.masked.startsWith("each time this takes combat damage on an attack roll of x, "))
        return noTargetEffect(monster.onTakesCombatDamageEffect(game, s, [nr.nextNumber()]));
    if(s.startsWith("when an attack is declared on this, "))
        return noTargetEffect(monster.onAttackDeclaredEffect(game, s));

    if(s.startsWith("while this is at"))
        return noTargetEffect(monster.statModifierWhileAtHealthEffect(game, s));
    if(s.startsWith("each time this deals combat damage to a player, they "))
        return noTargetEffect(monster.OnDealsCombatDamageEffect(game, s));
    if(s.startsWith("combat damage this deals is "))
        return noTargetEffect(monster.combatDamageIsEffect(game, s));
    if(s.startsWith("each time this deals damage, ") ||
        s.startsWith("each time this deals combat damage, ")) 
            return noTargetEffect(monster.OnDealsDamageEffect(game, s));
    if(s.startsWith("each time this takes combat damage, "))
        return noTargetEffect(monster.onTakesCombatDamageEffect(game, s));
    if(s.startsWith("each time the attacking player activates an item, they "))
            return noTargetEffect(monster.onAttackingPlayerActivatesItemEffect(game, s));
    if(s.startsWith("when the attacking player rolls an attack roll of "))
            return noTargetEffect(monster.onAttackingPlayerRollsEffect(game, s));

    // Number-robust parsing for standard monster effects.
    // Keep this limited to cases where the extracted number(s) are used by the returned effect.
    {
        const n = (i: number): number => numberAtOrThrow(nr, i, nr.normalizedMasked);
        switch (nr.normalizedMasked) {
            case "when this dies, it deals x damage to the player who killed it":
                return noTargetEffect(monster.dealDamageToKillerOnDeathEffect(game, n(0)));
            case "put it in the monster deck x cards from the top":
                return noTargetEffect(monster.putInMonsterDeckNFromTopEffect(game, n(0)));
            case "after gaining rewards, the active player rolls-\nx or x: put this on top of the monster deck":
                // Use the extracted roll values directly.
                return noTargetEffect(monster.putOnTopOfMonsterDeckOnRollEffect(game, nr.numbers.slice()));
            case "when this dies on an attack roll of x, double its rewards":
                return noTargetEffect(monster.doubleRewardsOnDeathRollEffect(game, [n(0)]));
            case "it deals x damage to each player":
                return noTargetEffect(active.dealDamageToEachPlayerEffect(game, n(0)));
            case "deal x damage to each monster and player":
                return noTargetEffect(active.dealDamageToEachMonsterAndPlayerEffect(game, n(0)));
            case "it deals x damage to each non-active player":
                return noTargetEffect(active.dealDamageToEachPlayerEffect(game, n(0), false));
            case "this gains x [atk] till end of turn":
            case "it gains x [atk] till end of turn":
                return noTargetEffect(passive.temporaryStatModifierEffect([game.addAttack.bind(game)], n(0), game, "issuer"));
            case "other monsters have x [dc]":
                return noTargetEffect(monster.monstersGainDCEffect(game, n(0), false));
            case "monsters have x [dc]":
                return noTargetEffect(monster.monstersGainDCEffect(game, n(0), true));
            case "monsters have x [hp]":
                return noTargetEffect(monster.monstersGainHPEffect(game, n(0)));
            case "it heals x [hp]":
                return noTargetEffect(active.healEffect(game, n(0)));
            case "look at the top x cards of the monster deck and put them back in any order":
                return noTargetEffect(active.lookAndReorderTopCardsEffect(game, n(0), "monster", "currentPlayer"));
            case "deal x damage to the player to your left":
            case "deal x damage to the player to the active player's left":
                return noTargetEffect(monster.dealDamageToPlayerToTheEffect(game, n(0), "left"));
            case "deal x damage to the player to your right":
                return noTargetEffect(monster.dealDamageToPlayerToTheEffect(game, n(0), "right"));
            case "look at the top x cards of the loot deck. put them back in any order":
                return noTargetEffect(active.lookAndReorderTopCardsEffect(game, n(0), "loot"));
            case "when any player controls a soul, players who control the most souls or tied for the most must pay each other player x¢ to attack":
                return noTargetEffect(room.payOtherPlayersToAttackEffect(game, n(0)));
        }
        switch (nr.masked)
        {
            case "each time this would take damage, the active player rolls-\nx: prevent that damage.":
                return noTargetEffect(monster.preventDamageOnRollEffect(game, [nr.nextNumber()]));
            case "it deals x damage to each other monster.":
                return noTargetEffect(monster.dealDamageToEachOtherMonsterEffect(game, nr.nextNumber()));
            case "it deals x damage to the attacking player.":
                return noTargetEffect(monster.dealDamageToAttackingPlayerEffect(game, nr.nextNumber()));
            case "every other time this takes damage each turn, it gains +x [dc] till end of turn.":
                return noTargetEffect(monster.onEveryOtherDamageEffect(game, passive.temporaryStatModifierEffect([game.addDC.bind(game)], nr.nextNumber(), game, "issuer")));
            case "reveal cards from the top of the monster deck till you reveal x boss cards. put them in one or more monster slots not being attacked and the rest into discard. the active player must make an additional attack on one of them this turn.":
                return noTargetEffect(monster.bossRushEffect(game, nr.nextNumber()));
            case "look at the top x cards of a deck and put them back in any order.":
                return noTargetEffect(active.lookAndReorderTopCardsEffect(game, nr.nextNumber(), "selectOnResolve"));
            case "they take x damage.":
                return noTargetEffect(monster.targetTakeDamageEffect(game, nr.nextNumber()));
            case "the first time this would die each turn, prevent death. this heals x [hp] and gains +x [dc] and -x [atk] till end of turn.":
                const heal = nr.nextNumber();
                const dc = nr.nextNumber();
                const atk = nr.nextNumber();
                return noTargetEffect(monster.preventDeathFirstTimeEachTurnHealAndStatModifierEffect(game , heal, dc, -atk));
        }
    }
    switch (s) {
        
        case "search the monster deck for a card named the bloat and put it in a monster slot not being attacked":
            return noTargetEffect(monster.searchForBloatEffect(game));
        
        case "when this dies, the player that killed it discards their hand.":
            return noTargetEffect(monster.killerDiscardsHandOnDeathEffect(game));
        case "each time the active player deals damage to this, they roll-\n1-2: they take 1 damage.\n3-4: each player takes 1 damage.\n5-6: this takes 1 damage.":
                return noTargetEffect(monster.OnDamageByActivePlayerRollDealDamageEffect(game));
        case "when another monster dies, this dies.":
            return noTargetEffect(monster.dieWhenAnotherMonsterDiesEffect(game));
        case "this can't be attacked.":
            return noTargetEffect(monster.cantBeAttackedEffect(game));
        case "damage this deals to the active player is also dealt to the player to their left.":
            return noTargetEffect(monster.damageDealtToActivePlayerAlsoToTheEffect(game, "left"));
        case "choose the player with the most ¢ or tied for the most. that player loses all their ¢.":
            return noTargetEffect(monster.playerWithMostCoinsLosesAllEffect(game));
        case "damage dealt to this is also dealt to the player to the active player's right.":
            return noTargetEffect(monster.damageAlsoPlayerToTheEffect(game, "right"));
        case "when a player gains this soul, choose a player who controls the most souls or tied for the most. that player wins.":
            return noTargetEffect(monster.playerWithMostSoulsWinsEffect(game));
        case "you must attack on your turn if able.":
            return noTargetEffect(monster.attackRequirementEachTurnEffect(game, "any", 1, "total"));
        case "damage dealt to this is also dealt to the player to the active player's left.":
            return noTargetEffect(monster.damageAlsoPlayerToTheEffect(game, "left"));
        default:
            return null; // No match found
    }
}

function parseRoomEffect(s: string, game: Game, nr: NumberRobustString): ParsedEffect | null {

    // Number-robust parsing for room effects.
    // Keep this limited to cases where the extracted number(s) are used by the returned effect.
    const n = (i: number): number => numberAtOrThrow(nr, i, nr.normalizedMasked);
    switch (nr.normalizedMasked) {
        case "at the start of each turn, the active player gains x¢":
            return noTargetEffect(room.gainCoinsAtStartOfTurnEffect(game, n(0), true));
        case "shop items the active player purchases cost x¢ less":
            return noTargetEffect(room.cheaperShopItemsEffect(game, n(0)));
        case "each time a player declares an attack, before choosing what to attack, they may look at the top x cards of the monster deck and put them back in any order":
            return noTargetEffect(room.lookAtTopNOnAttackEffect(game, n(0)));
        case "each time a player dies, each other player gains x¢":
            return noTargetEffect(room.gainCoinsOnPlayerDeathEffect(game, n(0)));
        case "each time a player dies, each other player loots x":
            return noTargetEffect(room.lootOnPlayerDeathEffect(game, n(0)));
        case "at the end of the turn, the active player loses x¢":
            return noTargetEffect(room.loseCoinsAtEndOfTurnEffect(game, n(0)));
        case "at the end of each turn, the active player discards a loot card":
            return noTargetEffect(room.discardLootAtEndOfTurnEffect(game, 1));
        case "at the end of each turn, the active player discards x loot card":
            return noTargetEffect(room.discardLootAtEndOfTurnEffect(game, n(0)));
        case "monsters have x [atk]":
            return noTargetEffect(room.monstersGainAttackEffect(game, n(0), true));
        case "a monster gains x [dc] till end of turn":
            return {
                effectFunction: passive.temporaryStatModifierEffect([game.addDC.bind(game)], n(0), game, "next"),
                targetSelectors: selectMonster(game),
            };
        case "a monster gains -x [dc] till end of turn":
            return {
                effectFunction: passive.temporaryStatModifierEffect([game.addDC.bind(game)], -n(0), game, "next"),
                targetSelectors: selectMonster(game),
            };
        case "each player discards their hands and loots x":
            return noTargetEffect(room.discardHandsAndLootEffect(game, n(0)));
        case "each time a player loots, they take x damage":
            return noTargetEffect(room.takeDamageOnLootEffect(game, n(0)));
        case "players have x [hp]":
            return noTargetEffect(room.allPlayersPermanentStatModifierEffect([game.addHealth], n(0), game));
        case "each time a player deals damage to a monster, they deal x damage to the player to their left":
            return noTargetEffect(room.WhenDealDamageMonsterDealDamageToPlayerToTheEffect(game, n(0), "left"));
    }
    switch(nr.masked) {
        case "at the start of each turn, the active player gains x¢.":
            return noTargetEffect(room.gainCoinsAtStartOfTurnEffect(game, nr.nextNumber(), true));
        case "at the start of the turn, the active player may gain +x treasure.":
            return noTargetEffect(room.mayGainTreasureAtStartOfTurnEffect(game, nr.nextNumber()));
        case "at the end of the turn, if the active player has x or fewer loot cards in their hand, they take x damage.":
            return noTargetEffect(room.damageIfLowLootAtEndOfTurnEffect(game, nr.nextNumber(), nr.nextNumber()));
        case "reroll each item in play, each player discards their hand and loots x. put each monster into discard.":
            return noTargetEffect(room.enterPlayRerollItemsDiscardHandsLootAndFlushMonstersEffect(game, nr.nextNumber()));
        case "each time a player would roll a x or x, they may reroll it.":
            return noTargetEffect(room.rerollOnXOrYEffect(game, [nr.nextNumber(), nr.nextNumber()]));
        case "players have +x [atk] .":
            return noTargetEffect(room.allPlayersPermanentStatModifierEffect([game.addAttack], nr.nextNumber(), game));
        case "at the start of the turn, the active player may pay [hp] until they have x [hp] . if they do, each time a monster dies this turn, they gain +x treasure.":
            return noTargetEffect(room.payHpForTreasureBoostEffect(game, nr.nextNumber(), nr.nextNumber()));
        case "players who control the fewest souls or tied for fewest have +x [atk] and may attack an additional time on their turn.":
            return noTargetEffect(room.playersWithFewestSoulsAttackBoostEffect(game, nr.nextNumber()));
        
    }
    switch (s) {
        case "players can't gain souls.":
            return noTargetEffect(room.preventGainSoulsEffect(game));
        case "each time the active player attacks the top of the monster deck, after putting it in a monster slot, they may cancel their attack.":
            return noTargetEffect(room.cancelAttackOnTopOfMonsterDeckEffect(game));
        case "note each goal as players complete them. this room can't be put into discard till 4 goals are completed.\n1. play 5 loot cards.\n2. kill 3 monsters.\n3. give at least 6¢ to another player at one time.\n4. purchase 3 items.\n5. roll a 6 three times. when 4 goals are completed, each player gains +2 treasure.":
            return noTargetEffect(room.socialGoalsEffect(game));
        case "rewards are doubled.":
            return noTargetEffect(room.doubleRewardsEffect(game));
        case "when a player dies, if that player was attacked this turn, that player gives the active player the item they would destroy for the death penalty.":
            return noTargetEffect(room.giveDeathPenaltyItemToActivePlayerEffect(game));
        case "players who control the fewest souls or tied for fewest may purchase a shop item for 0¢ on their turn.":
            return noTargetEffect(room.playersWithFewestSoulsFreeShopItemEffect(game));
        case "the player who killed it kills another player.":
            return noTargetEffect(room.targetNextKillsAnotherPlayerEffect(game));
        case "at the start of the turn, the active player may reroll an item they control.":
            return noTargetEffect(room.mayRerollItemAtStartOfTurnEffect(game));
        case "at the end of the turn, put this into discard.":
            return noTargetEffect(room.putThisIntoDiscardAtEndOfTurnEffect(game));
        case "each player rerolls each of their items.":
            return noTargetEffect(active.rerollEachItemEffect(game, "eachPlayer"));
        
        case "put each shop item into discard.":
            return noTargetEffect(active.flushShopEffect(game, "discard"));
        case "put each monster into discard.":
            return noTargetEffect(active.flushMonsterSlotsEffect(game, "discard"));
        case "if a player would gain any amount of ¢, instead each player gains that much ¢.":
            return noTargetEffect(room.eachPlayerGainsCoinsEffect(game));
        case "at the end of the turn, if the active player didn't purchase a shop item, they discard their hand.":
            return noTargetEffect(room.discardHandIfNoShopPurchaseAtEndOfTurnEffect(game));
        case "each time a player gains a soul, they skip their next turn.":
            return noTargetEffect(room.skipNextTurnOnSoulGainEffect(game));
        case "this item can be attacked.":
        case "this room can be attacked.":
            return noTargetEffect(room.canBeAttackedEffect(game));
        
        case "players who control the most items or tied for the most may only recharge one item during their recharge step.":
            return noTargetEffect(passive.rechargeOneDuringRechargeStepEffect(game));
        
        case "when a player dies, before paying penalties, they must destroy an item they control.":
            return noTargetEffect(room.playerMustDestroyItemOnDeathEffect(game));
        case "at the end of the turn, the active player deactivates their character.":
            return noTargetEffect(room.deactivateCharacterAtEndOfTurnEffect(game));
        
        case "note each goal as players complete them.":
            return noTargetEffect((data: EffectData) => true);
        case "put each shop item or each monster not being attacked into discard.":
            return noTargetEffect(room.flushShopOrUnattackedMonstersEffect(game));
        case "players can't activate more than one ability each turn.":
            return noTargetEffect(room.playersCanOnlyActivateOnceATurn(game));
        case "players can't play more than one loot card each turn.":
            return noTargetEffect(room.playersCanOnlyPlayLootOnceATurn(game));
        default:
            return null; // No match found
    }
}