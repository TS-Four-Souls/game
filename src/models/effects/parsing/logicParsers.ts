import {Game} from "@/models/game.ts";
import * as active from "@/models/effects/activeEffect.ts";
import * as passive from "@/models/effects/passiveEffect.ts";
import {NumberRobustString} from "@/models/effects/parsing/numberRobustString.ts";
import {EffectData, type EffectFunction, type SyncEffectFunction} from "@/models/types/cardTypes.ts";
import type {OnDeathMonsterData, OnEnterPlayData} from "@/models/types/eventTypes.ts";
import {Monster} from "@/models/entities/monster.ts";
import {Player} from "@/models/entities/player.ts";
import {noTargets} from "@/models/effects/parsing/selectors.ts";
import {effectParser, syncEffectParser, type ParsedEffect, type SyncParsedEffect} from "@/models/effects/parsing/effectParser.ts";
import { addToStackEffect } from "@/models/effects/activeEffect.ts";
import { toSerializedTranslation } from "@/utils/translation";
import { GameError } from "@/models/GameError";

export function eachTimeActivateItemEffect(s: string, game: Game): SyncParsedEffect {
    const restOfEffect = s.substring("each time a player activates an item, they".length).trim();
    const restParsed = effectParser(restOfEffect, game, true);
    return {
        effectFunction: passive.onAnyEventEffect("on:item:activated", [restParsed.effectFunction], game, s),
        targetSelectors: restParsed.targetSelectors
    };
}

export function parseEachTimeRollEffect(s: string, game: Game, nr?: NumberRobustString): SyncParsedEffect {
    const numberRobustString = nr ?? new NumberRobustString(s);
    const masked = numberRobustString.toString();

    // Check for "each time the attacking player rolls an attack roll of X"
    const attackingPrefix = "each time the attacking player rolls an attack roll of x";
    if (masked.startsWith(attackingPrefix)) {
        const rollValue = numberRobustString.numbers[0];
        if(rollValue === undefined) throw new GameError(`Could not parse 'Each time the attacking player rolls an attack roll of X' effect: ${s}`,
            toSerializedTranslation("error2.parsingError", {error: `Could not parse 'Each time the attacking player rolls an attack roll of X' effect: ${s}`})
        );
        let restOfEffect = (numberRobustString.restAfter(attackingPrefix) ?? "").trim();
        if (restOfEffect.startsWith(",")) restOfEffect = restOfEffect.substring(1).trim();
        restOfEffect = restOfEffect.replace(/^they\b/iu, "").trim();
        if (restOfEffect.startsWith("may") ||
            restOfEffect.startsWith("must")
        ) {
            restOfEffect = "you " + restOfEffect;
        }
        const restParsed = effectParser(restOfEffect, game, true);
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
        const rollValue = numberRobustString.numbers[0];
        if(rollValue === undefined) throw new GameError(`Could not parse 'Each time a player rolls a X' effect: ${s}`,
            toSerializedTranslation("error2.parsingError", {error: `Could not parse 'Each time a player rolls a X' effect: ${s}`})
        );
        let restOfEffect = (numberRobustString.restAfter(theyPrefix) ?? "").trim();
        if (restOfEffect.startsWith("may") ||
            restOfEffect.startsWith("must")
        ) {
            restOfEffect = "you " + restOfEffect;
        }
        const restParsed = effectParser(restOfEffect, game, true);
        return {
            effectFunction: passive.onRollEffect([rollValue], restParsed.effectFunction, game, true),
            targetSelectors: restParsed.targetSelectors
        };
    }

    const genericPrefix = "each time a player rolls a x";
    if (masked.startsWith(genericPrefix)) {
        const rollValue = numberRobustString.numbers[0];
        if(rollValue === undefined) throw new GameError(`Could not parse 'Each time a player rolls a X' effect: ${s}`,
            toSerializedTranslation("error2.parsingError", {error: `Could not parse 'Each time a player rolls a X' effect: ${s}`})
        );
        let restOfEffect = (numberRobustString.restAfter(genericPrefix) ?? "").trim();
        if (restOfEffect.startsWith(",")) restOfEffect = restOfEffect.substring(1).trim();
        const restParsed = effectParser(restOfEffect, game, true);
        return {
            effectFunction: passive.onRollEffect([rollValue], restParsed.effectFunction, game),
            targetSelectors: restParsed.targetSelectors
        };
    }
    throw new GameError(`Could not parse 'Each time a player rolls a X' effect: ${s}`,
        toSerializedTranslation("error2.parsingError", {error: `Could not parse 'Each time a player rolls a X' effect: ${s}`})
    );
}

export function parseWhenActivePlayerRollsEffect(s: string, game: Game, nr?: NumberRobustString): SyncParsedEffect {
    const numberRobustString = nr ?? new NumberRobustString(s);
    const masked = numberRobustString.toString();
    const prefix = "when the active player rolls a x";
    if (masked.startsWith(prefix)) {
        const rollValue = numberRobustString.numbers[0];
        if(rollValue === undefined) throw new GameError(`Could not parse 'When the active player rolls a X' effect: ${s}`,
            toSerializedTranslation("error2.parsingError", {error: `Could not parse 'When the active player rolls a X' effect: ${s}`})
        );
        let restOfEffect = (numberRobustString.restAfter(prefix) ?? "").trim();
        if (restOfEffect.startsWith(",")) restOfEffect = restOfEffect.substring(1).trim();
        const restParsed = effectParser(restOfEffect, game, true);
        return {
            effectFunction: passive.onActivePlayerRollEffect([rollValue], restParsed.effectFunction, game),
            targetSelectors: restParsed.targetSelectors
        };
    }
    throw new GameError(`Could not parse 'When the active player rolls a X' effect: ${s}`,
        toSerializedTranslation("error2.parsingError", {error: `Could not parse 'When the active player rolls a X' effect: ${s}`})
    );
}

export function ParseWhenGainOrPurchaseThis(s: string, game: Game): SyncParsedEffect {
    const restOfEffect = s.substring("when you gain or purchase this, ".length).trim();
    const restParsed = effectParser(restOfEffect, game, true);
    return noTargetSyncEffect(passive.onYourEventEffect("on:enter:play:after", [restParsed.effectFunction], game, s, false, (effect: EffectData, event: OnEnterPlayData) => event.card === effect.it));
}

export function parseYouMayEffect(s: string, game: Game): ParsedEffect {
    const restOfEffect = s.substring("you may".length).trim();
    const shouldHandleYouMay = [true];
    const restParsed = effectParser(restOfEffect, game, true, shouldHandleYouMay);
    return {
        effectFunction: async (data: EffectData): Promise<boolean> => {
            if (data.issuer instanceof Player === false) return false;
            let choice = !shouldHandleYouMay[0];
            if (!choice) {
                const selection = await data.selectAndRecord(game, data.issuer, 0, 1, [data.it], toSerializedTranslation("pending.useItemEffect", { card: data.it.nameKey }), false, true, false);
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

export function parseAtTheEndOfYourTurnEffect(s: string, game: Game): SyncParsedEffect {
    const restOfEffect = s.substring("at the end of your turn, ".length).trim();
    const restParsed = effectParser(restOfEffect, game, true);
    return {
        effectFunction: passive.onYourEventEffect("on:turn:end", [restParsed.effectFunction], game, s),
        targetSelectors: restParsed.targetSelectors
    };
}

export function parseAtTheEndOfEachTurnEffect(s: string, game: Game): SyncParsedEffect {
    const restOfEffect = s.substring("at the end of each turn, ".length).trim();
    const restParsed = effectParser(restOfEffect, game, true);
    return {
        effectFunction: passive.onAnyEventEffect("on:turn:end", [restParsed.effectFunction], game, s),
        targetSelectors: restParsed.targetSelectors
    };
}

export function parseWhenThisDiesEffect(s: string, game: Game): SyncParsedEffect {
    const restOfEffect =
        s.startsWith("when this dies, after gaining rewards, ")
            ? s.substring("when this dies, after gaining rewards, ".length).trim()
            :
            s.substring("when this dies, ".length).trim();
    const restParsed = effectParser(restOfEffect, game, true);
    return {
        effectFunction: passive.onYourEventEffect("on:death:monster", [restParsed.effectFunction], game, s),
        targetSelectors: restParsed.targetSelectors
    };
}

export function parseAtTheStartOfYourTurnEffect(s: string, game: Game): SyncParsedEffect {
    const restOfEffect = s.substring("at the start of your turn ".length).trim();
    const restParsed = effectParser(restOfEffect, game, true);
    return {
        effectFunction: passive.onYourEventEffect("on:turn:start", [restParsed.effectFunction], game, s),
        targetSelectors: restParsed.targetSelectors
    };
}

export function parseOnDamageTakenEffect(s: string, game: Game): SyncParsedEffect {
    const restOfEffect = s.substring(s.indexOf(",") + 1).trim();
    const restParsed = effectParser(restOfEffect, game, true);
    return {
        effectFunction: passive.onDamageTakenEffect([restParsed.effectFunction], game),
        targetSelectors: restParsed.targetSelectors
    };
}

export function parseLvXEffect(s: string, game: Game, nr?: NumberRobustString): SyncParsedEffect {
    nr = nr ?? new NumberRobustString(s);
    const lvl = nr.nextNumber();
    const effectString = s.substring(s.indexOf("]") + 1).trim();
    const restParsed = syncEffectParser(effectString, game);
    if(restParsed === null) throw new GameError(`Could not parse 'LvX' effect: ${s}`, toSerializedTranslation("error2.parsingError", {error: `Could not parse 'LvX' effect: ${s}`}));
    return noTargetSyncEffect(passive.lvlXaddListenerEffect([restParsed.effectFunction], lvl, game));
}

export function parseTheyEffect(s: string, game: Game): ParsedEffect {
    const restOfEffect = s.substring("they".length).trim().replaceAll("they", "you");
    const restParsed = effectParser(restOfEffect, game, true);
    return {
        effectFunction: active.dataNextIsIssuerEffect(game, [restParsed.effectFunction]),
        targetSelectors: restParsed.targetSelectors
    };
}

export function parseWhenThisEntersPlay(s: string, game: Game): ParsedEffect {
    const restOfEffect = s.substring("when this enters play,".length).trim();
    const restParsed = effectParser(restOfEffect, game, true);
    return noTargetEffect(restParsed.effectFunction);
}

export function syncParseWhenThisEntersPlay(s: string, game: Game): SyncParsedEffect {
    const restOfEffect = s.substring("when this enters play,".length).trim();
    const restParsed = effectParser(restOfEffect, game, true);
    return noTargetSyncEffect(addToStackEffect(game, restParsed.effectFunction, s));
}

export function parseFirstKillMonsterTurnEffect(s: string, game: Game): SyncParsedEffect {
    const restOfEffect = s.substring("the first time you kill a monster on your turn, ".length).trim();
    const restParsed = effectParser(restOfEffect, game, true);
    return {
        effectFunction: passive.onFirstKillMonsterYourTurnEffect([restParsed.effectFunction], game),
        targetSelectors: restParsed.targetSelectors
    };
}

export function parseEachTimeDeclareAttackEffect(s: string, game: Game): SyncParsedEffect {
    const restOfEffect = s.substring(s.indexOf(",") + 1).trim();
    const restParsed = effectParser(restOfEffect, game, true);
    return {
        effectFunction: passive.onYourEventEffect("on:attack:declared", [restParsed.effectFunction], game, s),
        targetSelectors: restParsed.targetSelectors
    };
}

export function parseEachTimeYouKillSpecificTypeEffect(s: string, game: Game, type: "monster" | "player"): SyncParsedEffect {
    const restOfEffect = s.substring(`each time you kill a ${type}, `.length).trim();
    const restParsed = effectParser(restOfEffect, game, true);
    return {
        effectFunction: passive.onYourKillEffect([restParsed.effectFunction], game, s, (effectData: EffectData, eventData: OnDeathMonsterData) => {
            return eventData.eventIssuer instanceof (type === "monster" ? Monster : Player);
        }),
        targetSelectors: restParsed.targetSelectors
    };
}

export function parseEachTimeAnotherPlayerDiesEffect(s: string, game: Game): SyncParsedEffect {
    const restOfEffect = s.substring("each time another player dies, ".length).trim();
    const restParsed = effectParser(restOfEffect, game, true);
    return noTargetSyncEffect(passive.onAnotherPlayerEventEffect("on:death:before-penalty", [restParsed.effectFunction], game, s));
}

export function parseEachTimeWouldRollEffect(s: string, game: Game): SyncParsedEffect {
    const nr = new NumberRobustString(s);
    const masked = nr.toString();
    const prefix = "each time a player would roll a x";
    if (!masked.startsWith(prefix))
        throw new GameError(`Could not parse 'Each time a player would roll a X' effect: ${s}`, toSerializedTranslation("error2.parsingError", {error: `Could not parse 'Each time a player would roll a X' effect: ${s}`}));

    const value = nr.numbers[0];
    if (value === undefined) throw new GameError(`Could not parse 'Each time a player would roll a X' effect: ${s}`, toSerializedTranslation("error2.parsingError", {error: `Could not parse 'Each time a player would roll a X' effect: ${s}`}));
    let restOfEffect = (nr.restAfter(prefix) ?? "").trim();
    if (restOfEffect.startsWith(",")) restOfEffect = restOfEffect.substring(1).trim();
    const restParsed = effectParser(restOfEffect, game, true);
    return {
        effectFunction: passive.onWouldRollEffect([restParsed.effectFunction], [value], game),
        targetSelectors: restParsed.targetSelectors
    };
}

export function parseCurseEffect(s: string, game: Game): SyncParsedEffect {
    const restOfEffect = s.trim();
    const restParsed = syncEffectParser(restOfEffect, game);
    if(restParsed === null) throw new GameError(`Could not parse 'Curse' effect: ${s}`, toSerializedTranslation("error2.parsingError", {error: `Could not parse 'Curse' effect: ${s}`}));
    return {
        effectFunction: passive.curseEffect(restParsed.effectFunction, game),
        targetSelectors: restParsed.targetSelectors
    };
}

export function noTargetEffect(effectFunction: EffectFunction): ParsedEffect {
    return {effectFunction, targetSelectors: noTargets};
}

export function noTargetSyncEffect(effectFunction: SyncEffectFunction): SyncParsedEffect {
    return {effectFunction, targetSelectors: noTargets};
}