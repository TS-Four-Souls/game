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
import type { OnDeathMonsterData } from "../types/eventTypes";
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

class NumberRobustString extends String {
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

type NumberRobustCheck = {
    /** Masked patterns (numbers replaced by 'x') to match against the normalized masked string. */
    patterns: readonly string[];
    /** Only consume numbers inside this function (i.e. only when we actually match). */
    parse: (nr: NumberRobustString) => ParsedEffect;
};

function applyNumberRobustChecks(nr: NumberRobustString, checks: readonly NumberRobustCheck[]): ParsedEffect | null {
    for (const check of checks) {
        if (!maskedEqualsAny(nr, check.patterns)) continue;
        nr.resetIndex();
        return check.parse(nr);
    }
    return null;
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
    selector: (player: Player) => any[],
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

const selectShopItem = (game: Game, min: number = 1, max: number = min): TargetsSelector[] =>
[createSelector("Choose an item in the shop", (issuer: Player) => game.shop.itemsInShop.filter((slot) => slot !== undefined) as ItemCard[], min, max)];
const selectNonEternalItemOrASoul = (game: Game, min: number = 1, max: number = min): TargetsSelector[] => 
    [createSelector("Choose a non-eternal item or a soul", itemAndSoulSelector((player: Player, card: ItemCard) => card.eternal === false, game), min, max)];

const selectNonEternalTapItem = (game: Game, min: number = 1, max: number = min): TargetsSelector[] => 
    [createSelector("Choose a non-eternal item", visibleItemSelector((card: ItemCard, issuer: Player) => card.eternal === false && card.activeEffectList.length > 0 && card.hasTapEffect() && card.slug != "b2-placebo", game), min, max)];

const selectAnyTapItem = (game: Game, min: number = 1, max: number = min): TargetsSelector[] => 
    [createSelector("Choose any tap item", visibleItemSelector((card: ItemCard, issuer: Player) => card.activeEffectList.length > 0 && card.hasTapEffect(), game), min, max)];

const selectAnotherPlayerNonEternalItem = (game: Game, min: number = 1, max: number = min): TargetsSelector[] => 
    [createSelector("Choose another player's non-eternal item", inAnotherplayItemSelector((player: Player, card: ItemCard) => card.eternal === false, game), min, max)];

const selectNonEternalPassiveItem = (game: Game, min: number = 1, max: number = min): TargetsSelector[] => 
    [createSelector("Choose a non-eternal passive item", visibleItemSelector((card: ItemCard, issuer: Player) => card.eternal === false && card.activeEffectList.length === 0, game), min, max)];

const selectItemYouControl = (game: Game, min: number = 1, max: number = min): TargetsSelector[] => 
    [createSelector("Select an item you control", YourItemSelector((player: Player, card: ItemCard) => card.eternal === false, game), min, max)];

const selectAnotherItemYouControl = (game: Game, min: number = 1, max: number = min): TargetsSelector[] => 
    [createSelector("Select an item you control", YourItemSelector((player: Player, card: ItemCard) => card.eternal === false && card.name !== "Donation Machine", game), min, max)];

const selectSoulYouControl = (game: Game, min: number = 1, max: number = min): TargetsSelector[] => 
    [createSelector("Destroy a soul you control", (issuer: Player) => issuer.souls, min, max)];

const selectNonEternalItemFromAnywhere = (game: Game, min: number = 1, max: number = min): TargetsSelector[] => 
    [createSelector("Select a non-eternal item from a player or from the shop", visibleItemSelector((card: ItemCard, issuer: Player) => card.eternal === false, game), min, max)];

const selectPlayerWithMostSouls = (game: Game, min: number = 1, max: number = min): TargetsSelector[] => 
    [createSelector("Choose a player with the most souls or tied for the most", playerSelector((p) => p.souls.length === Math.max(...game.players.map(p => p.souls.length)), game), min, max)];

const selectRollAddOrSubtract = (game: Game): TargetsSelector[] => [
    createSelector("Choose a dice roll", rollSelector(() => true, game)),
    createSelector("Choose to add or subtract 1", (issuer: Player) => [1, -1])
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

export function parseEachTimeYouKillMonsterEffect(s: string, game: Game): ParsedEffect {
    const restOfEffect = s.substring("each time you kill a monster, ".length).trim();
    const restParsed = effectParser(restOfEffect, game, active.addInPlayEffect(game), true);
    return {
        effectFunction: passive.onYourKillEffect([restParsed.effectFunction], game, s, false, (effectData: EffectData, eventData: OnDeathMonsterData) => {
            return eventData.eventIssuer instanceof Monster;
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
    if(s.startsWith("the active player rolls-"))
    {
        const rest = "roll" + s.substring("the active player rolls".length).replace("they", "the active player");
        return active.rollEffect(rest, game, true);
    }
    {
        const numberRobustString = nr ?? new NumberRobustString(s);
        const masked = numberRobustString.toString();
        if (masked.startsWith("the active player may attack other players. attacked players have x+ [dc]")) {
            const evasion = numberRobustString.numbers[0];
            if (evasion !== undefined)
                return noTargetEffect(room.otherPlayersAreAttackableEffect(game, evasion));
        }
    }
    switch (s) {
        case "the active player may attack an additional time this turn.":
            return { effectFunction: passive.temporaryStatModifierEffect([game.addAttackThisTurn.bind(game)], 1, game, "current"), targetSelectors: noTargets };
        case "the active player must attack the monster deck 2 times this turn.":
            return { effectFunction: active.forceAttackMonsterDeckEffect(game, 2, "total"), targetSelectors: noTargets };    
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
        case "the active player forces a player to discard 2 loot cards.":
            return noTargetEffect(monster.activePlayerSelectAndCallEffect(game, active.discardNLootCardsEffect(2, game, true)));
        case "the active player kills a player.":
            return noTargetEffect(active.killTargetEffect(game, decideEntitySelector(s, game), true, true));
        case "the active player skips their next turn.":
            return noTargetEffect(active.issuerSkipNextTurnEffect(game, true));
        case "the active player chooses a player. they lose 7¢.":
            return noTargetEffect(monster.activePlayerSelectAndCallEffect(game, active.loseCoinsEffect(game, 7)));
        case "the active player may steal a non-eternal item another player controls.":
            return noTargetEffect(monster.activePlayerSelectTargetEffect(game, active.stealNonEternalItemEffect(game), selectAnotherPlayerNonEternalItem(game, 0, 1)[0]!));
        case "the active player may look at a player's hand.":
            return noTargetEffect(monster.activePlayerSelectTargetEffect(game, active.lookAtAPlayerHand(game), selectPlayer(game, 0, 1)[0]!, false));
        case "the active player deals 3 damage to a player.":
            return noTargetEffect(active.dealDamageToAPlayerEffect(game, 3, true, true));
        case "the active player deals 2 damage divided as they choose to any number of monsters or players.":
            return noTargetEffect(monster.activePlayerSelectTargetEffect(game, active.deal2DamageDividedAsYouChooseEffect(game), selectPlayerOrMonster(game, 1, 2)[0]!));
        case "the active player recharges each item they control.":
            return noTargetEffect(monster.activePlayerIsTargetedByEffect(game, active.rechargeEachItemsOfTargetEffect(game)));
        case "the active player may choose another player. they give you a soul they control.":
            return noTargetEffect(monster.activePlayerSelectAndCallEffect(game, active.giveSoulEffect(game), true));
        case "the active player chooses a player. that player destroys a soul they control.":
            return noTargetEffect(monster.activePlayerSelectAndCallEffect(game, active.destroyOneOfYourSoulEffect(game)));
        case "the active player chooses a player. that player discards 2 loot cards.":
            return noTargetEffect(monster.activePlayerChoosePlayerDiscard2Effect(game));
        case "the active player chooses a living player. this deals 1 damage to that player.":
            return noTargetEffect(monster.activePlayerChooseLivingPlayerTakeDamageEffect(game, 1));
        case "the active player loots +1 during their loot step.":
            return { effectFunction: passive.lootStepEffect([active.lootCardsEffect(game, 1)], game, true), targetSelectors: noTargets };
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
    if (s.startsWith("when you die, ") && s !== "when you die, before paying penalties, give this to another player.") {
        const restParsed = effectParser(s.substring(s.indexOf(",") + 1).trim(), game, defaultEffect, true);
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
    if(s.startsWith("the first time you kill a monster on your turn, "))
        return parseFirstKillMonsterTurnEffect(s, game);
    if (s.startsWith("when this reaches 1 [hp] , ")) {
        const restParsed = effectParser(s.substring(s.indexOf(",") + 1).trim(), game, defaultEffect, true);
        return noTargetEffect(monster.whenThisReaches1HP(game, [restParsed.effectFunction], s))
    }
    if (s.startsWith("the first time you would gain ¢ on each of your turns, ")) {
        const restParsed = effectParser(s.substring(s.indexOf(",") + 1).trim(), game, defaultEffect, true);
        return {
            effectFunction: passive.interceptFirstGainCoinYourTurnEffect([restParsed.effectFunction], game, s),
            targetSelectors: restParsed.targetSelectors
        };
    }
    if (s.startsWith("each time another player dies, "))
        return parseEachTimeAnotherPlayerDiesEffect(s, game);
    if(s.startsWith("each time you kill a monster, "))
        return parseEachTimeYouKillMonsterEffect(s, game);
    if (s.startsWith("each time a player would roll a ") && !s.includes(" or "))
        return parseEachTimeWouldRollEffect(s, game);
    if(s.startsWith("as your turn ends, "))
        s = "at the end of your turn, " + s.substring("as your turn ends, ".length).trim();
    if (s.startsWith("at the end of your turn, "))
        return parseAtTheEndOfYourTurnEffect(s, game);
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
        return active.rollEffect(s, game);
    if (s.startsWith("destroy 2 items you control")) {
        return { effectFunction: active.destroyTwoItemsEffect(game), targetSelectors: selectItemYouControl(game, 2) };
    }
    if(s.startsWith("roll 3 times"))
    {
        const restTxt = "roll-" + s.substring(`roll 3 times`.length);
        const restEffect = active.rollEffect(restTxt, game);
        const effect: EffectFunction = async (data:EffectData) => {
            const discardedLoot = data.targets[0];
            data.targets = []; // clear targets to avoid confusion for the restEffect, which shouldn't care about the discarded loot
            for(let i = 0; i < 3; i++){
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
        const restEffect = active.rollEffect(restTxt, game);
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
                return restParsed.effectFunction(data);
            },
            targetSelectors: restParsed.targetSelectors
        };
    }
    if (s.startsWith("put a counter on this."))
        return { effectFunction: active.putCountersOnItemEffect(1, game), targetSelectors: noTargets };
    if(s.includes(", then") 
        && s !== "choose another player. they give you half of their ¢ and loot cards rounded down, then gives you an item."
        && s !== "choose a monster being attacked. heal that monster to full [hp] , then deal damage equal to the number of [hp] healed in this way to another monster. if it's not your turn, cancel the attack and the active player may make an additional attack this turn."
        && !s.startsWith("when this reaches 0 [hp] , the player attacking this gains its reward, then you flip it.")
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
    {
        const parsed = applyNumberRobustChecks(nr, [
            {
                patterns: ["gain x¢"],
                parse: (nr) => ({ effectFunction: active.gainCoinsEffect(game, nr.nextNumber()), targetSelectors: noTargets }),
            },
            {
                patterns: ["steal x¢ from a player", "steal x¢ from another player"],
                parse: (nr) => ({ effectFunction: active.stealCoinsEffect(game, nr.nextNumber()), targetSelectors: selectAnotherPlayer(game) }),
            },
        ]);
        if (parsed !== null) return parsed;
    }
        
    const deckName = parseText(s, /^look at the top 5 cards of the (\w+) deck\. put 1 on top and the rest on the bottom\./u);
    if (deckName !== "")
    {
        return { effectFunction: active.look5Put1TopRestBottomEffect(deckName, game), targetSelectors: noTargets };
    }
    {
        const parsed = applyNumberRobustChecks(nr, [
            {
                patterns: ["gain x treasure", "gain x treasures"],
                parse: (nr) => ({ effectFunction: active.gainTreasuresEffect(game, nr.nextNumber()), targetSelectors: noTargets }),
            },
            {
                patterns: ["each monster heals x [hp]"],
                parse: (nr) => noTargetEffect(active.healEachMonsterEffect(game, nr.nextNumber())),
            },
            {
                patterns: ["heal x [hp]", "this heals x [hp]"],
                // Preserve existing behavior: "this heals ..." resolves to active.healEffect here.
                parse: (nr) => ({ effectFunction: active.healEffect(game, nr.nextNumber()), targetSelectors: noTargets }),
            },
            {
                patterns: ["lose x¢"],
                parse: (nr) => ({ effectFunction: active.loseCoinsEffect(game, nr.nextNumber()), targetSelectors: noTargets }),
            },
            {
                patterns: ["loot x"],
                parse: (nr) => ({ effectFunction: active.lootCardsEffect(game, nr.nextNumber()), targetSelectors: noTargets }),
            },
            {
                patterns: ["remove x counter from this", "remove x counters from this"],
                parse: (nr) => ({ effectFunction: active.removeCountersFromThisEffect(game, nr.nextNumber()), targetSelectors: noTargets }),
            },
            {
                patterns: ["pay x [hp]"],
                parse: (nr) => ({ effectFunction: active.payHealthEffect(game, nr.nextNumber()), targetSelectors: noTargets }),
            },
            {
                patterns: ["pay x¢:", "pay x¢."],
                parse: (nr) => ({ effectFunction: active.payCoinsEffect(game, nr.nextNumber()), targetSelectors: noTargets }),
            },
            {
                patterns: ["each player gains x¢"],
                parse: (nr) => ({ effectFunction: active.eachPlayerGainsCoinsEffect(game, nr.nextNumber()), targetSelectors: noTargets }),
            },
            {
                patterns: ["force a player to discard x loot card", "force a player to discard x loot cards"],
                parse: (nr) => ({ effectFunction: active.discardNLootCardsEffect(nr.nextNumber(), game, true, true), targetSelectors: selectPlayer(game) }),
            },
            {
                patterns: ["discard a loot card"],
                parse: () => ({ effectFunction: active.discardNLootCardsEffect(1, game, selectionOnResolve), targetSelectors: selectLootInYourHand(game, 1, 1, selectionOnResolve) }),
            },
            {
                patterns: ["discard x loot card", "discard x loot cards"],
                parse: (nr) => ((toDiscard) => ({ effectFunction: active.discardNLootCardsEffect(toDiscard, game, selectionOnResolve), targetSelectors: selectLootInYourHand(game, toDiscard, toDiscard, selectionOnResolve) }))(nr.nextNumber()),
            },
            {
                patterns: ["each player loots x"],
                parse: (nr) => ({ effectFunction: active.eachPlayerLootsEffect(game, nr.nextNumber()), targetSelectors: noTargets }),
            },
            {
                patterns: ["then put x cards from your hand on top of the loot deck in any order."],
                parse: (nr) => ({
                    effectFunction: active.putXCardFromYourHandOnTopOfLootDeck(game, nr.nextNumber()),
                    targetSelectors: noTargets,
                })
            },
        ]);
        if (parsed !== null) return parsed;

        // Keep legacy fallback for this specific phrase (currently unreachable because of the switch case above,
        // but left as-is to avoid surprising behavioral change during refactor).
        const thisHeals = numberAtIfMaskedEqualsAny(nr, ["this heals x [hp]"]);
        if (thisHeals !== null)
            return { effectFunction: monster.thisHealsEffect(game, thisHeals), targetSelectors: noTargets };
    }
    var deckName1 = parseText(s, /^look at the top 4 cards of the (\w+) deck\. you may put them back in any order\.?$/u);
    if (deckName1 === "")
        deckName1 = parseText(s, /^look at the top 4 cards of the (\w+) deck\. put them back in any order\.?$/u);
    if (deckName1 !== "")
        return { effectFunction: active.lookAndOrderEffect(deckName1, 4, game), targetSelectors: noTargets };
    {
        const nr = new NumberRobustString(s);
        const parsed = applyNumberRobustChecks(nr, [
            {
                patterns: ["each player loses x¢"],
                parse: (nr) => ({ effectFunction: active.eachPlayerLosesCoinsEffect(game, nr.nextNumber()), targetSelectors: noTargets }),
            },
            {
                patterns: ["each player takes x damage", "deal x damage to each player"],
                parse: (nr) => ({ effectFunction: active.dealDamageToEachPlayerEffect(game, nr.nextNumber()), targetSelectors: noTargets }),
            },
            {
                patterns: ["each monster takes x damage", "deal x damage to each monster"],
                parse: (nr) => ({ effectFunction: active.dealDamageToEachMonsterEffect(game, nr.nextNumber()), targetSelectors: noTargets }),
            },
            {
                patterns: ["shop items you purchase cost x¢ less"],
                parse: (nr) => ({ effectFunction: passive.shopItemsCostLessEffect(nr.nextNumber(), game), targetSelectors: noTargets }),
            },
            {
                patterns: ["you take x damage", "take x damage", "this takes x damage"],
                parse: (nr) => ({ effectFunction: active.takeDamageEffect(game, nr.nextNumber()), targetSelectors: noTargets }),
            },
            {
                patterns: ["take x damage and gain x¢"],
                parse: (nr) => ({ effectFunction: active.takeDamageGainCoinsEffect(s, nr.nextNumber(), nr.nextNumber(), game), targetSelectors: noTargets }),
            },
            {
                patterns: ["deal x damage to a monster or player", "deal x damage to a player", "deal x damage to a monster"],
                parse: (nr) => ({ effectFunction: active.dealDamageToTargetEffect(game, nr.nextNumber(), selectionOnResolve, decideEntitySelector(s, game)), targetSelectors: decideEntitySelector(s, game) }),
            },
        ]);
        if (parsed !== null) return parsed;

        if(s === "deal 1 damage to them."){
            selectionOnResolve = false;
            return { effectFunction: active.dealDamageToTargetEffect(game, 1, selectionOnResolve, decideEntitySelector(s, game)), targetSelectors: decideEntitySelector(s, game) };
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

        const parsed = applyNumberRobustChecks(nr, [
            {
                patterns: ["x [hp]"],
                parse: (nr) => ({ effectFunction: passive.permanentStatModifierEffect([game.addHealth.bind(game)], nr.nextNumber(), game), targetSelectors: noTargets }),
            },
            {
                patterns: ["x [atk]"],
                parse: (nr) => ({ effectFunction: passive.permanentStatModifierEffect([game.addAttack.bind(game)], nr.nextNumber(), game), targetSelectors: noTargets }),
            },
        ]);
        if (parsed !== null) return parsed;
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
    {
        const parsed = applyNumberRobustChecks(nr, [
            {
                patterns: ["each time you die, before paying penalties, gain x¢"],
                parse: (nr) => ({
                    effectFunction: passive.beforeDeathPenaltyEffect([active.gainCoinsEffect(game, nr.nextNumber())], game),
                    targetSelectors: noTargets,
                }),
            },
            {
                patterns: ["each time you die, before paying penalties, loot x"],
                parse: (nr) => ({
                    effectFunction: passive.beforeDeathPenaltyEffect([active.lootCardsEffect(game, nr.nextNumber())], game),
                    targetSelectors: noTargets,
                }),
            },
            {
                patterns: ["flip your character if able. then recharge it. discard your hand and loot x"],
                parse: (nr) => ({
                    effectFunction: active.combineEffectFunctions([
                        active.flipCharacterEffect(game),
                        active.rechargeCharaEffect(game, [false]),
                        active.discardHandEffect(game),
                        active.lootCardsEffect(game, nr.nextNumber()),
                    ]),
                    targetSelectors: noTargets,
                }),
            },
            {
                patterns: ["when this is flipped to this side, loot x"],
                parse: (nr) => ({
                    effectFunction: passive.lootAfterFlippingEffect(game, nr.nextNumber()),
                    targetSelectors: noTargets,
                }),
            },
            {
                patterns: ["choose a monster or player. the next instance of damage they take this turn is reduced to x"],
                parse: (nr) => ({
                    effectFunction: passive.setNextDamageToXEffect(nr.nextNumber(), game),
                    targetSelectors: selectPlayerOrMonster(game),
                }),
            },
            {
                patterns: ["loot x during your loot step"],
                parse: (nr) => ({
                    effectFunction: passive.lootStepEffect([active.lootCardsEffect(game, nr.nextNumber())], game),
                    targetSelectors: noTargets,
                }),
            },
            {
                patterns: ["prevent the next x damage you would take this turn"],
                parse: (nr) => ({
                    effectFunction: passive.preventNextDamageUpToEffect(nr.nextNumber(), game),
                    targetSelectors: noTargets,
                }),
            },
            {
                patterns: ["choose a player. prevent the next x damage they would take this turn"],
                parse: (nr) => ({
                    effectFunction: passive.preventNextDamageUpToEffect(nr.nextNumber(), game),
                    targetSelectors: selectPlayer(game),
                }),
            },
            {
                patterns: [
                    "choose a player or monster. prevent the next instance of up to x damage they would take this turn",
                    "choose a player. prevent the next instance of up to x damage they would take this turn",
                ],
                parse: (nr) => ({
                    effectFunction: passive.preventNextDamageUpToEffect(nr.nextNumber(), game),
                    targetSelectors: selectPlayerOrMonster(game),
                }),
            },
            {
                patterns: ["while you have x¢, you have x to your attack rolls"],
                parse: (nr) => {
                    const coinCount = nr.nextNumber();
                    const diceMod = nr.nextNumber();
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
                },
            },
            {
                patterns: ["when you have x loot cards in your hand, you have x [atk]"],
                parse: (nr) => {
                    const lootCount = nr.nextNumber();
                    const atk = nr.nextNumber();
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
                },
            },
            {
                patterns: ["you gain x [atk] till the end of turn"],
                parse: (nr) => ({
                    effectFunction: passive.temporaryStatModifierEffect([game.addAttack.bind(game)], nr.nextNumber(), game, "issuer"),
                    targetSelectors: noTargets,
                }),
            },
            {
                patterns: ["prevent the next x damage you would take this turn. when you prevent damage this way, deal x damage to another player"],
                parse: (nr) => {
                    const preventAmount = nr.nextNumber();
                    const damageAmount = nr.nextNumber();
                    return {
                        effectFunction: passive.preventDamageAndDealDmgOnPreventEffect(preventAmount, damageAmount, game),
                        targetSelectors: selectAnotherPlayer(game),
                    };
                },
            },
            {
                patterns: ["choose a player or monster. they gain x [atk] till end of turn"],
                parse: (nr) => ({
                    effectFunction: passive.temporaryStatModifierEffect([game.addAttack.bind(game)], nr.nextNumber(), game, "next"),
                    targetSelectors: selectPlayerOrMonster(game),
                }),
            },
            {
                patterns: ["gain x [atk] till end of turn", "you gain x [atk] till end of turn"],
                parse: (nr) => ({
                    effectFunction: passive.temporaryStatModifierEffect([game.addAttack.bind(game)], nr.nextNumber(), game, "issuer"),
                    targetSelectors: selectPlayerOrMonster(game),
                }),
            },
            {
                patterns: ["each monster gains x [atk] till end of turn"],
                parse: (nr) => ({
                    effectFunction: passive.temporaryStatModifierEffect(
                        [game.addAttackToEachMonster.bind(game)],
                        nr.nextNumber(),
                        game,
                        "issuer",
                    ),
                    targetSelectors: noTargets,
                }),
            },
            {
                patterns: ["each monster gains x [dc] till end of turn"],
                parse: (nr) => ({
                    effectFunction: passive.temporaryStatModifierEffect([game.addDCToEachMonster.bind(game)], nr.nextNumber(), game, "issuer"),
                    targetSelectors: noTargets,
                }),
            },
            {
                patterns: ["if you would take any amount of damage, take that much damage x instead"],
                parse: (nr) => ({
                    effectFunction: passive.takeDamagePlusEffect(nr.nextNumber(), game),
                    targetSelectors: noTargets,
                }),
            },
            {
                patterns: ["each time a player dies, before paying penalties, loot x"],
                parse: (nr) => ({
                    effectFunction: passive.lootOnPlayerDeathEffect(nr.nextNumber(), game),
                    targetSelectors: noTargets,
                }),
            },
            {
                patterns: ["if you would gain any number of ¢, gain that much x¢ instead"],
                parse: (nr) => ({
                    effectFunction: passive.gainPlusCoinsEffect(nr.nextNumber(), game),
                    targetSelectors: noTargets,
                }),
            },
            {
                patterns: ["this item starts with x counters on it"],
                parse: (nr) => ({
                    effectFunction: passive.startWithNCountersEffect(nr.nextNumber(), game),
                    targetSelectors: noTargets,
                }),
            },
            {
                patterns: [
                    "reveal the top x cards of the monster deck. give any curse cards revealed to the player or players of your choosing. put the rest on the bottom of the deck in any order",
                ],
                parse: (nr) => noTargetEffect(active.revealTopCardsOfMonsterDeckEffect(game, nr.nextNumber())),
            },
            {
                patterns: [
                    "gain x [atk] for your first attack roll each turn",
                    "you have x [atk] for your first attack roll each turn",
                ],
                parse: (nr) => ({
                    effectFunction: passive.firstAttackRollStatModifierEffect(nr.nextNumber(), 0, 0, game),
                    targetSelectors: noTargets,
                }),
            },
            {
                patterns: ["each time you would take damage, roll-\nx: prevent x of that damage"],
                parse: (nr) => {
                    const rollValue = nr.nextNumber();
                    const preventAmount = nr.nextNumber();
                    return {
                        effectFunction: passive.preventDamageOnRollEffect([rollValue], preventAmount, game),
                        targetSelectors: noTargets,
                    };
                },
            },
            {
                patterns: ["[lvx effect] you have x to your first attack roll each turn"],
                parse: (nr) => {
                    const lvl = nr.nextNumber();
                    const diceMod = nr.nextNumber();
                    return {
                        effectFunction: passive.lvlXaddListenerEffect([passive.firstAttackRollDiceModifier(diceMod, game)], lvl, game),
                        targetSelectors: noTargets,
                    };
                },
            },
            {
                patterns: ["[lvx effect] you have x [atk]"],
                parse: (nr) => {
                    const lvl = nr.nextNumber();
                    const atk = nr.nextNumber();
                    return {
                        effectFunction: passive.lvlXaddListenerEffect(
                            [passive.permanentStatModifierEffect([game.addAttack.bind(game)], atk, game)],
                            lvl,
                            game,
                        ),
                        targetSelectors: noTargets,
                    };
                },
            },
            {
                patterns: ["[lvx effect] you may attack any number of times on your turn"],
                parse: (nr) => {
                    const lvl = nr.nextNumber();
                    return {
                        effectFunction: passive.lvlXaddListenerEffect(
                            [passive.onYourTurnModifier([game.addAttackThisTurn.bind(game)], INFINITY, game)],
                            lvl,
                            game,
                        ),
                        targetSelectors: noTargets,
                    };
                },
            },
            {
                patterns: ["each time you roll an attack roll of x, deal x damage to each other player"],
                parse: (nr) => {
                    const rollValue = nr.nextNumber();
                    const damage = nr.nextNumber();
                    return {
                        effectFunction: passive.onAttackRollEffect([rollValue], active.dealDamageToEachOtherPlayerEffect(game, damage), game),
                        targetSelectors: noTargets,
                    };
                },
            },
            {
                patterns: ["deal x damage to another player"],
                parse: (nr) => ({
                    effectFunction: active.dealDamageToAPlayerEffect(game, nr.nextNumber(), false),
                    targetSelectors: selectAnotherPlayer(game),
                }),
            },
            {
                patterns: ["each time another player gains ¢, they must give you x¢"],
                parse: (nr) => noTargetEffect(passive.stealCoinOnGainEffect(nr.nextNumber(), game)),
            },
            {
                patterns: ["if you have x¢, gain x¢"],
                parse: (nr) => {
                    const coinsCondition = nr.nextNumber();
                    const gainAmount = nr.nextNumber();
                    return { effectFunction: active.gainXCoinsIfYEffect(coinsCondition, gainAmount, game), targetSelectors: noTargets };
                },
            },
            {
                patterns: ["if you have x or more loot cards in your hand, loot x"],
                parse: (nr) => {
                    const threshold = nr.nextNumber();
                    const lootAmount = nr.nextNumber();
                    return { effectFunction: active.lootXIfYEffect(threshold, true, lootAmount, game), targetSelectors: noTargets };
                },
            },
            {
                patterns: ["if you have x loot cards in your hand, loot x"],
                parse: (nr) => {
                    const threshold = nr.nextNumber();
                    const lootAmount = nr.nextNumber();
                    return { effectFunction: active.lootXIfYEffect(threshold, false, lootAmount, game), targetSelectors: noTargets };
                },
            },
            {
                patterns: ["each other player takes x damage"],
                parse: (nr) => ({ effectFunction: active.dealDamageToEachOtherPlayerEffect(game, nr.nextNumber()), targetSelectors: noTargets }),
            },
            {
                patterns: [
                    "look at the top x cards of a deck. put them back in any order",
                    "look at the top x cards of a deck and put them back in any order",
                ],
                parse: (nr) => noTargetEffect(active.lookAndReorderTopCardsEffect(game, nr.nextNumber(), "selectOnResolve")),
            },
            {
                patterns: ["gain x ¢ instead"],
                parse: (nr) => {
                    const fixed = nr.nextNumber();
                    return { effectFunction: active.modifyCoinGainedEffect(game, () => fixed), targetSelectors: noTargets };
                },
            },
            {
                patterns: ["deal x damage to up to x monsters or players"],
                parse: (nr) => {
                    const damage = nr.nextNumber();
                    const maxTargets = nr.nextNumber();
                    return {
                        effectFunction: active.dealDamageToUpToXMonstersOrPlayersEffect(game, maxTargets, damage),
                        targetSelectors: selectPlayerOrMonster(game, 1, maxTargets),
                    };
                },
            },
            {
                patterns: ["combat damage you deal on attack rolls of x is increased by x"],
                parse: (nr) => {
                    const rollValue = nr.nextNumber();
                    const increaseBy = nr.nextNumber();
                    return noTargetEffect(passive.combatDamageModifierOnAttackRollEffect(game, [rollValue], increaseBy));
                },
            },
            {
                patterns: ["if this has x+ counters, remove all of them and loot x"],
                parse: (nr) => {
                    const threshold = nr.nextNumber();
                    const lootAmount = nr.nextNumber();
                    return noTargetEffect(active.removeCounterAndLootIfAbove(game, threshold, lootAmount));
                },
            },
            {
                patterns: ["choose a monster. its [atk] becomes x"],
                parse: (nr) => ({
                    effectFunction: active.setMonsterAttackToXEffect(game, nr.nextNumber()),
                    targetSelectors: selectMonster(game),
                }),
            },
            {
                patterns: ["you have x [hp] for each counter on this"],
                parse: (nr) => noTargetEffect(passive.statModifierBasedOnCountersEffect(game, [game.addHealth.bind(game)], 1, nr.nextNumber())),
            },
            {
                patterns: ["you have x [atk] for every x counters on this"],
                parse: (nr) => {
                    const atkPer = nr.nextNumber();
                    const countersPer = nr.nextNumber();
                    return noTargetEffect(passive.statModifierBasedOnCountersEffect(game, [game.addAttack.bind(game)], countersPer, atkPer));
                },
            },
        ]);
        if (parsed !== null) return parsed;
    }
    switch (s) {
        // passive effects
        case "[paid effect]":
        case "":
            return noTargetEffect(()=>true);
        case "each time you roll the same result twice in a row on an attack roll on the same turn, kill the monster you're attacking.":
            return { effectFunction: passive.killOnDoubleAttackRollEffect(game), targetSelectors: noTargets };
        case "the next time a player would loot, they loot from the top of the loot discard instead.":
            return { effectFunction: passive.lootFromDiscardEffect(game), targetSelectors: selectPlayer(game) };
        case "if you control this as the game starts, you go first.":
            return { effectFunction: passive.goFirstInTurnOrderEffect(game), targetSelectors: noTargets };
        case "damage you would take is reduced to 1.":
            return { effectFunction: passive.reduceDamageToOneEffect(game), targetSelectors: noTargets };
        case "this has the abilities of other items with gold counters on them.":
            return noTargetEffect(passive.copyAbilitiesFromGoldCounterItemsEffect(game));
        case "this enters play deactivated.":
            return { effectFunction: passive.enterPlayDeactivatedEffect(game), targetSelectors: noTargets };
        case "cancel your attack on a monster.":
            return { effectFunction: active.cancelAttackOnMonsterEffect(game), targetSelectors: noTargets };
        case "when you would roll a 1, you may change the result to a 6.":
            return { effectFunction: passive.changeRollOneToSixEffect(game), targetSelectors: noTargets };
        case "if you would loot, except during the loot step, instead loot that much +1.":
            return { effectFunction: passive.lootPlusOneExceptLootStepEffect(game), targetSelectors: noTargets };
        case "when you die, before paying penalties, give this to another player.":
            return { effectFunction: passive.giveThisToAnotherPlayerOnDeathEffect(game), targetSelectors: noTargets };
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
        case "when you start the game, look at the top 3 cards of the treasure deck and choose one. it becomes your starting item and gains eternal. put the rest on the bottom of the treasure deck.":
            return { effectFunction: passive.startingItemEffect(game), targetSelectors: noTargets };
        
        case "if another player would pay the death penalty, you choose what item they would destroy and you gain any loot cards and ¢ they would lose.":
            return { effectFunction: passive.replaceDeathPenaltyEffect(game), targetSelectors: noTargets };
        
        case "choose a player or monster. prevent the next instance of damage they would take this turn.":
            return { effectFunction: passive.preventNextDamageUpToEffect(INFINITY, game), targetSelectors: selectPlayerOrMonster(game) };
        
        case "choose a player. till end of turn, if they would loot any number of loot cards, they loot double that number instead.":
            return { effectFunction: passive.lootDoubleThisTurnEffect(game), targetSelectors: selectPlayer(game) };
        case "before a dice is rolled, choose a number. if the next roll is that number, loot 3.":
            return { effectFunction: passive.lootOnNextRollEffect(game), targetSelectors: selectNumber1to6() };
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
        case "each other player may choose to gain 1¢. gain 1¢ + 1¢ for each player who did.":
            return noTargetEffect(active.eachOtherPlayerMayGainCoinEffect(game));
        case "choose a monster being attacked. heal that monster to full [hp] , then deal damage equal to the number of [hp] healed in this way to another monster. if it's not your turn, cancel the attack and the active player may make an additional attack this turn.":
            return {effectFunction: active.healMonsterThenDamageAnotherEffect(game), targetSelectors: selectMonsterBeingAttacked(game) };
        
        case "each other player plays with their hand revealed.":
            return noTargetEffect(passive.eachOtherPlayerRevealsHandEffect(game));
        case "when you roll an attack roll of 1, end your turn. cancel everything that hasn't resolved.":
            return noTargetEffect(passive.endTurnOnAttackRollOneEffect(game));
        case "the next time a player would roll a dice, they instead roll 4 dice. you choose one of the rolls as the result.":
            return noTargetEffect(passive.roll4Choose1Effect(game));
        case "if another player declares an attack on a monster, you may choose which monster they attack.":
            return noTargetEffect(passive.chooseMonsterWhenAnotherPlayerAttacksMonsterEffect(game));
        case "you gain +1 [hp] till the end of turn.":
        case "you gain +1 [hp] till end of turn":
        case "gain +1 [hp] till end of turn.":
            return { effectFunction: passive.temporaryStatModifierEffect([game.addHealth.bind(game)], 1, game, "issuer"), targetSelectors: noTargets };
        case "choose a player.\nthey gain +2 [hp] till end of turn.":
            return { effectFunction: passive.temporaryStatModifierEffect([game.addHealth.bind(game)], 2, game, "next"), targetSelectors: selectPlayer(game) };
        case "choose a player.\nthey gain +1 [atk] and +1 [hp] till end of turn.":
            return { effectFunction: passive.temporaryStatModifierEffect([game.addAttack.bind(game), game.addHealth.bind(game)], 1, game, "next"), targetSelectors: selectPlayer(game) };
        case "choose a player.\nthey gain +1 [atk] and +1 to dice rolls till end of turn.":
            return { effectFunction: passive.temporaryStatModifierEffect([game.addAttack.bind(game), game.addDiceModifier.bind(game)], 1, game, "next"), targetSelectors: selectPlayer(game) };
        case "choose a player.\nthey gain +1 [atk] till end of turn and may attack an additional time this turn.":
            return { effectFunction: passive.temporaryStatModifierEffect([game.addAttack.bind(game), game.addAttackThisTurn.bind(game)], 1, game, "next"), targetSelectors: selectPlayer(game) };
        case "play an additional loot card this turn.":
        case "play an additional loot card this turn":
            return { effectFunction: passive.temporaryStatModifierEffect([game.addLootPlay.bind(game)], 1, game, "issuer"), targetSelectors: noTargets };
        case "if this would be destroyed, if it has no counters on it, put a counter on it instead.":
            return { effectFunction: passive.putCounterInsteadOfDestructionEffect(game), targetSelectors: noTargets };
        case "you have +1 [hp] while this has a counter on it.":
            return { effectFunction: passive.ConditionalStatModifierEffect([game.addHealth.bind(game)], 1, (player, card) => card.tags.counters > 0, ["on:counter:modified"], game, false ), targetSelectors: noTargets };
        case "if you would take damage while this has counters on it, remove that many counters and prevent that much damage.":
            return { effectFunction: passive.preventDamageByRemovingCountersEffect(game), targetSelectors: noTargets };
        case "choose a player. prevent the next 1 damage they would take this turn. till end of turn, when that player dies, deal 2 damage to each player other than that player and you.":
            return { effectFunction: passive.preventDamageAndDealOnDeathEffect(game, 1, 2), targetSelectors: selectAlivePlayer(game) };
        case "if you would gain any amount of ¢, this levels up by that much instead.":
            return { effectFunction: passive.gainCoinsLevelUpEffect(game), targetSelectors: noTargets };
        case "rewards are doubled till end of turn.":
            return { effectFunction: passive.doubleRewardsTillEndOfTurnEffect(game), targetSelectors: noTargets };
        case "you have +1 to attack rolls.":
            return { effectFunction: passive.permanentStatModifierEffect([game.addAttackDiceModifier.bind(game)], 1, game), targetSelectors: noTargets };
        case "monsters have +1 [dc] on your turn.":
            return { effectFunction: passive.onYourTurnModifier([game.addDCToEachMonster.bind(game)], 1, game), targetSelectors: noTargets };
        case "you may look at the top card of the treasure deck at any time on your turn.":
            return { effectFunction: passive.onYourTurnModifier([game.addCanSeeTopOfTreasureDeck.bind(game)], 1, game), targetSelectors: noTargets };
        case "you may purchase an additional time on your turn.":
            return { effectFunction: passive.onYourTurnModifier([game.addPurchaseThisTurn.bind(game)], 1, game), targetSelectors: noTargets };
        case "you may attack an additional time on your turn.":
            return { effectFunction: passive.onYourTurnModifier([game.addAttackThisTurn.bind(game)], 1, game), targetSelectors: noTargets };
        case "you may play an additional loot card on your turn.":
            return { effectFunction: passive.onYourTurnModifier([game.addLootPlay.bind(game)], 1, game), targetSelectors: noTargets };
        
        case "when this reaches 0 [hp] , the player attacking this gains its reward, then you flip it. that player may attack an additional time this turn.":
            return noTargetEffect(passive.flipAndAddAttackEffect(game));
        // active effects
        case "when this enters play put a gold counter on another non-eternal item you control.":
            return noTargetEffect(passive.giveCounterToAnotherItemOnEnterPlayEffect(game, "goldCounters"));
        case "look at the top 5 cards of the monster or room deck and put them back in any order":
            return { effectFunction: active.lookAndReorderTopCardsEffect(game, 5, undefined, "dataIssuer"), targetSelectors: selectDeck(game, 1, 1, (name) => ["room", "monster"].includes(name)) };
        case "choose a shop item. this gains the abilities of that item till end of turn.":
            return { effectFunction: passive.gainAbilitiesUntilEffect(game, "on:turn:end", selectShopItem(game)[0]!, false), targetSelectors: selectShopItem(game) };
        case "choose a shop item. this gains the abilities of that item till the start of your next turn. recharge this.":
            return { effectFunction: passive.gainAbilitiesUntilEffect(game, "on:turn:start", selectShopItem(game)[0]!, true), targetSelectors: selectShopItem(game) };
        case "prevent death, heal to full [hp] , and cancel your attack":
            return { effectFunction: active.preventDeathHealFullCancelAttackEffect(game), targetSelectors: noTargets };
        case "choose up to 3 non-event monster cards in discard. put them in one or more monster slots not being attacked.":
            return { effectFunction: active.putMonstersFromDiscardIntoSlotsEffect(game, 3), targetSelectors: selectXCardsFromDiscard(game, "monster", 0, 3, (card) => card instanceof MonsterCard && !card.isEvent) };
        case "before a dice is rolled, choose a number. till the end of turn, each time that number is rolled, deal 1 damage to a monster or player.":
            return { effectFunction: passive.chooseNumberDamageOnRollThisTurnEffect(game), targetSelectors: selectNumber1to6() };
        case "you may attack an additional time this turn.":
            return noTargetEffect(active.giveAdditionalAttackThisTurnEffect(game, 1));
        case "put counters on this equal to the amount of damage taken. then, if this has 6+ counters, remove 6 counters from this and gain +1 treasure.":
            return { effectFunction: active.addCountersAndGainTreasureEffect(6, 1, game), targetSelectors: noTargets };
        
        case "choose another player. they give you a loot card. reveal it":
            return { effectFunction: active.playerGivesLootCardEffect(game, true, true), targetSelectors: selectAnotherPlayer(game) };
        case "you must play that loot card if able. this doesn't use a loot play.":
            return { effectFunction: active.playForFreeTargetEffect(game), targetSelectors: noTargets };
        
        case "choose a player or monster":
            return { effectFunction: (data:EffectData) => { return true; }, targetSelectors: selectPlayerOrMonster(game) };
        
        case "prevent death. if it's your turn, cancel everything that hasn't resolved and end it.":
            return { effectFunction: active.preventDeathEndTurnEffect(game), targetSelectors: noTargets };
        case "prevent death. if it's your turn, cancel everything that hasn't resolved and end your turn.":
            return { effectFunction: active.preventDeathEndTurnEffect(game), targetSelectors: noTargets };
        case "discard any number of loot cards":
            return { effectFunction: active.discardAnyNumberOfLootCardsEffect(game, youMayEffectHanging), targetSelectors: noTargets };
        case "give another non-eternal item you control to another player": 
            return { effectFunction: active.giveItemToAnotherPlayerEffect(game), targetSelectors: [selectAnotherItemYouControl(game)[0]!, selectAnotherPlayer(game)[0]!] };
        
        case "put the top card of any discard on top of its deck.":
            return { effectFunction: active.putTopCardFromDiscardOnTopEffect(game), targetSelectors: selectTopAnyDiscard(game) };
        case "reroll an item they control.":
            return noTargetEffect(active.rerollItemTheyControlEffect(game, youMayEffectHanging));
        case "choose a dice roll. its controller rerolls it.":
            return { effectFunction: active.rerollDiceEffect(), targetSelectors: selectRoll(game) };
        case "they must give you a loot card.":
            return { effectFunction: active.makePlayerGiveLootCardEffect(game, "diceRoll"), targetSelectors: noTargets };
        case "add or subtract 1 from a roll.":
            return { effectFunction: active.addOrSubtract1FromRollEffect(game), targetSelectors: selectRollAddOrSubtract(game) };
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
        case "put the top card of a deck into discard.":
            return { effectFunction: active.discardTopOfDeckEffect(game), targetSelectors: selectDeck(game) };
        case "look at the top card of the loot deck. you may put it on the bottom.":
            return { effectFunction: active.LookAndPutBottomEffect("loot", game), targetSelectors: noTargets };
        case "look at the top card of the monster deck. you may put it on the bottom.":
            return { effectFunction: active.LookAndPutBottomEffect("monster", game), targetSelectors: noTargets };
        case "look at the top card of the treasure deck, you may put it on the bottom.":
            return { effectFunction: active.LookAndPutBottomEffect("treasure", game), targetSelectors: noTargets };
        case "recharge another item.":
            return { effectFunction: active.rechargeItemsEffect(game, selectionOnResolve), targetSelectors: selectItem(game) };
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
            return { effectFunction: active.destroyOneEffect(game), targetSelectors: selectNonEternalItemFromAnywhere(game) };
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
        case "subtract up to 2 from a roll.":
            return { effectFunction: active.subtractUpToXFromRollEffect(game), targetSelectors: selectRollAndNumber(game, [0, 1, 2]) };
        case "add up to 2 to an attack roll.":
            return { effectFunction: active.addUpToXToRollEffect(game, "attack"), targetSelectors: selectRollAndNumber(game, [0, 1, 2], 1, 1, "attack") };
        case "add up to 2 to a non-attack roll.":
            return { effectFunction: active.addUpToXToRollEffect(game, "non-attack"), targetSelectors: selectRollAndNumber(game, [0, 1, 2], 1, 1, "non-attack") };
        case "each player votes on an item in play. destroy the item with the most votes. If there is a tie, nothing happens.":
            return { effectFunction: active.eachPlayersVoteToDestroyItemEffect(game), targetSelectors: noTargets };
        case "change a number in the effect text of a card in play or loot being played by 1 till end of turn. the number can't go below 1 or above 6.":
            return { effectFunction: active.changeNumberInEffectTextEffect(game), targetSelectors: selectCardInPlayOrLootBeingPlayed(game) };
        case "add or subtract 1 from any of your non-attack rolls.":
            return noTargetEffect(passive.addToYourRollValueEffect(game, [-1, 1], "non-attack", youMayEffectHanging));
        case "abilities and the death penalty can't make you discard loot cards or lose ¢.":
            return { effectFunction: passive.noLootDiscardOrCoinLossEffect(game), targetSelectors: noTargets };
        case "die":
            return noTargetEffect(active.dieEffect(game));
        case "add 1 to a roll.":
            return { effectFunction: active.addXToRollEffect(1), targetSelectors: selectRoll(game) };
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
        case "when this enters play, it becomes a soul.\n(it's no longer an item.)":
            return { effectFunction: active.enterPlayBecomeSoulEffect(game), targetSelectors: noTargets };
        case "cancel the ↷ or $ ability of an item or loot being played.":
        case "cancel the ↷ or $ ability of an item or a loot being played.":
            return { effectFunction: active.cancelStackElementEffect(game), targetSelectors: selectStackElementOrLoot(game) };
        case "cancel the effect of a loot being played.":
            return { effectFunction: active.cancelStackElementEffect(game, selectLootOnStack(game), selectionOnResolve ), targetSelectors: selectLootOnStack(game) };
        case "when you control 1 or 2 souls, you have +1 [atk]":
            return { effectFunction: passive.ConditionalStatModifierEffect([game.addAttack.bind(game)], 1, (player: Player) => [1,2].includes(player.totalSouls), ["on:soul:gained", "on:soul:removed"], game, true), targetSelectors: noTargets };
        case "if you control 3+ souls, you have +2 [atk] instead.":
            return { effectFunction: passive.ConditionalStatModifierEffect([game.addAttack.bind(game)], 2, (player: Player) => player.totalSouls >= 3, ["on:soul:gained", "on:soul:removed"], game, true), targetSelectors: noTargets };
        case "each other player discards a loot card.":
            return { effectFunction: active.eachOtherPlayerDiscardsLootEffect(game), targetSelectors: noTargets };
        case "put each monster not being attacked into discard and replace each with the top card of the monster deck.":
            return { effectFunction: active.flushMonsterSlotsEffect(game, "discardAndDraw"), targetSelectors: noTargets };
        case "put each monster not being attacked on the bottom of the monster deck.":
            return { effectFunction: active.flushMonsterSlotsEffect(game, "bottom"), targetSelectors: noTargets };
        case "look at each player's hand":
            return { effectFunction: active.lookAtHands(game), targetSelectors: noTargets };
        case "choose a dice roll. its controller rerolls it, but rolls 2 dice instead. they choose another player. that player chooses one of the rolls as the result.":
            return { effectFunction: active.rerollDiceRoll2Effect(game), targetSelectors: selectRoll(game) };
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
        case "deal 1 damage to another monster or player.": 
            // It is used in "Each time you deal combat damage, deal 1 damage to another monster or player."
            // "another monster or player." is handled as "not engaged in combat monster or player, or yourself."
            return noTargetEffect(active.dealDamageNotEngagedInCombatOrYourselfEffect(game, 1));
        case "choose a player. recharge each item they control.":
            return { effectFunction: active.rechargeEachItemsOfTargetEffect(game), targetSelectors: selectPlayer(game) };
        case "destroy this and loot 2.":
            return { effectFunction: active.destroyThisAndLoot2Effect(game), targetSelectors: noTargets };
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

        case "put the top card of each deck into discard.":
            return { effectFunction: active.putTopCardOfEachDeckIntoDiscardEffect(game), targetSelectors: noTargets };
        case "each player gives their hand to the player to their left.":
            return { effectFunction: active.passHandsLeftEffect(game), targetSelectors: noTargets };
        case "steal a non-eternal item from a player or from the shop.":
            return { effectFunction: active.stealNonEternalItemFromAnywhereEffect(game), targetSelectors: selectNonEternalItemFromAnywhere(game) };
        case "choose another player. you and that player each loot 1.":
            return { effectFunction: active.chooseAnotherPlayerAndLoot1Effect(game), targetSelectors: selectPlayer(game) };
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
        case "change the result of a dice roll to a 3.":
            return { effectFunction: active.changeRollDiceResultEffect(game), targetSelectors: selectRollAndNumber(game, [3]) };
        case "change the result of a dice roll to a 1 or 6.":
            return { effectFunction: active.changeRollDiceResultEffect(game), targetSelectors: selectRollAndNumber(game, [1, 6]) };
        case "put a card from your hand on top of the loot deck.":
        case "then put 1 card from your hand on top of the loot deck.":
        case "put a loot card from your hand on top of the loot deck.":
            return { effectFunction: active.putXCardFromYourHandOnTopOfLootDeck(game, 1), targetSelectors: noTargets };
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
        case "when this is destroyed, gain +1 treasure.":
            return { effectFunction: passive.gainTreasureOnDestroyEffect(game, 1), targetSelectors: noTargets };
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
    if(s === "when an attack is declared on this, each non-active player rolls:\n4-6: they must make an attack roll against this after each attack roll the active player makes this attack.")
            return noTargetEffect(room.onAttackDeclaredNonActivePlayersRollToJoinEffect(game));
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
    if(s.startsWith("each time this takes combat damage on an attack roll of 6, "))
        return noTargetEffect(monster.onTakesCombatDamageEffect(game, s, [6]));
    if(s.startsWith("each time this takes combat damage, "))
        return noTargetEffect(monster.onTakesCombatDamageEffect(game, s));
    if(s.startsWith("each time the attacking player activates an item, they "))
            return noTargetEffect(monster.onAttackingPlayerActivatesItemEffect(game, s));
    if(s.startsWith("when the attacking player rolls an attack roll of "))
            return noTargetEffect(monster.onAttackingPlayerRollsEffect(game, s));

    // Number-robust parsing for standard monster effects.
    // Keep this limited to cases where the extracted number(s) are used by the returned effect.
    {
        const parsed = applyNumberRobustChecks(nr, [
            {
                patterns: ["when this dies, it deals x damage to the player who killed it"],
                parse: (nr) => noTargetEffect(monster.dealDamageToKillerOnDeathEffect(game, nr.nextNumber())),
            },
            {
                patterns: ["put it in the monster deck x cards from the top"],
                parse: (nr) => noTargetEffect(monster.putInMonsterDeckNFromTopEffect(game, nr.nextNumber())),
            },
            {
                patterns: ["after gaining rewards, the active player rolls-\nx or x: put this on top of the monster deck"],
                parse: (nr) => {
                    // Use the extracted roll values directly.
                    const rolls = nr.numbers.slice();
                    return noTargetEffect(monster.putOnTopOfMonsterDeckOnRollEffect(game, rolls));
                },
            },
            {
                patterns: ["when this dies on an attack roll of x, double its rewards"],
                parse: (nr) => noTargetEffect(monster.doubleRewardsOnDeathRollEffect(game, [nr.nextNumber()])),
            },
            {
                patterns: ["it deals x damage to each player"],
                parse: (nr) => noTargetEffect(active.dealDamageToEachPlayerEffect(game, nr.nextNumber())),
            },
            {
                patterns: ["it deals x damage to each non-active player"],
                parse: (nr) => noTargetEffect(active.dealDamageToEachPlayerEffect(game, nr.nextNumber(), false)),
            },
            {
                patterns: ["this gains x [atk] till end of turn"],
                parse: (nr) => noTargetEffect(passive.temporaryStatModifierEffect([game.addAttack.bind(game)], nr.nextNumber(), game, "issuer")),
            },
            {
                patterns: ["it gains x [atk] till end of turn"],
                parse: (nr) => noTargetEffect(passive.temporaryStatModifierEffect([game.addAttack.bind(game)], nr.nextNumber(), game, "issuer")),
            },
            {
                patterns: ["other monsters have x [dc]"],
                parse: (nr) => noTargetEffect(monster.monstersGainDCEffect(game, nr.nextNumber(), false)),
            },
            {
                patterns: ["monsters have x [dc]"],
                parse: (nr) => noTargetEffect(monster.monstersGainDCEffect(game, nr.nextNumber(), true)),
            },
            {
                patterns: ["monsters have x [hp]"],
                parse: (nr) => noTargetEffect(monster.monstersGainHPEffect(game, nr.nextNumber())),
            },
            {
                patterns: ["it heals x [hp]"],
                parse: (nr) => noTargetEffect(active.healEffect(game, nr.nextNumber())),
            },
            {
                patterns: ["look at the top x cards of the monster deck and put them back in any order"],
                parse: (nr) => noTargetEffect(active.lookAndReorderTopCardsEffect(game, nr.nextNumber(), "monster", "currentPlayer")),
            },
            {
                patterns: [
                    "deal x damage to the player to your left",
                    "deal x damage to the player to the active player's left",
                ],
                parse: (nr) => noTargetEffect(monster.dealDamageToPlayerToTheEffect(game, nr.nextNumber(), "left")),
            },
            {
                patterns: ["deal x damage to the player to your right"],
                parse: (nr) => noTargetEffect(monster.dealDamageToPlayerToTheEffect(game, nr.nextNumber(), "right")),
            },
            {
                patterns: ["look at the top x cards of the loot deck. put them back in any order"],
                parse: (nr) => noTargetEffect(active.lookAndReorderTopCardsEffect(game, nr.nextNumber(), "loot")),
            },
            {
                patterns: ["when any player controls a soul, players who control the most souls or tied for the most must pay each other player x¢ to attack"],
                parse: (nr) => noTargetEffect(room.payOtherPlayersToAttackEffect(game, nr.nextNumber())),
            },
        ]);
        if (parsed !== null) return parsed;
    }
    switch (s) {
        
        case "search the monster deck for a card named the bloat and put it in a monster slot not being attacked":
            return noTargetEffect(monster.searchForBloatEffect(game));
        
        case "when this dies, the player that killed it discards their hand.":
            return noTargetEffect(monster.killerDiscardsHandOnDeathEffect(game));
        
        case "when another monster dies, this dies.":
            return noTargetEffect(monster.dieWhenAnotherMonsterDiesEffect(game));
        case "this can't be attacked.":
            return noTargetEffect(monster.cantBeAttackedEffect(game));
        case "damage dealt to this is also dealt to the player to the active player's right.":
            return noTargetEffect(monster.damageAlsoPlayerToTheEffect(game, "right"));
        
        case "damage dealt to this is also dealt to the player to the active player's left.":
            return noTargetEffect(monster.damageAlsoPlayerToTheEffect(game, "left"));
        case "damage this deals to the active player is also dealt to the player to their left.":
            return noTargetEffect(monster.damageDealtToActivePlayerAlsoToTheEffect(game, "left"));
        case "choose the player with the most ¢ or tied for the most. that player loses all their ¢.":
            return noTargetEffect(monster.playerWithMostCoinsLosesAllEffect(game));
        case "each time this would take damage, the active player rolls-\n1: prevent that damage.":
            return noTargetEffect(monster.preventDamageOnRollEffect(game, [1]));
        case "it deals 1 damage to each other monster.":
            return noTargetEffect(monster.dealDamageToEachOtherMonsterEffect(game, 1));
        case "it deals 1 damage to the attacking player.":
            return noTargetEffect(monster.dealDamageToAttackingPlayerEffect(game, 1));
        case "every other time this takes damage each turn, it gains +1 [dc] till end of turn.":
            return noTargetEffect(monster.onEveryOtherDamageEffect(game, passive.temporaryStatModifierEffect([game.addDC.bind(game)], 1, game, "issuer")));
        
        case "you must attack on your turn if able.":
            return noTargetEffect(monster.attackRequirementEachTurnEffect(game, "any", 1, "total"));
        case "the first time this would die each turn, prevent death. this heals 2 [hp] and gains +1 [dc] and -1 [atk] till end of turn.":
            return noTargetEffect(monster.preventDeathFirstTimeEachTurnHealAndStatModifierEffect(game));
        case "reveal cards from the top of the monster deck till you reveal 2 boss cards. put them in one or more monster slots not being attacked and the rest into discard. the active player must make an additional attack on one of them this turn.":
            return noTargetEffect(monster.bossRushEffect(game));
        case "look at the top 3 cards of a deck and put them back in any order.":
            return noTargetEffect(active.lookAndReorderTopCardsEffect(game, 3, "selectOnResolve"));
        case "when a player gains this soul, choose a player who controls the most souls or tied for the most. that player wins.":
            return noTargetEffect(monster.playerWithMostSoulsWinsEffect(game));
        case "each time the active player deals damage to this, they roll-\n1-2: they take 1 damage.\n3-4: each player takes 1 damage.\n5-6: this takes 1 damage.":
            return noTargetEffect(monster.OnDamageByActivePlayerRollDealDamageEffect(game));
        case "they take 1 damage.":
            return noTargetEffect(monster.targetTakeDamageEffect(game, 1));
        
        default:
            return null; // No match found
    }
}

function parseRoomEffect(s: string, game: Game, nr: NumberRobustString): ParsedEffect | null {

    // Number-robust parsing for room effects.
    // Keep this limited to cases where the extracted number(s) are used by the returned effect.
    {
        const parsed = applyNumberRobustChecks(nr, [
            {
                patterns: ["at the start of each turn, the active player gains x¢"],
                parse: (nr) => noTargetEffect(room.gainCoinsAtStartOfTurnEffect(game, nr.nextNumber(), true)),
            },
            {
                patterns: ["shop items the active player purchases cost x¢ less"],
                parse: (nr) => noTargetEffect(room.cheaperShopItemsEffect(game, nr.nextNumber())),
            },
            {
                patterns: ["each time a player declares an attack, before choosing what to attack, they may look at the top x cards of the monster deck and put them back in any order"],
                parse: (nr) => noTargetEffect(room.lookAtTopNOnAttackEffect(game, nr.nextNumber())),
            },
            {
                patterns: ["each time a player dies, each other player gains x¢"],
                parse: (nr) => noTargetEffect(room.gainCoinsOnPlayerDeathEffect(game, nr.nextNumber())),
            },
            {
                patterns: ["each time a player dies, each other player loots x"],
                parse: (nr) => noTargetEffect(room.lootOnPlayerDeathEffect(game, nr.nextNumber())),
            },
            {
                patterns: ["at the end of the turn, the active player loses x¢"],
                parse: (nr) => noTargetEffect(room.loseCoinsAtEndOfTurnEffect(game, nr.nextNumber())),
            },
            {
                patterns: ["at the end of each turn, the active player discards a loot card"],
                parse: (nr) => noTargetEffect(room.discardLootAtEndOfTurnEffect(game, 1)),
            },
            {
                patterns: ["at the end of each turn, the active player discards x loot card"],
                parse: (nr) => noTargetEffect(room.discardLootAtEndOfTurnEffect(game, nr.nextNumber())),
            },
            {
                patterns: ["monsters have x [atk]"],
                parse: (nr) => noTargetEffect(room.monstersGainAttackEffect(game, nr.nextNumber(), true)),
            },
            {
                patterns: ["a monster gains x [dc] till end of turn"],
                parse: (nr) => ({
                    effectFunction: passive.temporaryStatModifierEffect([game.addDC.bind(game)], nr.nextNumber(), game, "next"),
                    targetSelectors: selectMonster(game),
                }),
            },
            {
                patterns: ["a monster gains -x [dc] till end of turn"],
                parse: (nr) => ({
                    effectFunction: passive.temporaryStatModifierEffect([game.addDC.bind(game)], -nr.nextNumber(), game, "next"),
                    targetSelectors: selectMonster(game),
                }),
            },
            {
                patterns: ["when this enters play, each player discards their hands and loots x"],
                parse: (nr) => noTargetEffect(room.discardHandsAndLootEffect(game, nr.nextNumber())),
            },
            {
                patterns: ["each time a player loots, they take x damage"],
                parse: (nr) => noTargetEffect(room.takeDamageOnLootEffect(game, nr.nextNumber())),
            },
            {
                patterns: ["players have x [hp]"],
                parse: (nr) => noTargetEffect(room.allPlayersPermanentStatModifierEffect([game.addHealth], nr.nextNumber(), game)),
            },
            {
                patterns: ["each time a player deals damage to a monster, they deal x damage to the player to their left"],
                parse: (nr) => noTargetEffect(room.WhenDealDamageMonsterDealDamageToPlayerToTheEffect(game, nr.nextNumber(), "left")),
            },
        ]);
        if (parsed !== null) return parsed;
    }

    switch (s) {
        case "players can't gain souls.":
            return noTargetEffect(room.preventGainSoulsEffect(game));
        case "each time the active player attacks the top of the monster deck, after putting it in a monster slot, they may cancel their attack.":
            return noTargetEffect(room.cancelAttackOnTopOfMonsterDeckEffect(game));
        
        case "rewards are doubled.":
            return noTargetEffect(room.doubleRewardsEffect(game));
        case "when a player dies, if that player was attacked this turn, that player gives the active player the item they would destroy for the death penalty.":
            return noTargetEffect(room.giveDeathPenaltyItemToActivePlayerEffect(game));
        
        case "the player who killed it kills another player.":
            return noTargetEffect(room.targetNextKillsAnotherPlayerEffect(game));
        case "at the start of the turn, the active player may reroll an item they control.":
            return noTargetEffect(room.mayRerollItemAtStartOfTurnEffect(game));
        case "at the start of the turn, the active player may gain +1 treasure.":
            return noTargetEffect(room.mayGainTreasureAtStartOfTurnEffect(game));
        case "at the end of the turn, if the active player has 1 or fewer loot cards in their hand, they take 1 damage.":
            return noTargetEffect(room.damageIfLowLootAtEndOfTurnEffect(game, 1));
        case "at the end of the turn, put this into discard.":
            return noTargetEffect(room.putThisIntoDiscardAtEndOfTurnEffect(game));
        case "when this enters play, the active player rerolls each item they control.":
            return noTargetEffect(active.rerollEachItemEffect(game, "currentPlayer"));
        case "when this enters play, each player rerolls each of their items.":
            return noTargetEffect(active.rerollEachItemEffect(game, "eachPlayer"));
        
        case "when this enters play, put each shop item into discard.":
            return noTargetEffect(active.flushShopEffect(game, "discard"));
        case "when this enters play, put each monster into discard.":
            return noTargetEffect(active.flushMonsterSlotsEffect(game, "discard"));
        case "when this enters play, reroll each item in play, each player discards their hand and loots 3. put each monster into discard.":
            return noTargetEffect(room.enterPlayRerollItemsDiscardHandsLootAndFlushMonstersEffect(game));
        case "if a player would gain any amount of ¢, instead each player gains that much ¢.":
            return noTargetEffect(room.eachPlayerGainsCoinsEffect(game));
        case "at the end of the turn, if the active player didn't purchase a shop item, they discard their hand.":
            return noTargetEffect(room.discardHandIfNoShopPurchaseAtEndOfTurnEffect(game));
        case "each time a player gains a soul, they skip their next turn.":
            return noTargetEffect(room.skipNextTurnOnSoulGainEffect(game));
        case "this item can be attacked.":
        case "this room can be attacked.":
            return noTargetEffect(room.canBeAttackedEffect(game));
        case "each time a player would roll a 1 or 6, they may reroll it.":
            return noTargetEffect(room.rerollOn1Or6Effect(game));
        
        case "players have +1 [atk] .":
            return noTargetEffect(room.playersGainAttackEffect(game, 1));
        case "players who control the most items or tied for the most may only recharge one item during their recharge step.":
            return noTargetEffect(passive.rechargeOneDuringRechargeStepEffect(game));
        
        case "players have +1 [atk] .":
            return noTargetEffect(room.allPlayersPermanentStatModifierEffect([game.addAttack], 1, game));
        case "when a player dies, before paying penalties, they must destroy an item they control.":
            return noTargetEffect(room.playerMustDestroyItemOnDeathEffect(game));
        case "at the end of the turn, the active player deactivates their character.":
            return noTargetEffect(room.deactivateCharacterAtEndOfTurnEffect(game));
        case "at the start of the turn, the active player may pay [hp] until they have 1 [hp] . if they do, each time a monster dies this turn, they gain +1 treasure.":
            return noTargetEffect(room.payHpForTreasureBoostEffect(game));
        
        case "note each goal as players complete them.":
            return noTargetEffect((data: EffectData) => true);
        case "players who control the fewest souls or tied for fewest have +1 [atk] and may attack an additional time on their turn.":
            return noTargetEffect(room.playersWithFewestSoulsAttackBoostEffect(game));
        case "players who control the fewest souls or tied for fewest may purchase a shop item for 0¢ on their turn.":
            return noTargetEffect(room.playersWithFewestSoulsFreeShopItemEffect(game));
        case "put each shop item or each monster not being attacked into discard.":
            return noTargetEffect(room.flushShopOrUnattackedMonstersEffect(game));
        case "note each goal as players complete them. this room can't be put into discard till 4 goals are completed.\n1. play 5 loot cards.\n2. kill 3 monsters.\n3. give at least 6¢ to another player at one time.\n4. purchase 3 items.\n5. roll a 6 three times. when 4 goals are completed, each player gains +2 treasure.":
            return noTargetEffect(room.socialGoalsEffect(game));
        case "players can't activate more than one ability each turn.":
            return noTargetEffect(room.playersCanOnlyActivateOnceATurn(game));
        case "players can't play more than one loot card each turn.":
            return noTargetEffect(room.playersCanOnlyPlayLootOnceATurn(game));
        default:
            return null; // No match found
    }
}