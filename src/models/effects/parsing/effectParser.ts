import * as active from "../activeEffect";
import {Card, LootCard, MonsterCard, MonsterType} from "../../cards";
import {Game} from "../../game";
import { GameError } from "@/models/GameError";
import * as monster from "../monsterEffects";
import * as passive from "../passiveEffect";
import * as room from "../roomEffects";
import {Player} from "../../entities/player";
import {DiceRoll} from "../../stackElement";
import {EffectData, type AsyncEffectFunction, type EffectFunction, type SyncEffectFunction, type TargetsSelector} from "../../types/cardTypes";
import type {OnCounterModifiedData, OnDamageTakenData, OnDamageWouldTakeData, OnDeathBeforePenaltyData, OnDeathMonsterData, OnDeathPenaltyData, OnLootStepData, OnPurchaseDeclaredData} from "../../types/eventTypes";
import {Monster} from "../../entities/monster";
import {type OnRollData} from "../../types/eventTypes";
import {NumberRobustString} from "./numberRobustString";
import {
    decideEntitySelector,
    selectAliveNonActivePlayer,
    selectAlivePlayer,
    selectAnotherItemFromAnywhere,
    selectAnotherItemYouControl,
    selectAnotherNonEternalItemFromAnywhere,
    selectAnotherPlayer,
    selectAnotherPlayerNonEternalItem,
    selectAnyTapItem,
    selectAttackableMonster,
    selectCardInPlayOrLootBeingPlayed,
    selectCharacterCardFromOutside,
    selectCurse,
    selectDeck,
    selectDiceWillRoll,
    selectEternalItemYouControl,
    selectItem,
    selectItemYouControl,
    selectLootInYourHand,
    selectMonsterNotAttackedOrShopItem,
    selectLootOnStack,
    selectMonster,
    selectMonsterBeingAttacked,
    selectMonsterNotBeingAttacked,
    selectNonEternalItem,
    selectNonEternalItemFromAnywhere,
    selectNonEternalItemOrASoul,
    selectNonEternalItemYouControl,
    selectNonEternalPassiveItem,
    selectNonEternalTapItem,
    selectNumber1to6,
    selectPassiveAbilityOrMonsterAbility,
    selectPlayer,
    selectPlayerOrMonster,
    selectPlayerWithMostSouls,
    selectRoll,
    selectRollAddOrSubtract,
    selectRollAndNumber,
    selectShopItem,
    selectSoulYouControl,
    selectStackElementOrLoot,
    selectTapItem,
    selectTopAnyDiscard,
    selectUsableAbilityStackElement,
    selectXCardsFromDiscard,
    selectPlayerInCombat,
    selectMomMonster,
    selectStackElementOrLootTargetingYourItemOrDice,
    noTargets,
    selectCoverableMonster,
    selectEternalTapItem,
    selectNbCountersOnCard
} from "@/models/effects/parsing/selectors.ts";
import * as logic from "@/models/effects/parsing/logicParsers.ts";
import { toSerializedTranslation } from "@/utils/translation";
import type { Entity } from "@/models/entities/entity";

/**
 * Guide to develop your own effects.
 * 
 * 
 * 1 - see what part of the effect is already parsed correctly, launch the parser on it, it will throw at the first part it can't parse. CTRL + f is your friend.
 * 2 - if the effect includes a trigger, you may choose to integrate the trigger in the main parser, if it is used commonly in other effects. If not, you can create a specific parser fot this effect.
 * 3 - Two types of user interactions exists:
 *  first, most decision must be recorder when the effect enters the stack, it is done in the code using an array of TargetSelector.
 *  second, some effects require the user to make a decision at the moment the effect is executed, (chosing a card of a deck for instance). triggered effects, also belong to this category as they go on the stack without user interaction.
 *  This second category of interaction is handled by data.selectAndRecord function.
 * 4 - Write a test for each outcome of each effect.
 */

export const INFINITY = 999999;
/**
 * Represents a parsed effect with both its execution function and target selectors.
 * This unified structure eliminates the need to parse effect strings twice.
 */
export interface ParsedEffect {
    effectFunction: EffectFunction;
    targetSelectors: TargetsSelector[];
}
export interface SyncParsedEffect {
    effectFunction: SyncEffectFunction;
    targetSelectors: TargetsSelector[];
}
export interface AsyncParsedEffect {
    effectFunction: AsyncEffectFunction;
    targetSelectors: TargetsSelector[];
}

/**
 * Prepares the effect string for parsing by removing markers and unnecessary punctuation (namely, "!"), converting to lowercase, and normalizing numbers.
 */
function prepareStringForParsing(s: string): string {
    s = s.replace("[Tap Effect] ", ""); 
    s = s.replace("[Paid Effect] ", ""); 
    s = s.replace("[Curse Effect] ", ""); // remove curse effect marker
    s = s.replaceAll("!", "");

    s = s.toLowerCase();
    s = s.replace(/[❶➀]/g, "1")
        .replace(/[❷➁]/g, "2")
        .replace(/[❸➂]/g, "3")
        .replace(/[❹➃]/g, "4")
        .replace(/[❺➄]/g, "5")
        .replace(/[❻➅]/g, "6");
    return s;
}

/**
 * This funcition is the main orchestrator for parsing effect strings from natural language to ParsedEffects. 
 * It tries different parsing functions in a specific order. The order is explained in the core of the function.
 * Note that although a lot of logic is handled automatically, many edge cases require exceptions.
 * For instance, effects that mention multiple entities using "they", "it", "you". 
 * 
 * @param s string to be parsed
 * @param game current game state, needed to create the effect function and target selectors.
 * @param selectionOnResolve if true, the effects expect to have their targets selected at the moment they are resolved, and not when they are created.
 * @param youMayEffectHanging a pointer to a boolean that indicates whether we are currently parsing a "you may" effect and haven't yet handled the "you may" part.
 * Some effect can handle you may by allowing user to choose 0 options of a list. These effect set the pointer to true. 
 * On the other hand, if no effect handle a hanging you may, the game will ask the user to choose whether to execute the effect or not before executing it.
 * @returns 
 */
export function effectParser(s: string, game: Game, selectionOnResolve = false, youMayEffectHanging = [false]): ParsedEffect {
    
    s = prepareStringForParsing(s);
    // console.log(`Parsing effect: "${s}"`);
    // NumberRobustString is a helper class that allows to easily extract numbers from the effect string, while keeping track of the current position in the string.
    // It allows string to be parsed regardless of the numbers it contains.
    // It also add additional mask functions: remove the . at the end of the sentence, and remove + before numbers.
    const nr = new NumberRobustString(s);
    
    // Commun triggers are parsed here (e.g., "at the start of your turn, "). 
    // Note that they are always positioned at the begining of the sentence.
    // If a trigger is matched, the parser will be called recursively to parse the rest of the effect.
    // Then, each time the trigger condition is met, the rest of the effect will be executed.
    if (s.startsWith("when this enters play"))
        return logic.parseWhenThisEntersPlay(s, game);
    const triggeredEffect = parseTriggeredEffect(s, game, nr, selectionOnResolve, youMayEffectHanging);
    if (triggeredEffect !== null) {
        return triggeredEffect;
    }
    
    // Effects that start with a key expression (e.g., "you may", "they", "choose one", "kill") are parsed here.
    // These are effects that require specific handling (e.g., "you may", "they"), or that can be easily identified by their first words (e.g., "choose one", "kill").
    const startWithKeyExpressionEffect = parseStartWithKeyExpressionEffect(s, game, nr, selectionOnResolve, youMayEffectHanging);
    if (startWithKeyExpressionEffect !== null) {
        return startWithKeyExpressionEffect;
    }
    
    // Effects that exists for multiple words, in particular variable deck names (e.g., "look at the top x card of the treasure deck") are parsed here.
    const variableDeckNameEffect = parseVariableDeckNameEffect(s, game, nr, selectionOnResolve, youMayEffectHanging);
    if (variableDeckNameEffect !== null) {
        return variableDeckNameEffect;
    }
    
    // Most effects are parsed here, using a massive switch statement. 
    // This is the default parsing function, that is used if no trigger or key expression is matched.
    // It includes simple effects (e.g. gain x¢) but also complex triggered effect that were not fit to be integrated in the triggered effect parsing function (e.g. "when the active player rolls a x, ").
    const standardEffect = parseStandardEffect(s, game, nr, selectionOnResolve, youMayEffectHanging);
    if (standardEffect !== null) {
        return standardEffect;
    }
    
    // If the effect includes multiple effects separated by "if you do, ", "otherwise, ", ", then ", " and ", or "." (when not at the end of the sentence), we split the effect in multiple parts and parse them individually.
    // Effects can be a combination of effects. Let's consider two effects A and B, separated by the following:
    // - "if you do, ": A is executed, and if it returns true, then B is executed.
    // - "otherwise, ": A is executed, and if it returns false, then B is executed.
    // - ", then "    : A is executed, and then B is executed regardless of the result of A.
    // - " and "      : A is executed, and if it returns true, then B is executed.
    // - "."*: A is executed, and then B is executed regardless of the result of A.
    // Note that "if you do, " and " and " are parsed the same.
    // Note that ", then " and "." are parsed the same.
    // Finally, " and " and "." are the last to be tried, as they are more likely to be part of the same effect and not a separator.
    const splittedEffect = parseSplittedEffect(s, game, nr, selectionOnResolve, youMayEffectHanging);
    if (splittedEffect !== null) {
        return splittedEffect;
    }

    console.log(`Could not parse effect: "${s}"`);
    throw new GameError(`Could not parse effect: "${s}"`, toSerializedTranslation("error.parsingError", {error: `Could not parse effect: "${s}"`}));
}

/**
 * This funcition is the main orchestrator for parsing effect strings from natural language to ParsedEffects. 
 * It tries different parsing functions in a specific order. The order is explained in the core of the function.
 * Note that although a lot of logic is handled automatically, many edge cases require exceptions.
 * For instance, effects that mention multiple entities using "they", "it", "you". 
 */
export function syncEffectParser(s: string, game: Game, nr?: NumberRobustString, selectionOnResolve: boolean = false, youMayEffectHanging: boolean[] = [false]): SyncParsedEffect | null {
    
    s = prepareStringForParsing(s);
    // NumberRobustString is a helper class that allows to easily extract numbers from the effect string, while keeping track of the current position in the string.
    // It allows string to be parsed regardless of the numbers it contains.
    // It also add additional mask functions: remove the . at the end of the sentence, and remove + before numbers.
    nr = nr || new NumberRobustString(s);
    
    // Commun triggers are parsed here (e.g., "at the start of your turn, "). 
    // Note that they are always positioned at the begining of the sentence.
    // If a trigger is matched, the parser will be called recursively to parse the rest of the effect.
    // Then, each time the trigger condition is met, the rest of the effect will be executed.

    const triggeredEffect = parseTriggeredEffect(s, game, nr, selectionOnResolve, youMayEffectHanging);
    if (triggeredEffect !== null) {
        return triggeredEffect;
    }
    if(s.startsWith("the active player ") || s.startsWith("the first time the active player"))
        return parseTheActivePlayerSyncEffect(s, game, nr);
    const standardEffect = parseStandardSyncEffect(s, game, nr, selectionOnResolve, youMayEffectHanging);
    if (standardEffect !== null) {
        return standardEffect;
    }
    if(s.startsWith("[curse] "))
        return logic.parseCurseEffect(s.substring(8).trim(), game);
    return null;
}

/**
 *  Commun triggers are parsed here (e.g., "at the start of your turn, "). 
 * Note that they are always positioned at the begining of the sentence.
 *  If a trigger is matched, the parser will be called recursively to parse the rest of the effect.
 *  Then, each time the trigger condition is met, the rest of the effect will be executed.
 */
function parseTriggeredEffect(s: string, game: Game, nr: NumberRobustString, selectionOnResolve: boolean, youMayEffectHanging: boolean[]): SyncParsedEffect | null {
    if (s.startsWith("when you die, ")) {
        let restString = s.substring(s.indexOf(",") + 1).trim();
        if(restString.startsWith("before paying penalties, "))
            restString = restString.substring(restString.indexOf(",") + 1).trim();
        const restParsed = effectParser(restString, game, true);
        return {
            effectFunction: passive.onYourEventEffect("on:death:before-penalty", [restParsed.effectFunction], game, s),
            targetSelectors: restParsed.targetSelectors
        };
    }
    if (s.startsWith("each time you purchase a shop item, ")) {
        let restString = s.substring(s.indexOf(",") + 1).trim();
        const restParsed = effectParser(restString, game, true);
        return logic.noTargetSyncEffect(passive.onYourEventEffect("on:purchase:success", 
            [restParsed.effectFunction], game, s, false, (data:EffectData, e:any) => e.index !== "top"));
    }
    if (s.startsWith("at the start of each turn, ")) {
        let restString = s.substring(s.indexOf(",") + 1).trim();
        const restParsed = effectParser(restString, game, true);
        return {
            effectFunction: passive.onAnyEventEffect("on:turn:start", [restParsed.effectFunction], game, s),
            targetSelectors: restParsed.targetSelectors
        };
    }
    if(s.startsWith("each time this would take damage, prevent it then ")){
        let restString = s.substring("each time this would take damage, prevent it then ".length).trim();
        const restParsed = effectParser(restString, game, true);
        return {
            effectFunction: passive.onYourEventEffect("on:damage:would-take", [], game, s, false,
                (ef, ev: OnDamageWouldTakeData) => {
                    ev.damageArray[0]! = 0;
                    const newData = new EffectData(ef.it, ()=>ev.target, [], ef.visualEffectBox);
                    passive.addPassiveEffectToStack(game, restParsed.effectFunction, newData, s, ef.visualEffectBox);
                    return true;
                }
            ),
            targetSelectors: restParsed.targetSelectors
        };
    }
    if (s.startsWith("when you would die on your turn, "))
    {
        const restParsed = effectParser(s.substring(s.indexOf(",") + 1).trim(), game, true);
        return logic.noTargetSyncEffect(passive.WouldDieYourTurnEffect([restParsed.effectFunction], game, s, true));
    }
    if(s.startsWith("each time you roll the same result twice in a row on each of your turns, ")){
        return logic.parseEachTimeRollSameResXInRowEffect(s, 2, game);
    }
    if(s.startsWith("each time you miss an attack roll, ")){
        const restParsed = effectParser(s.substring(s.indexOf(",") + 1).trim(), game, true);
        return logic.noTargetSyncEffect( passive.onYourEventEffect("on:attack:roll:failed", [restParsed.effectFunction], game, s));
    }
    if(s.startsWith("at any time the active player could purchase an item, ")){
        const restParsed = effectParser(s.substring(s.indexOf(",") + 1).trim().replaceAll("they", "you"), game, true);
        return logic.noTargetSyncEffect( passive.onAnyEventEffect("on:purchase:declared", [restParsed.effectFunction], game, s, (data: EffectData, event: OnPurchaseDeclaredData) => {return event.eventIssuer === game.currentPlayer}, true));
    }
    if (s.startsWith("each time you deal combat damage to a monster,")) {
        const restParsed = effectParser(s.substring(s.indexOf(",") + 1).trim(), game, true);
        return {
            effectFunction: passive.onYourEventEffect("on:combatdamage:dealt:to-monster", [restParsed.effectFunction], game, s),
            targetSelectors: restParsed.targetSelectors
        };
    }
    if (s.startsWith("each time you deal combat damage,")) {
        const restParsed = effectParser(s.substring(s.indexOf(",") + 1).trim(), game, true);
        return {
            effectFunction: passive.onYourEventEffect("on:combatdamage:dealt", [restParsed.effectFunction], game, s),
            targetSelectors: restParsed.targetSelectors
        };
    }
    if(s.startsWith("each time a player is killed by another player, ")){
        const restParsed = effectParser(s.substring(s.indexOf(",") + 1).trim(), game, true);
        return {
            effectFunction: passive.onAnyEventEffect("on:death:after-penalty", [restParsed.effectFunction], game, s, (ef: EffectData, ev: OnDeathBeforePenaltyData) => {
                if(ev.eventIssuer instanceof Player === false) return false;
                if(ev.source instanceof DiceRoll && ev.source.attackTarget instanceof Player === false) return false;
                return true;
            }, false),
            targetSelectors: []
        };
    }
    if(s.startsWith("each time you would deal damage to a monster or player, "))
    {
        const restParsed = effectParser(s.substring(s.indexOf(",") + 1).trim(), game, true);
        return {
            effectFunction: passive.onAnyEventEffect("on:damage:would-take", [restParsed.effectFunction], game, s, (data: EffectData, event: OnDamageWouldTakeData) => {
                data.targets = [];
                data.clearSelectionRecord();
                const shouldAddTarget = event.target === data.issuer && (event.eventIssuer instanceof Monster || event.eventIssuer instanceof Player);
                if(shouldAddTarget) {
                    data.addTarget(event.damageArray);
                    return true;
                }
                return false;
            }, false),
            targetSelectors: restParsed.targetSelectors
        };
    }
    if (s.startsWith("each time you deal damage,")) {
        const restParsed = effectParser(s.substring(s.indexOf(",") + 1).trim(), game, true);
        return {
            effectFunction: passive.onDamageYouDealtEffect([restParsed.effectFunction], game, s),
            targetSelectors: restParsed.targetSelectors
        };
    }
    if(s.startsWith("each time a player activates an item, they")){
        return logic.eachTimeActivateItemEffect(s, game);
    }
    if(s.startsWith("each time a player rolls the same result twice in a row on the same turn, ")){
        const news = s.substring(s.indexOf(",") + 1).trim();
        const restParsed = effectParser(news, game, true);
        return {
            effectFunction: passive.aPlayerRollSameResTwiceInRow([restParsed.effectFunction], game, s),
            targetSelectors: restParsed.targetSelectors
        };
    }
    if (s.startsWith("each time you die, before paying penalties, ")) {
        const restParsed = effectParser(s.substring(s.indexOf(",", s.indexOf(",")+1) + 1).trim(), game, true);
        return {
            effectFunction: passive.onYourEventEffect("on:death:before-penalty", [restParsed.effectFunction], game, s),
            targetSelectors: restParsed.targetSelectors
        };
    }
    if (s.startsWith("each time you die, after paying penalties, ")) {
        const restParsed = effectParser(s.substring(s.indexOf(",", s.indexOf(",")+1) + 1).trim(), game, true);
        return {
            effectFunction: passive.onYourEventEffect("on:death:after-penalty", [restParsed.effectFunction], game, s),
            targetSelectors: restParsed.targetSelectors
        };
    }
    if (s.startsWith("each time you die, ")) {
        const restParsed = effectParser(s.substring(s.indexOf(",") + 1).trim(), game, true);
        return {
            effectFunction: passive.onYourEventEffect("on:death:after-penalty", [restParsed.effectFunction], game, s),
            targetSelectors: restParsed.targetSelectors
        };
    }
    if (s.startsWith("each time this kills a player, ")) {
        const restParsed = effectParser(s.substring(s.indexOf(",") + 1).trim(), game, true);
        return {
            effectFunction: passive.onYourKillEffect([restParsed.effectFunction], game, s,
                (data: EffectData, event: OnDeathPenaltyData) => {
                    return event.eventIssuer instanceof Player;
                }

            ),
            targetSelectors: restParsed.targetSelectors
        };
    }
    if(s.startsWith("when the attacking player misses an attack roll, ")){
        const restParsed = effectParser(s.substring(s.indexOf(",") + 1).trim(), game, true);
        return {
            effectFunction: passive.onAnyEventEffect("on:attack:roll:failed", [restParsed.effectFunction], game, s,
                (data: EffectData, event: OnRollData) => {
                    return event.dice.attackData !== null && event.dice.attackData.target === data.it.entity;
                }
            ),
            targetSelectors: restParsed.targetSelectors
        };
    }
    if (s.startsWith("each time you kill a monster or player, ")) {
        const restParsed = effectParser(s.substring(s.indexOf(",") + 1).trim(), game, true);
        return {
            effectFunction: passive.onYourKillEffect([restParsed.effectFunction], game, s),
            targetSelectors: restParsed.targetSelectors
        };
    }
    if(s.startsWith("as your turn starts, "))
        s = "at the start of your turn " + s.substring("as your turn starts, ".length).trim();
    if (s.startsWith("at the start of your turn"))
        return logic.parseAtTheStartOfYourTurnEffect(s, game);
    if (s.startsWith("each time you activate an item, ")) {
        const restParsed = effectParser(s.substring(s.indexOf(",") + 1).trim(), game, true);
        return {
            effectFunction: passive.onYourEventEffect("on:item:activated", [restParsed.effectFunction], game, s),
            targetSelectors: restParsed.targetSelectors
        };
    }
    if (s.startsWith("when you would die, ") || s.startsWith("each time you would die, ")) {
        const restParsed = effectParser(s.substring(s.indexOf(",") + 1).trim(), game, true);
        return {
            effectFunction: passive.WouldDieYourTurnEffect([restParsed.effectFunction], game, s, false),
            targetSelectors: restParsed.targetSelectors
        };
    }
    if (s.startsWith("each time you declare an attack, before choosing what to attack, "))
        return logic.parseEachTimeDeclareAttackEffect(s.substring(s.indexOf(",") + 1).trim(), game);
    if (s.startsWith("each time you declare an attack, "))
        return logic.parseEachTimeDeclareAttackEffect(s, game);
    if(nr.startsWith("when this dies on an attack roll of x, "))
        return logic.parseWhenThisDiesOnAttackRoll(s, game, nr.nextNumber());
    if (s.startsWith("when this enters play"))
        return logic.syncParseWhenThisEntersPlay(s, game);
    if(s.startsWith("each time a monster dies, "))
    {
        const rest = s.substring("each time a monster dies, ".length).trim();
        const restParsed = effectParser(rest, game, true);
        return logic.noTargetSyncEffect(passive.onMonsterDeathEffect([restParsed.effectFunction], game, s));
    }
    if(s.startsWith("the first time you kill a monster on your turn, "))
        return logic.parseFirstKillMonsterTurnEffect(s, game);
    if (s.startsWith("the first time you would gain ¢ on each of your turns, ")) {
        const restParsed = effectParser(s.substring(s.indexOf(",") + 1).trim(), game, true);
        return {
            effectFunction: passive.interceptFirstGainCoinYourTurnEffect([restParsed.effectFunction], game, s),
            targetSelectors: restParsed.targetSelectors
        };
    }
    if (nr.startsWith("each time you deal combat damage to a monster on an attack roll of x, "))
    {
        const val = nr.nextNumber();
        return logic.noTargetSyncEffect(passive.onAnyEventEffect("on:damage:taken", [effectParser(s.substring(s.indexOf(",") + 1).trim(), game, true).effectFunction], game, s, 
            (data: EffectData, event: OnDamageTakenData) => {
                if(event.eventIssuer instanceof Monster === false) return false;
                if(event.target !== data.issuer) return false;
                if(event.source instanceof DiceRoll === false) return false;
                if(event.source.value !== val) return false;
                return true;
            }, false
        ))
    }
    if (s.startsWith("each time a monster or player dies, "))
        return logic.noTargetSyncEffect(passive.onAnyEventEffect("on:death:before-penalty", [effectParser(s.substring(s.indexOf(",") + 1).trim(), game, true).effectFunction], game, s, 
            (ef: EffectData, ev: OnDeathBeforePenaltyData) => {return ev.eventIssuer instanceof Monster || ev.eventIssuer instanceof Player;}));
    if (s.startsWith("each time another player dies, "))
        return logic.parseEachTimeAnotherPlayerDiesEffect(s, game);
    if(s.startsWith("each time you kill a monster, "))
        return logic.parseEachTimeYouKillSpecificTypeEffect(s, game, "monster");
    if(s.startsWith("each time you kill a player, "))
        return logic.parseEachTimeYouKillSpecificTypeEffect(s, game, "player");
    if (s.startsWith("each time a player would roll a ") && !s.includes(" or "))
        return logic.parseEachTimeWouldRollEffect(s, game);
    if(s.startsWith("as your turn ends, "))
        s = "at the end of your turn, " + s.substring("as your turn ends, ".length).trim();
    if (s.startsWith("at the end of your turn, "))
        return logic.parseAtTheEndOfYourTurnEffect(s, game);
    if (s.startsWith("at the end of the turn this was played, "))
        return logic.parseAtTheEndOfTheTurnItWasPlayedEffect(s, game, true);
    if (s.startsWith("at the end of the turn, "))
        return logic.parseAtTheEndOfTheTurnItWasPlayedEffect(s, game, false);
    if (s.startsWith("at the end of each turn, "))
        return logic.parseAtTheEndOfEachTurnEffect(s, game);
    if (s.startsWith("when you gain or purchase this, "))
        return logic.ParseWhenGainOrPurchaseThis(s, game);
    if(s.startsWith("while you control another item or soul named cube of meat or ultra flesh kid, "))
    {
        const restOfString = s.substring(s.indexOf(",") + 1).trim();
        const robustString = new NumberRobustString(restOfString);
        const restOfEffect = syncEffectParser(restOfString, game, robustString, selectionOnResolve, youMayEffectHanging);
        if(restOfEffect === null)
            throw new Error(`Failed to parse effect after "while you control another item or soul named cube of meat or ultra flesh kid," in string: ${s}`);
        return logic.noTargetSyncEffect(passive.ConditionalEffect([restOfEffect.effectFunction], 
            (player: Player) => {
                return player.inPlay.filter(item => item.name === "Cube Of Meat" || item.name === "Ultra Flesh Kid!").length >= 2
            }, ["on:enter:play:after", "on:item:destroyed"], game, false));
    }    
    if (s.startsWith("when this dies, ") && !s.includes("killed")) // effects that include "killed" refers to the killer and need to be handled differently.
        return logic.parseWhenThisDiesEffect(s, game);
    if (s.startsWith("when the active player rolls a"))
        return logic.parseWhenActivePlayerRollsEffect(s, game, nr);
    if (s.startsWith("each time a player rolls a "))
        return logic.parseEachTimeRollEffect(s, game, nr);
    if(s.startsWith("each time the attacking player rolls an attack roll of "))
        return logic.parseEachTimeRollEffect(s, game, nr);
    if (s.startsWith("each time you take damage, "))
        return logic.parseOnDamageTakenEffect(s, game);
    if(s.startsWith("each time this takes damage, "))
        return logic.parseOnDamageTakenEffect(s, game);
    if(s.startsWith("each time a monster takes damage, "))
        return logic.noTargetSyncEffect(passive.onAnyEventEffect("on:damage:taken", [effectParser(s.substring(s.indexOf(",") + 1).trim(), game, true).effectFunction], game, s,
            (ef: EffectData, ev: OnDamageTakenData) => {
                return ev.eventIssuer instanceof Monster;
            }));
    if(s.startsWith("when an attack is declared on this, "))
        return logic.noTargetSyncEffect(monster.onAttackDeclaredEffect(game, s));
    if(s.startsWith("when this is put into a monster slot, "))
        return logic.parseWhenThisEntersMonsterSlotEffect(s, game);
    if(s.startsWith("each time you gain or are given a soul, "))
        return logic.noTargetSyncEffect(passive.onYourEventEffect("on:soul:gained", [effectParser(s.substring(s.indexOf(",") + 1).trim(), game, true).effectFunction], game, s));
    if(nr.masked.startsWith("each time this deals damage to a player, they"))
    {
        const restParsed = effectParser(s.substring(s.indexOf(",") + 1).trim(), game, true);
        return logic.noTargetSyncEffect(passive.onAnyEventEffect("on:damage:taken", [restParsed.effectFunction], game, s, 
            (ef: EffectData, ev: OnDamageTakenData) => {
                if(ev.target.card === ef.it) {
                    ef.addTarget(ev.eventIssuer);
                    return true;
                }
                return false;
            }));
    }
    if(nr.masked.startsWith("each time the attacking player misses an attack roll,"))
    {
        const restParsed = effectParser(s.substring(s.indexOf(",") + 1).trim(), game, true);
        return logic.noTargetSyncEffect(passive.onAnyEventEffect("on:damage:taken", [restParsed.effectFunction], game, s, 
            (ef: EffectData, ev: OnDamageTakenData) => {
                if(ev.source instanceof DiceRoll === false) return false;
                if(ev.target instanceof Player === false) return false;
                if(ev.target.isEngagedInCombat) return false;
                if(ev.source.card !== ef.it) return false;
                return true;
            }));
    }
    if(nr.masked.startsWith("[lvx effect]"))
        return logic.parseLvXEffect(s, game, nr);
    if (nr.masked.startsWith("when this reaches x [hp] , ")) {
        const restParsed = effectParser(s.substring(s.indexOf(",") + 1).trim(), game, true);
        return logic.noTargetSyncEffect(monster.whenThisReachesXHP(game, nr.nextNumber(), [restParsed.effectFunction], s))
    }
    if(nr.masked.startsWith("when the xth counter is put on this, ") ||
        nr.masked.startsWith("when the xnd counter is put on this, ") ||
        nr.masked.startsWith("when the xrd counter is put on this, ") ||
        nr.masked.startsWith("when the xst counter is put on this, "))
        {
            const nbCounters = nr.nextNumber();
            const restString = s.substring("when the xnd counter is put on this, ".length).trim();
            return logic.noTargetSyncEffect(passive.onAnyEventEffect("on:counter:modified", [effectParser(restString, game, true).effectFunction], game, s, (effect: EffectData, event: OnCounterModifiedData) => { return effect.it === event.receiver && event.newValue === nbCounters && event.previousValue < nbCounters }));
        }
    if(s.startsWith("this takes no combat damage on attack rolls of") || s.startsWith("you take no combat damage on attack rolls of"))
    {
        const numbers = nr.numbers;
        return logic.noTargetSyncEffect(monster.noCombatDamageOnAttackRollEffect(game, numbers));
    }
    if(nr.masked.startsWith("each time you take combat damage from a monster or player on an attack roll of x, "))
        return logic.noTargetSyncEffect(monster.onYouTakeCombatDamageEffect(game, s, [nr.nextNumber()]));
    if(nr.masked.startsWith("till end of turn, each time a player rolls an attack roll of x or x, "))
        return logic.noTargetSyncEffect(logic.tillEndTurnOnAttackRoll(game, s, [nr.nextNumber(), nr.nextNumber()]));
    if(nr.masked.startsWith("each time you roll an attack roll of x, "))
    {
        const rollValue = nr.nextNumber();
        const restParsed = effectParser(s.substring(s.indexOf(",") + 1).trim(), game, true);
        return logic.noTargetSyncEffect(passive.onAttackRollEffect([rollValue], restParsed.effectFunction, game, "on:attack:roll"))
    }
    if(nr.masked.startsWith("each time this takes combat damage on an attack roll of x, "))
        return logic.noTargetSyncEffect(monster.onThisTakesCombatDamageEffect(game, s, [nr.nextNumber()]));
    if(s.startsWith("while this is at"))
        return logic.noTargetSyncEffect(monster.statModifierWhileAtHealthEffect(game, s));
    if(s.startsWith("each time this deals combat damage to a player, they "))
        return logic.noTargetSyncEffect(monster.OnDealsCombatDamageEffect(game, s));
    if(s.startsWith("combat damage this deals is "))
        return logic.noTargetSyncEffect(monster.combatDamageIsEffect(game, s));
    if(s.startsWith("each time this deals damage, ") ||
        s.startsWith("each time this deals combat damage, ")) 
            return logic.noTargetSyncEffect(monster.OnDealsDamageEffect(game, s));
    if(s.startsWith("each time this takes combat damage, "))
        return logic.noTargetSyncEffect(monster.onThisTakesCombatDamageEffect(game, s));
    if(s.startsWith("each time the attacking player activates an item, they "))
            return logic.noTargetSyncEffect(monster.onAttackingPlayerActivatesItemEffect(game, s));
    if(s.startsWith("when the attacking player rolls an attack roll of "))
            return logic.noTargetSyncEffect(monster.onAttackingPlayerRollsEffect(game, s));
    if(s.startsWith("each time you declare a purchase, before choosing what to purchase ,"))
    {
        const restParsed = effectParser(s.substring("each time you declare a purchase, before choosing what to purchase ,".length).trim(), game, true);
        return {effectFunction: passive.onYourEventEffect("on:purchase:declared", [restParsed.effectFunction], game, s), targetSelectors: []};
    }
    if(s.includes("while you control this soul, "))
        return logic.parseWhileYouControlThisSoulEffect(s, game);
    return null;
}

/** 
 * Effects that start with a key expression (e.g., "you may", "they", "choose one", "kill") are parsed here.
 * These are effects that require specific handling (e.g., "you may", "they"), or that can be easily identified by their first words (e.g., "choose one", "kill"). 
 * */
function parseStartWithKeyExpressionEffect(s: string, game: Game, nr: NumberRobustString, selectionOnResolve: boolean, youMayEffectHanging: boolean[]): ParsedEffect | null {
if (s.startsWith("you may") &&
    // exceptions where "you may" is not a choice, but an extra action.
    // Otherwise after you may is parsed as "if you choose not to exerce the you may effect". It is currently only used in card Playdough Cookie.
        !s.startsWith("you may put") &&
        !s.startsWith("you may purchase") && 
        !s.startsWith("you may play") && 
        !s.startsWith("you may attack") && 
        !s.includes("otherwise, ") && 
        s !== "you may look at the top card of the treasure deck at any time on your turn."
        )
        return logic.parseYouMayEffect(s, game);
    if(s.startsWith("this becomes an item with") || s.startsWith("it becomes an item with"))
        return logic.parseThisBecomesAnItemEffect(s, game);
    if (s.startsWith("choose another player.")){
        const restParsed = effectParser(s.substring("Choose another player.".length).trim(), game, true);
        return {effectFunction: active.combineEffectFunctions(
                [active.chooseOneOfListEffect(game, selectAnotherPlayer(game)[0]!, selectionOnResolve), restParsed.effectFunction]),
                 targetSelectors: [...selectAnotherPlayer(game), ...restParsed.targetSelectors]};
    }
    if(s.startsWith("[curse] "))
        return logic.parseCurseEffect(s.substring(8).trim(), game);
    if(s.startsWith("they") && s.includes("you") === false)
        return logic.parseTheyEffect(s, game);
    if (s.startsWith("choose one-"))
        return active.chooseOneEffect(s, game, selectionOnResolve);
    if (s.startsWith("roll-"))
        return parseRollEffect(s, nr, game);
    if (nr.masked.startsWith("destroy x items you control")) {
        const nbItems = nr.nextNumber();
        return { effectFunction: active.destroyXItemsEffect(game, nbItems), targetSelectors: selectNonEternalItemYouControl(game, nbItems) };
    }
    if(nr.masked.startsWith("roll x times"))
    {
        const numberOfRolls = nr.nextNumber();
        const restTxt = "roll-" + s.substring(`roll x times`.length);
        const restEffect = parseRollEffect(restTxt, nr, game);
        const effect: EffectFunction = async (data:EffectData) => {
            const discardedLoot = data.targets[0];
            data.targets = []; // clear targets to avoid confusion for the restEffect, which shouldn't care about the discarded loot
            for(let i = 0; i < numberOfRolls; i++){
                await restEffect.effectFunction(data);
            }
            data.targets = [discardedLoot];
            return true;
        }
        return logic.noTargetEffect(effect);
    }
    if(s.startsWith(`roll. if the discarded card had \"`))
    {
        const word = s.split(`\"`)[1]!;
        const restTxt = "roll-" + s.substring(`roll. if the discarded card had \"${word}\" in its name, roll 3x instead-`.length);
        const restEffect = parseRollEffect(restTxt, nr, game);
        const effect: EffectFunction = async (data:EffectData) => {
            const discardedLoot = data.targets[0];
            data.targets = []; // clear targets to avoid confusion for the restEffect, which shouldn't care about the discarded loot
            if(!(discardedLoot instanceof LootCard))
                throw new GameError("Expected a loot card to be discarded.", toSerializedTranslation("error.expectedLootCardToBeDiscarded"));
            for(let i = 0; i < (discardedLoot.slug.includes(word) ? 3 : 1); i++){
                await restEffect.effectFunction(data);
            }
            data.targets = [discardedLoot];
            return true;
        }
        return logic.noTargetEffect(effect);
    }
    if(s.startsWith(`roll.\nif the discarded card was named pills`))
    {
        const restTxt = "roll-" + s.substring(`roll.\nif the discarded card was named pills, roll 3x instead-`.length);
        const restEffect = parseRollEffect(restTxt, nr, game);
        const effect: EffectFunction = async (data:EffectData) => {
            const discardedLoot = data.targets[0];
            data.targets = []; // clear targets to avoid confusion for the restEffect, which shouldn't care about the discarded loot
            if(!(discardedLoot instanceof LootCard))
                throw new GameError("Expected a loot card to be discarded.", toSerializedTranslation("error.expectedLootCardToBeDiscarded"));
            for(let i = 0; i < (discardedLoot.slug.includes("pills") ? 3 : 1); i++){
                await restEffect.effectFunction(data);
            }
            data.targets = [discardedLoot];
            return true;
        }
        return logic.noTargetEffect(effect);
    }
    if (s.startsWith("kill ") && !s.includes("kill a monster named") && !s.includes("kill all ")) {
        const selector = decideEntitySelector(s, game);
        return { effectFunction: active.killTargetEffect(game, selector, selectionOnResolve), targetSelectors: selector };
    }
    // If there is an if you do, it must trigger first.
    if (s.startsWith("destroy this.") && !s.includes("if you do, ")) {
        const restParsed = effectParser(s.substring("destroy this.".length).trim(), game, selectionOnResolve, youMayEffectHanging);
        return {
            effectFunction: async (data:EffectData): Promise<boolean> => { 
                const destroyResult = game.cardHandler.destroyCardsOrSouls([data.it]); 
                if (s.substring("destroy this.".length).trim() === ".")
                    return destroyResult;
                if(destroyResult)
                    return restParsed.effectFunction(data);
                return false;
            },
            targetSelectors: restParsed.targetSelectors
        };
    }
    if(s.startsWith("the active player ") || s.startsWith("the first time the active player"))
        return parseTheActivePlayerEffect(s, game, nr);
    return null;

}

/**
 * Effects that exists for multiple words, in particular variable deck names (e.g., "look at the top x card of the treasure deck") are parsed here.
 */
function parseVariableDeckNameEffect(s: string, game: Game, nr: NumberRobustString, selectionOnResolve: boolean, youMayEffectHanging: boolean[]): ParsedEffect | null {
    function parseText(text: string, re: RegExp): string {
        const m = text.trim().match(re);
        return m ? m[1]! : "";
    }
    const shuffleDeck =  parseText(s, /^shuffle the (\w+) deck\.$/u);
    if (shuffleDeck !== "")
        return logic.noTargetEffect(active.shuffleDeckEffect(game, shuffleDeck));
    const deckTopCard =  parseText(s, /^look at the top card of the (\w+) deck\.?,? you may put it on the bottom\.$/u);
    if (deckTopCard !== "")
        return logic.noTargetEffect(active.LookAndPutBottomEffect(deckTopCard, game));
    const exactCardTxt =  parseText(s, /^put a card named (.+) from the loot discard into your hand\.$/u);
    if (exactCardTxt !== "")
        return logic.noTargetEffect(active.getCardFromLootDiscardEffect(exactCardTxt, game, true));
    const cardTxt = parseText(s, /^put a card with "(\w+)" in its name from the loot discard into your hand\.$/u);
    if (cardTxt !== "")
        return logic.noTargetEffect(active.getCardFromLootDiscardEffect(cardTxt, game, false));
    const deckName = parseText(s, /^look at the top \d+ cards of the (\w+) deck\. put \d+ on top and the rest on the bottom\./u);
    if (deckName !== "")
        return logic.noTargetEffect(active.lookXPutYTopRestBottomEffect(deckName, game, nr.nextNumber(), nr.nextNumber()));
    let deckName1 = parseText(s, /^look at the top \d+ cards of the (\w+) deck\. you may put them back in any order\.?$/u);
    if (deckName1 === "")
        deckName1 = parseText(s, /^look at the top \d+ cards of the (\w+) deck\. put them back in any order\.?$/u);
    if (deckName1 !== "")
        return logic.noTargetEffect(active.lookAndOrderEffect(deckName1, nr.nextNumber(), game));
    const slot = parseText(s, /^expands? (\w+)s? slots by \d+\.?$/u)
    if (slot !== "")
        return logic.noTargetEffect(active.expandSlotsEffect(slot, nr.nextNumber(), game));
    return null;
}

/**
 * Parses roll effects, which have a specific syntax and often include multiple effects based on the roll result.
 * Unless other functions returning ParsedEffect, this one includes a text switch, that is why it is kept in this file rather than logicParsers.ts.
 */
export function parseRollEffect(s: string, nr: NumberRobustString, game: Game, issuerIsCurrentPlayer: boolean = false): SyncParsedEffect {
    switch (nr.masked){
        case "roll-\ndeal damage to them equal to the result.":
            return active.dealRollDamageEffect(s, game);
        case "roll-\nthey take damage equal to the result.":
            return active.dealRollDamageEffect(s, game);
        case "roll-\nyou may change the result of your next roll this turn to this result.":
            return passive.rollAndMayChangeNextRollForThis(game);
        case "roll-\nif the roll is less than the number of counters on this, destroy it and all other items you control.":
            return active.rollAndDestroyIfLessThanCounters(game);
        case "roll-\ngain x¢, where x is x times the result.":
            return active.rollAndGainXTimesResultEffect(game, nr.nextNumber());
        case "roll-\nx or x: put this on top of the monster deck.":
            return { effectFunction: active.putOnTopOfMonsterDeckOnRollEffect(game, nr.numbers.slice()), targetSelectors: [] };
        }
    let effects: EffectFunction[] = [];
    switch(nr.masked){
        case "roll-\nthat player gains ¢ equal to the result.":
            effects = active.targetGetCoinRollEffect(game);
    }
    if(effects.length === 0){
        const rollResults = active.obtainRollResults(s);
        const parsedEffects: ParsedEffect[] = rollResults.map(effectText => effectParser(effectText, game, true));
        effects = parsedEffects.map(p => p.effectFunction);
    }
    return {
        effectFunction: (data: EffectData): boolean => {
            const issuer = issuerIsCurrentPlayer ? game.currentPlayer : data.issuer;
            if (issuer instanceof Player === false) return false;
            const result = game.rollDice(issuer, data.it);
            result.attachEffect(effects, data.it, data.targets, data.issuer);
            return true;
        },
        targetSelectors: [] // roll has special target handling based on the roll result
    };
}

/**
 * Active player effects are parsed separately, as they are usually owned by monsters, and refers to players differently (third-person singular).
 * Unless other functions returning ParsedEffect, this one includes a text switch, that is why it is kept in this file rather than logicParsers.ts.
 */
export function parseTheActivePlayerSyncEffect(s: string, game: Game, nr: NumberRobustString): SyncParsedEffect | null {
    if(s.startsWith("the active player rolls-"))
    {
        const rest = "roll" + s.substring("the active player rolls".length).replace("they", "the active player");
        const numberRobustString = new NumberRobustString(rest);
        return parseRollEffect(rest, numberRobustString , game, true);
    }
    switch (nr.normalizedMasked) {
        case "the active player may attack other players. attacked players have x+ [dc]":
            return logic.noTargetSyncEffect(room.otherPlayersAreAttackableEffect(game, nr.nextNumber()));
        case "the active player must attack the monster deck x times this turn":
            return logic.noTargetSyncEffect(active.forceAttackMonsterDeckEffect(game, nr.nextNumber(), "total")); 
        case "the active player must make an additional attack on the monster deck":
            return logic.noTargetSyncEffect(active.forceAttackMonsterDeckEffect(game, 1, "additional")); 
        case "the active player gains x¢":
            return logic.noTargetSyncEffect(active.gainCoinsEffect(game, nr.nextNumber(), "current", [false]));
        case "the active player loots x during their loot step":
            const nb = nr.nextNumber();
            return logic.noTargetSyncEffect(passive.onAnyEventEffect("on:loot:step", [], game, s, (effect: EffectData, event: OnLootStepData) => {event.lootStep.nbLoots += nb; return true;}));
                // passive.lootStepEffect([active.lootCardsEffect(game, nr.nextNumber())], game, true));
        case "the active player loots x":
            return logic.noTargetSyncEffect(active.lootCardsEffect(game, nr.nextNumber(), "current"));
        case "the active player takes an extra turn after this one":
            return logic.noTargetSyncEffect(active.takeExtraTurnEffect(game, false, "current"));
        case "the active player deactivates their character":
            return logic.noTargetSyncEffect(room.deactivateCharacterEffect(game));
        case "the active player rerolls each item they control":
            return logic.noTargetSyncEffect(active.rerollEachItemEffect(game, "currentPlayer"));
        case "the active player may attack an additional time this turn":
            return logic.noTargetSyncEffect(passive.temporaryStatModifierEffect([game.entityHandler.addAttackThisTurn.bind(game.entityHandler)], 1, game, "current"));
        case "the active player must attack this once each turn if able":
            return logic.noTargetSyncEffect(monster.forceAttackThisEachTurnEffect(game));
        case "the active player takes an extra turn after this one":
            return logic.noTargetSyncEffect(active.takeExtraTurnEffect(game, false, "current"));
        case "the active player must attack the monster deck once each turn if able":
            return logic.noTargetSyncEffect(room.activePlayerMustAttackTopDeck(game));
        case "the active player must attack each turn if able":
        case "the first time the active player declares an attack each turn, they must attack an additional time this turn":
            return logic.noTargetSyncEffect(room.activePlayerMustAttackAdditionalTimeEffect(game));
        case "the active player may attack the monster deck any number of times till end of turn":
            return logic.noTargetSyncEffect(monster.activePlayerMayAttackMonsterDeckEffect(game, INFINITY));
        case "the active player may attack the monster deck an additional time":
            return logic.noTargetSyncEffect(monster.activePlayerMayAttackMonsterDeckEffect(game, 1));
        case "the active player must make an additional attack":
        case "the active player must make an additional attack this turn":
            return logic.noTargetSyncEffect(monster.activePlayerMustMakeAdditionalAttackEffect(game));
        case "the active player recharges each item they control":
            return logic.noTargetSyncEffect(active.rechargeEachItemsOfTargetEffect(game, "current"));
        default:
            return null;
    }
}
/**
 * Active player effects are parsed separately, as they are usually owned by monsters, and refers to players differently (third-person singular).
 * Unless other functions returning ParsedEffect, this one includes a text switch, that is why it is kept in this file rather than logicParsers.ts.
 */
export function parseTheActivePlayerEffect(s: string, game: Game, nr: NumberRobustString): ParsedEffect {
    const res = parseTheActivePlayerSyncEffect(s, game, nr);
    if(res !== null)
        return res;
    switch (nr.normalizedMasked) {
        case "the active player forces a player to discard x loot cards":
            return logic.noTargetEffect(monster.activePlayerSelectAndCallEffect(game, active.discardNLootCardsEffect(nr.nextNumber(), game, true)));
        case "the active player chooses a player. they lose x¢":
            return logic.noTargetEffect(monster.activePlayerSelectAndCallEffect(game, active.loseCoinsEffect(game, nr.nextNumber())));
        case "the active player deals x damage to a player":
            return logic.noTargetEffect(active.dealDamageToAPlayerEffect(game, nr.nextNumber(), true, true));
        case "the active player deals x damage divided as they choose to any number of monsters or players":
            return logic.noTargetEffect(monster.activePlayerSelectTargetEffect(game, active.dealXDamageDividedAsYouChooseEffect(game, nr.nextNumber()), selectPlayerOrMonster(game, 1, 2)[0]!));
        case "the active player deals x damage divided as they choose to any number of players, where x is the number of spider counters on this":
            return logic.noTargetEffect(active.dealDamageDividedAsTheyChooseForEachCounterEffect(game, "spider"));
        case "the active player chooses a player. that player discards x loot cards":
            return logic.noTargetEffect(monster.activePlayerChoosePlayerDiscardXEffect(game, nr.nextNumber()));
        case "the active player chooses a living player. this deals x damage to that player":
            return logic.noTargetEffect(monster.activePlayerChooseLivingPlayerTakeDamageEffect(game, nr.nextNumber()));
        case "the active player discards a loot card":
            return logic.noTargetEffect(active.discardNLootCardsEffect(1, game, true, "current"));
        case "the active player discards x loot cards":
            return logic.noTargetEffect(active.discardNLootCardsEffect(nr.nextNumber(), game, true, "current"));
        case "the active player may gain x¢":
            return logic.noTargetEffect(active.gainCoinsEffect(game, nr.nextNumber(), "current", [true]));
        case "the active player loses x¢":
            return logic.noTargetSyncEffect(room.activePlayerLoseCoinsEffect(game, nr.nextNumber()));
        case "the active player kills up to x other players":
            return logic.noTargetEffect(active.activeKillsUpToXOtherPlayersEffect(game, nr.nextNumber()));
        case "the active player chooses another player. that player takes x damage":
            return logic.noTargetEffect(active.dealDamageToTargetEffect(game, nr.nextNumber(), true, selectAnotherPlayer(game, 1), "current"));
        case "the active player chooses another player. that player must make an attack roll against this after each attack roll the active player makes this attack. if this dies this turn, that player gains x treasure":
            return logic.noTargetEffect(active.activePlayerChoosePlayerMustAttackThisAfterEachAttackRollEffect(game, nr.nextNumber()));
        case "the active player kills a player":
            return logic.noTargetEffect(active.killTargetEffect(game, decideEntitySelector(s, game), true, true));
        case "the active player skips their next turn":
            return logic.noTargetEffect(active.issuerSkipNextTurnEffect(game, true));
        case "the active player may steal a non-eternal item another player controls":
            return logic.noTargetEffect(monster.activePlayerSelectTargetEffect(game, active.stealNonEternalItemEffect(game), selectAnotherPlayerNonEternalItem(game, 0, 1)[0]!));
        case "the active player may look at a player's hand":
            return logic.noTargetEffect(monster.activePlayerSelectTargetEffect(game, active.lookAtAPlayerHand(game), selectPlayer(game, 0, 1)[0]!, false));
        case "the active player may choose another player. they give you a soul they control":
            return logic.noTargetEffect(monster.activePlayerSelectAndCallEffect(game, active.giveSoulEffect(game), true, true, true));
        case "the active player chooses a player. that player destroys a soul they control":
            return logic.noTargetEffect(monster.activePlayerSelectAndCallEffect(game, active.destroyOneOfYourSoulEffect(game)));
        case "the active player rerolls a shop item, then deals x damage to a player chosen at random":
            return logic.noTargetEffect(active.combineEffectFunctions([logic.noTargetEffect(active.rerollAShopItemEffect(game)).effectFunction, logic.noTargetSyncEffect(active.dealDamageToRandomPlayerEffect(game, nr.nextNumber(), "any", "current")).effectFunction]));
        case "the active player chooses another player. if this would die this turn, instead cancel an attack against this. the chosen player dies, this heals to full [hp] , then the active player loots x":
            return logic.noTargetEffect(active.activePlayerChoosePlayerIfThisWouldDieEffect(game, nr.nextNumber()));


        default:
            throw new GameError(`Could not parse 'The active player ...' effect: ${s}`, toSerializedTranslation("error.parsingError", {error: `Could not parse 'The active player ...' effect: ${s}`}));
    }
}



/**
 * Parse standard string-matched effects that don't require special handling.
 * Returns null if no match is found.
 * Returns a complete ParsedEffect with inline target selectors.
 * 
 * Most effects are parsed here, using a massive switch statement. 
 * This is the default parsing function, that is used if no trigger or key expression is matched.
 * It includes simple effects (e.g. gain x¢) but also complex triggered effect that were not fit to be integrated in the triggered effect parsing function (e.g. "when the active player rolls a x, ").
 */
function parseStandardEffect(s: string, game: Game, nr: NumberRobustString, selectionOnResolve: boolean, youMayEffectHanging: boolean[]): ParsedEffect | null {
    const syncStandardEffect = parseStandardSyncEffect(s, game, nr, selectionOnResolve, youMayEffectHanging);
    if(syncStandardEffect !== null)
        return syncStandardEffect;
    const asyncStandardEffect = parseStandardASyncEffect(s, game, nr, selectionOnResolve, youMayEffectHanging);
    if(asyncStandardEffect !== null)
        return asyncStandardEffect;
    return null;
    }

function parseStandardASyncEffect(s: string, game: Game, nr: NumberRobustString, selectionOnResolve: boolean, youMayEffectHanging: boolean[]): ParsedEffect | null {
    // Number-robust parsing for standard effects.
    // Keep this limited to cases where the extracted number(s) are actually used by the returned effect.
    switch (nr.normalizedMasked) {
        case "force a player to discard x loot card":
        case "force a player to discard x loot cards":
            return { effectFunction: active.discardNLootCardsEffect(nr.nextNumber(), game, true, "next"), targetSelectors: selectPlayer(game) };
        case "discard a loot card":
            return logic.noTargetEffect(active.discardNLootCardsEffect(1, game, true));
        case "deal x damage divided as you choose to any number of monsters or players, where x is the number of loot cards discarded to play this":
            return logic.noTargetEffect(active.dealPaidXDamageDividedAsYouChooseEffect(game));
        case "discard x loot card":
        case "you discard x loot cards":
        case "discard x loot cards": {
            const toDiscard = nr.nextNumber();
            return logic.noTargetEffect(active.discardNLootCardsEffect(toDiscard, game, true));
        }
        case "reveal the top x cards of the monster deck. give any curse cards revealed to the player or players of your choosing. put the rest on the bottom of the deck in any order":
            return logic.noTargetEffect(active.revealTopCardsOfMonsterDeckEffect(game, nr.nextNumber()));
        case "look at the top x cards of a deck. put them back in any order":
        case "look at the top x cards of a deck and put them back in any order":
            return logic.noTargetEffect(active.lookAndReorderTopCardsEffect(game, nr.nextNumber(), "selectOnResolve", "dataIssuer"));
        case "give another player a loot card":
            return logic.noTargetEffect(active.giveLootCardToAnotherPlayerEffect(game));
        case "put a gold counter on another non-eternal item you control":
            return logic.noTargetEffect(passive.giveCounterToAnotherItemOnEnterPlayEffect(game, "golden"));
        case "then if this has x+ counters, remove all counters from this and deal x damage to a player or monster":
            return logic.noTargetEffect(active.removeCounterAndDamageIfAboveX(game, nr.nextNumber(), nr.nextNumber()));
        case "change a number in the effect text of a card in play or loot being played by x till end of turn. the number can't go below x or above x":
            return { effectFunction: active.changeNumberInEffectTextEffect(game, nr.nextNumber(), nr.nextNumber(), nr.nextNumber()), targetSelectors: selectCardInPlayOrLootBeingPlayed(game) };
        case "choose a shop item. other players may bid ¢ for it, starting at x or more ¢. in turn order, other players may top the high bid. bidding ends when the high bid stands. the high bidder pays you the number of ¢ they bid and steals the chosen item":
            return { effectFunction: active.shopItemAuctionEffect(game, nr.nextNumber()), targetSelectors: selectShopItem(game) };
        case "choose a player. you must make an additional attack against them. they have x+ [dc] for the attack.\nwhen that player dies this turn, they give the active player the item they would destroy for the death penalty":
            return logic.noTargetEffect(passive.extraAttackAndDeathTriggerEffect(game, nr.nextNumber()));
        case "choose a dice roll. its controller rerolls it, but rolls x dice instead. they choose another player. that player chooses one of the rolls as the result":
            return { effectFunction: active.rerollDiceRollXEffect(game, nr.nextNumber()), targetSelectors: selectRoll(game) };
        case "deal x damage to another monster or player": 
            // It is used in "Each time you deal combat damage, deal x damage to another monster or player."
            // "another monster or player." is handled as "not engaged in combat monster or player, or yourself."
            return logic.noTargetEffect(active.dealDamageNotEngagedInCombatEffect(game, nr.nextNumber(), "aPlayerOrMonster"));
        case "deal x damage to each other monster":
            // It is used in "Each time you deal combat damage, deal x damage to each other monster."
            // "each other monster." is handled as "not engaged in combat monster or player, or yourself."
            return logic.noTargetEffect(active.dealDamageNotEngagedInCombatEffect(game, nr.nextNumber(), "eachMonster"));
        case "then put x card from your hand on top of the loot deck":
            return logic.noTargetEffect(active.putXCardFromYourHandOnTopOfLootDeck(game, nr.nextNumber()));
        case "recharge up to x character":
            return logic.noTargetEffect(active.rechargeUpToXChara(game, nr.nextNumber()));
        case "choose a non-eternal item. put a counter on that item or remove one from it":
            return { effectFunction: active.addOrRemoveCounterOnCardEffect(game, 1, "any", "selectionOnResolve", youMayEffectHanging, selectNonEternalItemFromAnywhere(game)), targetSelectors: selectNonEternalItemFromAnywhere(game) };
        case "choose a non-eternal card in play. put a counter on it of a type already on it or remove a counter from it":
            return { effectFunction: active.addOrRemoveCounterOnCardEffect(game, 1, "alreadyOnIt", "next", youMayEffectHanging), targetSelectors: selectNonEternalItem(game) };
        case "put a card from your hand on top of the loot deck":
        case "put a loot card from your hand on top of the loot deck":
            return logic.noTargetEffect(active.putXCardFromYourHandOnTopOfLootDeck(game, 1));
        case "put a room or monster not being attacked into discard":
            return logic.noTargetEffect(active.putRoomOrMonsterIntoDiscardEffect(game, false));
        case "look at the top x cards of the loot deck. put one in your hand and put the rest in another player's hand":
            return logic.noTargetEffect(active.lookAtTopXPut1InYourHandRestInAnotherPlayerHandEffect(game, nr.nextNumber()));
        case "you may put a room or monster not being attacked into discard":
            return logic.noTargetEffect(active.putRoomOrMonsterIntoDiscardEffect(game, true));
        case "choose a monster being attacked. heal that monster to full [hp] , then deal damage equal to the number of [hp] healed in this way to another monster. if it's not your turn, cancel the attack and the active player may make an additional attack this turn":
            return {effectFunction: active.healMonsterThenDamageAnotherEffect(game), targetSelectors: selectMonsterBeingAttacked(game) };
        case "then put x cards from your hand on top of the loot deck in any order":
            return logic.noTargetEffect(active.putXCardFromYourHandOnTopOfLootDeck(game, nr.nextNumber()));
        case "reveal cards from the top of the monster deck till you reveal x boss cards. put them in one or more monster slots not being attacked and the rest into discard. the active player must make an additional attack on one of them this turn":
            return logic.noTargetEffect(monster.bossRushEffect(game, nr.nextNumber()));
        case "look at the top x cards of a deck and put them back in any order":
            return logic.noTargetEffect(active.lookAndReorderTopCardsEffect(game, nr.nextNumber(), "selectOnResolve", "dataIssuer"));
        case "put each shop item or each monster not being attacked into discard":
            return logic.noTargetEffect(active.flushShopOrUnattackedMonstersEffect(game));
        case "choose a monster. it gains -x [dc] , till end of turn":
            return logic.noTargetEffect(passive.temporaryStatModifierEffect([game.entityHandler.addDC.bind(game.entityHandler)], -nr.nextNumber(), game, "selectionOnResolve", selectMonster(game, 1, 1)[0]!));
        case "deal x damage to a monster or player":
        case "deal x damage to a player":
        case "deal x damage to a monster":
            return { effectFunction: active.dealDamageToTargetEffect(game, nr.nextNumber(), selectionOnResolve, decideEntitySelector(s, game), "issuer"), targetSelectors: decideEntitySelector(s, game) };
        case "deal x damage to another player":
            return { effectFunction: active.dealDamageToAPlayerEffect(game, nr.nextNumber(), false), targetSelectors: selectAnotherPlayer(game) };
        case "remove half the counters from this rounded down":
            return logic.noTargetEffect(active.removeHalfCountersEffect(game));
        case "if the active player played a loot card this turn, this deals x damage to them":
            return logic.noTargetEffect(active.ifActivePlayedLootCardDealDmg(game, nr.nextNumber()));
        case "deal x damage to them":
            return logic.noTargetEffect(active.dealDamageToTargetEffect(game, nr.nextNumber(), false, [], "issuer"));
        case "each other player may choose to gain x¢. gain x¢ + x¢ for each player who did":
            return logic.noTargetEffect(active.eachOtherPlayerMayGainCoinEffect(game, nr.nextNumber(), nr.nextNumber(), nr.nextNumber()));
        case "choose up to x non-event monster cards in discard. put them in one or more monster slots not being attacked":
            const numberToPut = nr.nextNumber();
            return { effectFunction: active.putMonstersFromDiscardIntoSlotsEffect(game, numberToPut), targetSelectors: selectXCardsFromDiscard(game, "monster", 0, numberToPut, (card) => card instanceof MonsterCard && !card.isEvent) };
        case "give this to another player":
        case "give this card to another player":
            return logic.noTargetEffect(active.giveThisToAnotherPlayerEffect(game, selectionOnResolve));
        case "recharge it":
            return logic.noTargetEffect(active.rechargeItemsEffect(game, false));
        case "roll again":
            return logic.noTargetEffect(active.rollAgainEffect(game));
        case "discard a loot card. if you can't, take x damage":
            return logic.noTargetEffect(active.discardLootOrTakeDamageEffect(game, nr.nextNumber()));
        case "each non-active player discards a loot card":
            return logic.noTargetEffect(active.eachNonActivePlayerDiscardsLootEffect(game));
        case "each other player may choose to loot x. each player that does gives you a loot card":
            return logic.noTargetEffect(active.eachOtherPlayerLootsGivesYouOneEffect(game, nr.nextNumber()));
        case "look at the top x cards of the room or monster deck. you may put one of those in a slot and the rest back. this can't be activated during an attack":
            return { effectFunction: active.lookAtTopXPut1InSlotEffect(game, nr.nextNumber()), targetSelectors: selectDeck(game, 1, 1, (name) => ["room", "monster"].includes(name)) };
        case "put a non-event monster card in discard in a monster slot not being attacked":
            return { effectFunction: active.putMonstersFromDiscardIntoSlotsEffect(game, 1), targetSelectors: selectXCardsFromDiscard(game, "monster", 1, 1, (card) => card instanceof MonsterCard && !card.isEvent) };
        case "choose a shop item. this gains the abilities of that item till end of turn":
            return { effectFunction: passive.gainAbilitiesUntilEffect(game, "on:turn:end", selectShopItem(game)[0]!, false), targetSelectors: selectShopItem(game) };
        case "choose a shop item. this gains the abilities of that item till the start of your next turn. recharge this":
            return { effectFunction: passive.gainAbilitiesUntilEffect(game, "on:turn:start", selectShopItem(game)[0]!, true), targetSelectors: selectShopItem(game) };
        case "they give you a loot card. reveal it":
            return logic.noTargetEffect(active.playerGivesLootCardEffect(game, true, true));
        case "choose a player. they give you a loot card":
            return {effectFunction: active.playerGivesLootCardEffect(game, false, false), targetSelectors: selectPlayer(game)};
        case "you must play that loot card if able. this doesn't use a loot play":
            return logic.noTargetEffect(active.playForFreeTargetEffect(game));
        case "choose a player or monster":
            return { effectFunction: active.chooseOneOfListEffect(game, selectPlayerOrMonster(game)[0]!, selectionOnResolve), targetSelectors: selectPlayerOrMonster(game) };
        case "prevent death. if it's your turn, cancel everything that hasn't resolved and end it":
            case "prevent death. if it's your turn, cancel everything that hasn't resolved and end your turn":
            return logic.noTargetEffect(active.preventDeathEndTurnEffect(game));
        case "remove x or more counters from this:\nloot x. if x+ counters were removed, deal x damage to a monster instead":
            return logic.noTargetEffect(active.removeCountersAndLootOrDamageEffect(game, nr.nextNumber(), nr.nextNumber(), nr.nextNumber(), nr.nextNumber()));
        case "discard any number of loot cards":
            return logic.noTargetEffect(active.discardAnyNumberOfLootCardsEffect(game, youMayEffectHanging));
        case "search the monster deck for any number of cards named the bloat and put them into one or more monster slots not being attacked":
            return logic.noTargetEffect(monster.searchForAnyNumberBloatEffect(game, false));
        case "search the monster deck for a card named the bloat and put it in a monster slot not being attacked":
            return logic.noTargetEffect(monster.searchForAnyNumberBloatEffect(game, true));
        case "choose the player with the most ¢ or tied for the most. that player loses all their ¢":
            return logic.noTargetEffect(monster.playerWithMostCoinsLosesAllEffect(game));
        case "that player gives you a loot card":
            return logic.noTargetEffect(active.playerGivesLootCardEffect(game));
        case "put a non-event monster card in discard on top of the monster deck":
            return logic.noTargetEffect(active.putMonsterFromDiscardOnTopEffect(game));
        case "choose a player. they take x damage. put this in the monster deck x cards from the top":
            return logic.noTargetEffect(active.combineEffectFunctions([
                active.chooseOneOfListEffect(game, selectPlayer(game)[0]!, true),
                active.dealDamageToTargetEffect(game, nr.nextNumber(), false, [], "issuer"),
                monster.putInMonsterDeckNFromTopEffect(game,nr.nextNumber())
            ]));
        case "look at the top x cards of the loot deck and put them back in any order":
        case "look at the top x cards of the loot deck. put them back in any order":
            return logic.noTargetEffect(active.lookAndReorderTopCardsEffect(game, nr.nextNumber(), "loot", "dataIssuer"));
        case "look at the top x cards of the treasure deck and put them back in any order":
            return logic.noTargetEffect(active.lookAndReorderTopCardsEffect(game, nr.nextNumber(), "treasure", "dataIssuer"));
        case "if it is your turn, end it. cancel everything that hasn't resolved":
            return logic.noTargetEffect(active.endTurnAndResetStackEffect(game, true));
        case "end the turn. cancel everything that hasn't resolved":
        case "cancel everything that hasn't resolved and end the turn":
            return logic.noTargetEffect(active.endTurnAndResetStackEffect(game));
        case "choose an eternal item another player controls. this gains all of that item's abilities till the start of your next turn":
            return logic.noTargetEffect(active.chooseAndCopyEternalItemAbilitiesEffect(game));
        case "choose the player with the most souls or tied for the most. that player destroys a soul they control":
            return { effectFunction: active.makeAPlayerWithMostSoulsDestroyASoulEffect(game), targetSelectors: selectPlayerWithMostSouls(game) };
        case "look at the top card of each deck. you may put any of those cards on the bottom of their deck":
            return logic.noTargetEffect(active.look1EachDeckEffect(game));
        case "each player destroys a soul they control":
            return logic.noTargetEffect(active.eachPlayerDestroysASoulEffect(game));
        case "reroll an item you control":
            return { effectFunction: active.rerollItemEffect(game, selectNonEternalItemYouControl(game), selectionOnResolve), targetSelectors: selectNonEternalItemYouControl(game) };
        case "reroll an item. (destroy that item and replace it with the top card of the treasure deck.)":
        case "reroll an item.\n(destroy that item and replace it with the top card of the treasure deck.)":
        case "reroll an item":
            return { effectFunction: active.rerollItemEffect(game, selectNonEternalItemFromAnywhere(game), selectionOnResolve), targetSelectors: selectNonEternalItemFromAnywhere(game) };
        case "reveal the top card of any deck. put it back or put it into discard":
            return { effectFunction: active.lookAtTopCardOfDeckEffect(game, "discard", true, true), targetSelectors: selectDeck(game) };
        case "you must steal a loot card from another player at random":
            return logic.noTargetEffect(active.stealAPlayerRandomLootCardEffect(game));
        case "deactivate an item":
            return { effectFunction: active.deactivateItemEffect(game, selectionOnResolve, youMayEffectHanging), targetSelectors: selectTapItem(game) };
        case "choose a player. that player gives you a loot card":
            return { effectFunction: active.makePlayerGiveLootCardEffect(game, "player"), targetSelectors: selectPlayer(game) };
        case "put a monster into discard and replace it with the top card of the monster deck":
            return logic.noTargetEffect(active.flushOneMonsterSlotEffect(game, 1));
        case "put a monster not being attacked or a shop item into discard":
            return {effectFunction: active.discardMonsterOrShopItem(game), targetSelectors: selectMonsterNotAttackedOrShopItem(game)};
        case "you may put a monster not being attacked into discard and replace it with the top card of the monster deck":
            return logic.noTargetEffect(active.flushOneMonsterSlotEffect(game, 0));
        case "you may put the top card of the monster deck in a monster slot not being attacked":
            return logic.noTargetEffect(active.putTopMonsterInValidSlotEffect(game, true));
        case "put the top card of the monster deck in a monster slot not being attacked":
            return logic.noTargetEffect(active.putTopMonsterInValidSlotEffect(game, false));
        case "choose any number of players. those players loot x":
            return { effectFunction: active.makePlayersLootXEffect(game, nr.nextNumber(), selectionOnResolve), targetSelectors: selectPlayer(game, 0, game.players.length) };
        case "put the top card of the loot discard into your hand":
            return logic.noTargetEffect(active.getCardFromLootDiscardEffect("top", game, false));
        case "cancel the ↷ or $ ability of an item or a loot card being played that targets an item or dice roll you control":
            return { effectFunction: active.cancelStackElementEffect(game), targetSelectors: selectStackElementOrLootTargetingYourItemOrDice(game) };
        case "cancel the ↷ or $ ability of an item or loot being played":
        case "cancel the ↷ or $ ability of an item or a loot being played":
            return { effectFunction: active.cancelStackElementEffect(game), targetSelectors: selectStackElementOrLoot(game) };
        case "cancel the effect of an active item or loot card being played":
            return { effectFunction: active.cancelStackElementEffect(game), targetSelectors: selectStackElementOrLoot(game, 1, 1, false)};
        case "cancel the effect of a loot being played":
            return { effectFunction: active.cancelStackElementEffect(game, selectLootOnStack(game), selectionOnResolve ), targetSelectors: selectLootOnStack(game) };
        case "cancel the triggered ability of a monster or non-eternal item":
            return { effectFunction: active.cancelStackElementEffect(game), targetSelectors: selectPassiveAbilityOrMonsterAbility(game) };
        case "cancel the ↷ or $ ability of an item":
            return { effectFunction: active.cancelStackElementEffect(game), targetSelectors: selectUsableAbilityStackElement(game) };
        case "each other player discards a loot card":
            return logic.noTargetEffect(active.eachOtherPlayerDiscardsLootEffect(game));
        case "discard x loot cards and lose x cents, where x is the number of souls you control":
            return logic.noTargetEffect(active.discardLootAndLoseCoinsBasedOnSoulsEffect(game));
        case "look at each player's hand":
            return logic.noTargetEffect(active.lookAtHands(game));
        case "reroll any number of items you control":
            return logic.noTargetEffect(active.rerollItemEffect(game, selectNonEternalItemYouControl(game), true, true));
        case "choose a character card from outside the game. replace your character with it and your starting item with the chosen card's starting item":
            return { effectFunction: active.replaceCharacterWithOutsideCardEffect(game), targetSelectors: selectCharacterCardFromOutside(game) };
        case "you may put a shop item into discard":
            return logic.noTargetEffect(active.discardAnyNumberOfShopItemsEffect(game, 0, 1, "onResolve"));
        case "put a shop item into discard":
            return { effectFunction: active.discardAnyNumberOfShopItemsEffect(game, 1, 1, selectionOnResolve ? "onResolve" : "next"), targetSelectors: selectShopItem(game) };
        case "you may put any number of shop items into discard":
            return logic.noTargetEffect(active.discardAnyNumberOfShopItemsEffect(game, 0, "any", "onResolve"));
        case "put any number of non-event monster cards in discard on top of the monster deck":
            return logic.noTargetEffect(active.putAnyNumberFromDiscardOnTopEffect("monster", game, (card) => card instanceof MonsterCard && card.encounterType !== MonsterType.EVENT));
        case "steal a soul they control":
            return logic.noTargetEffect(active.stealSoulEffect(game, "next"));
        case "steal a soul from another player":
            return logic.noTargetEffect(active.stealSoulEffect(game, "anotherPlayer"));
        case "steal a non-eternal item they control":
            return logic.noTargetEffect(active.stealNonEternalItemFromTargetEffect(game));
        case "swap a non-eternal item you control with a non-eternal item they control":
            return { effectFunction: active.swapNonEternalItemsEffect(game, youMayEffectHanging), targetSelectors: [selectNonEternalItemYouControl(game)[0]!, selectAnotherPlayerNonEternalItem(game)[0]!] };
        case "destroy an item. if that item was controlled by a player, they steal an item from the shop":
            return { effectFunction: active.destroyItemStealFromShopEffect(game, false), targetSelectors: selectNonEternalItemFromAnywhere(game) };
        case "destroy an item. if it was controlled by a player, they may steal an item from the shop":
            return { effectFunction: active.destroyItemStealFromShopEffect(game, true), targetSelectors: selectNonEternalItemFromAnywhere(game) };
        case "destroy a soul you control":
            return logic.noTargetEffect(active.destroyOneEffect(game, selectSoulYouControl(game)[0]!, "selectionOnResolve"));
        case "each player votes on an item in play. destroy the item with the most votes. if there is a tie, nothing happens":
            return logic.noTargetEffect(active.eachPlayersVoteToDestroyItemEffect(game));
        case "as you play this, choose an item. this copies one of that item's ↷ abilities":
            return { effectFunction: active.copyTapAbilityEffect(game), targetSelectors: selectAnyTapItem(game) };
        case "this copies a ↷ ability of a non-eternal item":
            return { effectFunction: active.copyTapAbilityEffect(game), targetSelectors: selectNonEternalTapItem(game) };
        case "recharge an item":
            return { effectFunction: active.rechargeItemsEffect(game, selectionOnResolve, youMayEffectHanging, selectItem(game)[0]), targetSelectors: selectItem(game) };
        case "recharge an eternal item":
            return { effectFunction: active.rechargeItemsEffect(game, selectionOnResolve, youMayEffectHanging, selectItem(game)[0]), targetSelectors: selectEternalTapItem(game) };
        case "recharge an item you control":
            return { effectFunction: active.rechargeItemsEffect(game, selectionOnResolve, youMayEffectHanging, selectItemYouControl(game)[0]), targetSelectors: selectItemYouControl(game) };
        case "look at the top x cards of the treasure deck. gain x of them, then put the rest on the bottom of the deck in a random order":
            return logic.noTargetEffect(active.lookXtreasuresGainY(game, 7, 2));
        case "you may put the top card of a deck into discard":
            youMayEffectHanging[0] = true;
            return { effectFunction: active.discardTopOfDeckEffect(game, youMayEffectHanging), targetSelectors: selectDeck(game) };
        case "put the top card of a deck into discard":
            return { effectFunction: active.discardTopOfDeckEffect(game, youMayEffectHanging), targetSelectors: selectDeck(game) };
        case "look at a player's hand and the top card of a deck":
            return { effectFunction: active.lookAtPlayerHandAndTopOfDeckEffect(game), targetSelectors: [...selectPlayer(game), ...selectDeck(game)] };
        case "recharge another item":
            return { effectFunction: active.rechargeItemsEffect(game, selectionOnResolve, youMayEffectHanging, selectAnotherItemFromAnywhere(game)[0]), targetSelectors: selectAnotherItemFromAnywhere(game) };
        case "look at a player's hand. you may swap a card from your hand with one of theirs":
            return { effectFunction: active.lookAtPlayerHandAndSwapEffect(game), targetSelectors: selectPlayer(game) };
        case "look at a player's hand. you may steal a loot card from them":
            return { effectFunction: active.lookAtHandAndStealLootEffect(game), targetSelectors: selectPlayer(game) };
        case "look at their hand and steal a loot card from them":
            return logic.noTargetEffect(active.lookAtHandAndStealLootEffect(game));
        case "look at the top x cards of the treasure deck":
            return logic.noTargetEffect(active.lookAtTopXDeck("treasure", game, nr.nextNumber()));
        case "search the treasure deck for a guppy item, gain it":
            return logic.noTargetEffect(active.searchGuppyItemEffect(game));
        case "reveal the top x cards of the monster deck. you may put an event card revealed this way in a monster slot not being attacked. put the rest on the bottom of the deck in a random order":
            return logic.noTargetEffect(active.revealMonsterCardsAndMayPlayEventCards(game, nr.nextNumber()))
        case "choose a player at random. that player destroys an item they control":
            return logic.noTargetEffect(active.destroyOrGiveItemOfRandomPlayerEffect(game, "destroy"));
        case "choose a player at random. that player gives you a non-eternal item they control":
            return logic.noTargetEffect(active.destroyOrGiveItemOfRandomPlayerEffect(game, "give"));
        case "destroy an item or soul":
            return { effectFunction: active.destroyOneEffect(game, selectNonEternalItemOrASoul(game)[0]!, "next"), targetSelectors: selectNonEternalItemOrASoul(game) };
        case "look at the top card of a deck":
            return { effectFunction: active.lookAtTopCardOfDeckEffect(game, "just_watch", selectionOnResolve, false), targetSelectors: selectDeck(game) };
        case "destroy another item":
            return { effectFunction: active.destroyOneEffect(game, selectAnotherNonEternalItemFromAnywhere(game)[0]!, "next"), targetSelectors: selectAnotherNonEternalItemFromAnywhere(game) };
        case "put a monster from under this in a monster slot not being attacked. the active player must make an additional attack on it this turn":
            return logic.noTargetEffect(active.putMonsterFromUnderThisIntoSlotEffect(game));
        case "reroll an item they control":
            return logic.noTargetEffect(active.rerollItemTheyControlEffect(game, youMayEffectHanging));
        case "they must give you a loot card":
            return logic.noTargetEffect(active.makePlayerGiveLootCardEffect(game, "diceRoll"));
        case "put the top card of the monster deck in another monster slot":
            return logic.noTargetEffect(active.putTopMonsterInAnotherSlotEffect(game));
        case "they reveal their hand. choose a non-trinket, non-ambush loot card in their hand. till end of turn, you may play a copy of it without using a loot play":
            return logic.noTargetEffect(active.revealHandAndAddFreeCopyEffect(game));
        case "choose a living player. that player dies":
            return { effectFunction: active.deathTargetEffect(game, [["player"]]), targetSelectors: selectAlivePlayer(game) };
        case "they give you half of their ¢ and loot cards rounded down, then gives you an item":
            return logic.noTargetEffect(active.halfLootAndCoinsAndGiveItemEffect(game));
        case "search the monster deck for a curse card and put it in a monster slot not being attacked":
            return logic.noTargetEffect(active.searchCurseInMonsterDeckEffect(game));
        case "choose a player":
            return {effectFunction: active.trueEffect(), targetSelectors: selectPlayer(game)};
        case "recharge up to x items you control":
            return logic.noTargetEffect(active.rechargeUpToXItems(game, nr.nextNumber(), "youControl", youMayEffectHanging));
        case "look at the top x cards of the treasure deck and reveal one. this becomes a copy of the revealed card till end of turn. put the cards on the bottom of the deck in a random order":
            return logic.noTargetEffect(active.lookAtTopXRevealOneCopyEffect(game, nr.nextNumber()));
        case "choose a player. the next time that player would die this turn, prevent death. if it's their turn, cancel everything that hasn't resolved and end it":
        case "choose a player. the next time that player would die this turn, prevent it. if it's their turn, cancel everything that hasn't resolved and end it":
            return { effectFunction: passive.cancelNextDeathOfAPlayer(game, s), targetSelectors: selectAlivePlayer(game) };
        case "choose another monster and player. they die":
            return logic.noTargetEffect(active.deathTargetEffect(game, [["monster"], ["player"]]));
        case "put a monster not being attacked on the bottom of the monster deck":
            return { effectFunction: active.flushOneMonsterSlotEffect(game, 1, false, "bottom"), targetSelectors: selectMonsterNotBeingAttacked(game) };
        case "if it had no counters on it, put a counter on it, and put it in a monster slot not being attacked":
            return logic.noTargetEffect(monster.putAcounterAndInSlot(game));
        case "each player may discard a loot card. if they don’t, they take x damage. repeat this process till there are x or fewer living players":
            return logic.noTargetEffect(active.eachPlayerMayDiscardOrTakeDamageEffect(game, nr.nextNumber(), nr.nextNumber()));
        case "each player votes for x different players. each player with the most votes or tied for the most die":
            return logic.noTargetEffect(active.voteToKillPlayers(game, nr.nextNumber()));
        case "remove any number of counters from this. gain x [atk] for your next attack roll this turn for each counter removed this way":
            return { effectFunction: active.removeCountersAndAddToNextAttackRollEffect(game, nr.nextNumber()), targetSelectors: selectNbCountersOnCard(game) };
        case "remove any number of counters from this. add x to a roll for each counter removed in this way":
            return { effectFunction: active.removeCountersAndAddToRollEffect(game, nr.nextNumber()), targetSelectors: [...selectNbCountersOnCard(game), ...selectRoll(game)] };
        case "that player dies":
            return logic.noTargetEffect(active.killTargetEffect(game, [], true, false));
        case "choose the player who controls the most souls or is tied for the most. that player wins":
            return logic.noTargetEffect(monster.playerWithMostSoulsWinsEffect(game, "current"));
        case "reveal the top card of the loot deck. if it's a non-trinket, non-ambush card, each player may play a copy of it without using a loot play":
            return logic.noTargetEffect(active.revealTopLootDeckAndEachPlayerMayPlayFreeCopyEffect(game));
    }
    if(s.startsWith("if a non-active player died, "))
        return logic.parseIfAPlayerDiedThisTUrnEffect(s, game, false);
    return null;
}

/**
 * Parse standard string-matched effects that don't require special handling.
 * Returns null if no match is found.
 * Returns a complete ParsedEffect with inline target selectors.
 * 
 * Most effects are parsed here, using a massive switch statement. 
 * This is the default parsing function, that is used if no trigger or key expression is matched.
 * It includes simple effects (e.g. gain x¢) but also complex triggered effect that were not fit to be integrated in the triggered effect parsing function (e.g. "when the active player rolls a x, ").
 */
function parseStandardSyncEffect(s: string, game: Game, nr: NumberRobustString, selectionOnResolve: boolean, youMayEffectHanging: boolean[]): SyncParsedEffect | null {
    // Number-robust parsing for standard effects.
    // Keep this limited to cases where the extracted number(s) are actually used by the returned effect.
    switch (nr.normalizedMasked) {
        case "add x to a dice roll":
            return { effectFunction: active.addToDiceRollEffect(game, nr.nextNumber()), targetSelectors: selectRoll(game) };
        case "remove x counter from this":
        case "remove x counters from this":
            return logic.noTargetSyncEffect(active.removeCountersEffect(game, nr.nextNumber()));
        case "remove a counter from this":
            return logic.noTargetSyncEffect(active.removeCountersEffect(game, 1));
        case "players who control the fewest souls or tied for fewest may purchase a shop item for x¢ on their turn":
            return logic.noTargetSyncEffect(room.playersWithFewestSoulsShopItemPriceReductionEffect(game, nr.nextNumber()));
        case "gain x¢":
            return logic.noTargetSyncEffect(active.gainCoinsEffect(game, nr.nextNumber(), "issuer", [false]));
        case "steal x¢ from a player":
        case "steal x¢ from another player":
            return { effectFunction: active.stealCoinsEffect(game, nr.nextNumber()), targetSelectors: selectAnotherPlayer(game) };
        case "steal x¢ from them":
            return logic.noTargetSyncEffect(active.stealCoinsEffect(game, nr.nextNumber()));
        case "gain x treasure":
        case "gain x treasures":
            return logic.noTargetSyncEffect(active.gainTreasuresEffect(game, nr.nextNumber()));
        case "each monster heals x [hp]":
            return logic.noTargetSyncEffect(active.healEachMonsterEffect(game, nr.nextNumber()));
        case "heal x [hp]":
        case "you heal x [hp]":
        case "this heals x [hp]":
            return logic.noTargetSyncEffect(active.healEffect(game, nr.nextNumber()));
        case "lose x¢":
            return logic.noTargetSyncEffect(active.loseCoinsEffect(game, nr.nextNumber()));
        case "loot x":
            return logic.noTargetSyncEffect(active.lootCardsEffect(game, nr.nextNumber()));
        case "remove x counter from this":
        case "remove x counters from this":
            return logic.noTargetSyncEffect(active.removeCountersFromThisEffect(game, nr.nextNumber()));
        case "pay x [hp]":
            return logic.noTargetSyncEffect(active.payHealthEffect(game, nr.nextNumber()));
        case "pay x¢":
        case "pay x¢:":
            return logic.noTargetSyncEffect(active.payCoinsEffect(game, nr.nextNumber()));
        case "put x counters on this":
            return logic.noTargetSyncEffect(active.putCountersOnItemEffect(nr.nextNumber(), "normal", game));
        case "put a counter on this":
        case "put a counter on it":
            return logic.noTargetSyncEffect(active.putCountersOnItemEffect(1, "normal", game));
        case "put a spider counter on it":
            return logic.noTargetSyncEffect(active.putCountersOnItemEffect(1, "spider", game));
        case "you have x [hp] while it's not your turn":
            const HP = nr.nextNumber();
            return logic.noTargetSyncEffect(passive.ConditionalStatModifierEffect([game.entityHandler.addHealth.bind(game.entityHandler)], HP, (entity: Entity, card: Card) => 
                game.currentPlayer !== entity, 
            ["on:turn:start", "on:enter:play:after"], game, false, false));
        case "put a gut counter on the active player":
            return logic.noTargetSyncEffect(active.putCountersOnPlayerEffect(1, "gut", "current", game));
        case "put counters on it equal to the number of loot cards in your hand":
            return logic.noTargetSyncEffect(active.putCountersBasedOnLootCardsInHandEffect(game));
        case "players with gut counters on them have x+ [dc] and can be attacked":
            return logic.noTargetSyncEffect(passive.playersWithGutCountersHaveDCAndCanBeAttackedEffect(game, nr.nextNumber()));
        case "if you have fewer loot cards in your hand than there are counters on this, loot x":
            return logic.noTargetSyncEffect(active.conditionalLootBasedOnCountersEffect(game, nr.nextNumber()));
        case "each player gains x¢":
            return logic.noTargetSyncEffect(active.eachPlayerGainsCoinsEffect(game, nr.nextNumber()));
        case "double the amount of ¢ they have":
            return logic.noTargetSyncEffect(active.doubleCoinTarget(game));
        case "loot x for each player that died this turn":
            return logic.noTargetSyncEffect(active.lootForEachPlayerDiedThisTurnEffect(game, nr.nextNumber()));
        case "that player loses all ¢":
            return logic.noTargetSyncEffect(active.loseAllCoinTarget(game));
        case "each player loots x":
            return logic.noTargetSyncEffect(active.eachPlayerLootsEffect(game, nr.nextNumber()));
        case "prevent all damage you would take while it's not your turn":
            return logic.noTargetSyncEffect(passive.preventDamageNotOnYourTurnEffect(game));
        case "it gains x [dc] till end of turn":
            return logic.noTargetSyncEffect(passive.temporaryStatModifierEffect([game.entityHandler.addDC.bind(game.entityHandler)], nr.nextNumber(), game, "issuer"));
        case "it gains -x [dc] till end of turn":
            return logic.noTargetSyncEffect(passive.temporaryStatModifierEffect([game.entityHandler.addDC.bind(game.entityHandler)], -nr.nextNumber(), game, "issuer"));
        case "while this has x+ counters on it, it has -x [dc]":
            const countersMin = nr.nextNumber();
            const DCsub = nr.nextNumber();
            return logic.noTargetSyncEffect(passive.ConditionalStatModifierEffect([game.entityHandler.addDC.bind(game.entityHandler)], -DCsub, (entity: Entity, card: Card) => card.counters.value("normal") >= countersMin, ["on:counter:modified"], game, false));
        case "players can be attacked and have x+ [dc]":
            return logic.noTargetSyncEffect(room.otherPlayersAreAttackableEffect(game, nr.nextNumber()));
        case "players can be attacked till end of turn. they have x+ [dc] for the attack":
        case "till end of turn, each player has x+ [dc] and can be attacked":
            return logic.noTargetSyncEffect(room.otherPlayersAreAttackableEffect(game, nr.nextNumber(), false, ()=>true, true));
        case "on your turn, other players have x+ [dc] and can be attacked":
            return logic.noTargetSyncEffect(room.otherPlayersAreAttackableEffect(game, nr.nextNumber(), true));
        case "other players may attack you. you have x+ [dc] for the attack":
        case "you have x+ [dc] and can be attacked":
            return logic.noTargetSyncEffect(room.IssuerIsAttackableEffect(game, nr.nextNumber()));
        case "this heals x [hp]":
            return logic.noTargetSyncEffect(monster.thisHealsEffect(game, nr.nextNumber()));
        case "destroy an item you control":
            return { effectFunction: active.destroyOneEffect(game, selectNonEternalItemYouControl(game)[0]!, "next"), targetSelectors: selectNonEternalItemYouControl(game) };
        case "each player loses x¢":
            return logic.noTargetSyncEffect(active.eachPlayerLosesCoinsEffect(game, nr.nextNumber()));
        case "kill all players":
            return logic.noTargetSyncEffect(active.killAllPlayer(game));
        case "each player takes x damage":
        case "deal x damage to each player":
            return logic.noTargetSyncEffect(active.dealDamageToEachPlayerEffect(game, nr.nextNumber()));
        case "each monster takes x damage":
        case "deal x damage to each monster":
            return logic.noTargetSyncEffect(active.dealDamageToEachMonsterEffect(game, nr.nextNumber()));
        case "while voting, you may vote an additional time":
            return logic.noTargetSyncEffect(passive.voteAdditionalTimeEffect(1, game));
        case "shop items you purchase cost x¢ less":
            return logic.noTargetSyncEffect(passive.shopItemsCostLessEffect(nr.nextNumber(), game));
        case "you take x damage":
            return logic.noTargetSyncEffect(active.takeDamageEffect(game, nr.nextNumber(), true));
        case "monsters you attack have x [dc] till end of turn":
            return logic.noTargetSyncEffect(passive.monstersYouAttackModifiers(game, nr.nextNumber()));
        case "monsters you attack have -x [dc] till end of turn":
            return logic.noTargetSyncEffect(passive.monstersYouAttackModifiers(game, -nr.nextNumber()));
        case "when another player kills you, give this to them":
            return logic.noTargetSyncEffect(passive.giveThisToKillerEffect(game));
        case "flip an eternal item you control if able":
            return { effectFunction: active.flipEternalItemYouControlEffect(game), targetSelectors: selectEternalItemYouControl(game) };
        case "take x damage":
        case "this takes x damage":
            return logic.noTargetSyncEffect(active.takeDamageEffect(game, nr.nextNumber()));
        case "take x damage and gain x¢":
            return logic.noTargetSyncEffect(active.takeDamageGainCoinsEffect(s, nr.nextNumber(), nr.nextNumber(), game));
        case "deal x damage to them":
            return { effectFunction: active.dealDamageToTargetEffect(game, nr.nextNumber(), false, decideEntitySelector(s, game), "issuer"), targetSelectors: decideEntitySelector(s, game) };
        case "$ items you control cost x¢ less to activate":
            return logic.noTargetSyncEffect(passive.itemCostLessToActivateEffect(game, nr.nextNumber()));
        case "you have x [hp] and x [atk]":
            return logic.noTargetSyncEffect(active.combineSyncEffectFunctions([
                passive.permanentStatModifierEffect([game.entityHandler.addHealth.bind(game.entityHandler)], nr.nextNumber(), game),
                passive.permanentStatModifierEffect([game.entityHandler.addAttack.bind(game.entityHandler)], nr.nextNumber(), game)
            ]));
        case "you have x [hp]":
        case "x [hp]":
            return logic.noTargetSyncEffect(passive.permanentStatModifierEffect([game.entityHandler.addHealth.bind(game.entityHandler)], nr.nextNumber(), game));
        case "you have x [atk] while you control no other non-eternal items":
            return logic.noTargetSyncEffect(passive.ConditionalStatModifierEffect(
                    [game.entityHandler.addAttack.bind(game.entityHandler)],
                    nr.nextNumber(),
                    (entity: Entity, card: Card) => entity instanceof Player && entity.inPlay.filter((item) => !item.isEternal() && item !== card).length === 0,
                    ["on:enter:play:after", "on:item:destroyed"],
                    game,
                    false
                ));
        case "while you control x or more non-eternal items, monsters have x [dc] on your turn":
            {
                const minItems = nr.nextNumber();
                const dcMod = nr.nextNumber();
                return logic.noTargetSyncEffect(passive.ConditionalStatModifierEffect(
                        [game.entityHandler.addDCToEachMonster.bind(game.entityHandler)],
                        dcMod,
                        (entity: Entity, card: Card) => entity instanceof Player && entity === game.currentPlayer && entity.inPlay.filter((item) => !item.isEternal() && item !== card).length >= minItems,
                        ["on:enter:play:after", "on:item:destroyed", "on:turn:start", "till:turn:end"],
                        game,
                        false,
                        false // re-evaluate on other players' turns too, so the modifier is removed when it's not your turn.
                    ));
            }
        case "this has x [atk] while it has a counter on it":
            return logic.noTargetSyncEffect(passive.ConditionalStatModifierEffect(
                    [game.entityHandler.addAttack.bind(game.entityHandler)],
                    nr.nextNumber(),
                    (entity: Entity, card: Card) => entity.card.counters.counterOwned.length > 0,
                    ["on:counter:modified"],
                    game,
                    false
                ));
        case "this gains x [atk]":
        case "x [atk]":
            return logic.noTargetSyncEffect(passive.permanentStatModifierEffect([game.entityHandler.addAttack.bind(game.entityHandler)], nr.nextNumber(), game));
        case "play with the top card of the loot deck revealed till end of turn. you may play the top card of the loot deck till end of turn":
            return logic.noTargetSyncEffect(passive.playWithTopLootRevealedAndCanPlayTopEffect(game));
        case "add x to that instance of damage":
            return logic.noTargetSyncEffect(active.addXtoThatDamageEffect(game, nr.nextNumber()));
        case "flip your character if able. then recharge it. discard your hand and loot x":
            return logic.noTargetSyncEffect( active.combineSyncEffectFunctions([
                    active.flipCharacterEffect(game),
                    active.rechargeCharaEffect(game, [false]),
                    active.discardHandEffect(game),
                    active.lootCardsEffect(game, nr.nextNumber()),
                ]));
        case "when this is flipped to this side, loot x":
            return logic.noTargetSyncEffect(passive.lootAfterFlippingEffect(game, nr.nextNumber()));
        case "choose a monster or player. the next instance of damage they take this turn is reduced to x":
            return {
                effectFunction: passive.setNextDamageToXEffect(nr.nextNumber(), game),
                targetSelectors: selectPlayerOrMonster(game),
            };
        case "each time you gain rewards from killing monsters, choose another player. they also gain the rewards":
            return logic.noTargetSyncEffect(passive.OnOtherPlayersKillGetHalf(game));
        case "it becomes an item. the active player gains it":
            return logic.noTargetSyncEffect(active.becomesItem(game));
        case "each time another player gains rewards from killing monsters, you also gain half the rewards rounded down":
            return logic.noTargetSyncEffect(passive.OnMyKillShare(game));
        case "roll":
            return parseRollEffect("roll-", nr, game, false)
        case "loot x during your loot step":
            const nb = nr.nextNumber();
            return logic.noTargetSyncEffect(passive.onYourEventEffect("on:loot:step", [(effect: EffectData, event: OnLootStepData) => {event.lootStep.nbLoots += nb; return true;}    ], game, s, true));
            // return logic.noTargetSyncEffect(passive.lootStepEffect([active.lootCardsEffect(game, nr.nextNumber())], game));
        case "prevent the next x damage you would take this turn":
            return logic.noTargetSyncEffect(passive.preventNextDamageUpToEffect(nr.nextNumber(), game));
        case "choose a player. prevent the next x damage they would take this turn":
            return {
                effectFunction: passive.preventNextDamageUpToEffect(nr.nextNumber(), game),
                targetSelectors: selectPlayer(game),
            };
        case "choose a player or monster. prevent the next instance of up to x damage they would take this turn":
        case "choose a player. prevent the next instance of up to x damage they would take this turn":
        case "choose a player or monster. prevent the next x damage they would take this turn":
            return {
                effectFunction: passive.preventNextDamageUpToEffect(nr.nextNumber(), game),
                targetSelectors: selectPlayerOrMonster(game),
            };
        case "while you have x¢, you have x to your attack rolls": {
            const coinCount = nr.nextNumber();
            const diceMod = nr.nextNumber();
            return logic.noTargetSyncEffect(passive.ConditionalStatModifierEffect(
                    [game.entityHandler.addAttackDiceModifier.bind(game.entityHandler)],
                    diceMod,
                    (entity: Entity) => entity instanceof Player && entity.coins === coinCount,
                    ["on:coin:gained:after", "on:coin:lost:after"],
                    game,
                    false,
                ));
        }
        case "each player rolls x times-\neach player who rolls the highest sum or tied for it gains x treasure.\neach player who rolls the lowest sum or tied for it dies. each player gains x¢":
            return logic.noTargetSyncEffect(active.eachPlayerRollsXTimesEffect(game, nr.nextNumber(), nr.nextNumber(), nr.nextNumber()));
        case "while you have x loot cards in your hand, you have x [atk]": {
            const lootCount = nr.nextNumber();
            const atk = nr.nextNumber();
            return logic.noTargetSyncEffect(passive.ConditionalStatModifierEffect(
                    [game.entityHandler.addAttack.bind(game.entityHandler)],
                    atk,
                    (entity: Entity) => entity instanceof Player && entity.hand.length === lootCount,
                    ["on:loot:added:after", "on:loot:removed:after"],
                    game,
                    false
                ));
        }
        case "each player who controls a character named johnny loots x":
            return logic.noTargetSyncEffect(active.playerWithCharaNamedLootX(game, "Johnny", nr.nextNumber()));
        case "the first time a player dies each turn, each living player votes for a living player. each player with the most votes or tied for the most dies":
            return logic.noTargetSyncEffect(active.voteOnFirstDeath(game));
        case "you must make an additional attack on the monster deck":
            return logic.noTargetSyncEffect(active.forceAttackMonsterDeckEffect(game, 1, "additional")); 
        case "you must make an additional attack against this":
            return logic.noTargetSyncEffect(active.forceAttackThisEffect(game, 1, "additional")); 
        case "you gain x [atk] till the end of turn":
            return logic.noTargetSyncEffect(passive.temporaryStatModifierEffect([game.entityHandler.addAttack.bind(game.entityHandler)], nr.nextNumber(), game, "issuer"));
        case "skip your next turn":
            return logic.noTargetSyncEffect(active.issuerSkipNextTurnEffect(game, false));
        case "prevent the first x damage you would take each turn":
            return logic.noTargetSyncEffect(passive.preventFirstDamageEachTurnEffect(nr.nextNumber(), game));
        case "choose a player. prevent the next instance of damage they would take this turn. when that damage is prevented, deal that much damage to a monster or another player":
            return {
                effectFunction: passive.preventDamageAndDealDmgOnPreventEffect(INFINITY, "prevented", "next", game),
                targetSelectors: selectAnotherPlayer(game),
            };
        case "cancel everything that hasn't resolved":
            return logic.noTargetSyncEffect(active.cancelStackEffect(game));
        case "prevent the next x damage you would take this turn. when you prevent damage this way, deal x damage to another player": {
            const preventAmount = nr.nextNumber();
            const damageAmount = nr.nextNumber();
            return logic.noTargetSyncEffect(passive.preventDamageAndDealDmgOnPreventEffect(preventAmount, damageAmount, "issuer", game));
        }
        case "choose a player or monster. they gain x [atk] till end of turn":
            return {
                effectFunction: passive.temporaryStatModifierEffect([game.entityHandler.addAttack.bind(game.entityHandler)], nr.nextNumber(), game, "next"),
                targetSelectors: selectPlayerOrMonster(game),
            };
        case "gain x [atk] till end of turn":
        case "you gain x [atk] till end of turn":
            return {
                effectFunction: passive.temporaryStatModifierEffect([game.entityHandler.addAttack.bind(game.entityHandler)], nr.nextNumber(), game, "issuer"),
                targetSelectors: selectPlayerOrMonster(game),
            };
        case "each monster gains x [atk] till end of turn":
            return logic.noTargetSyncEffect(passive.temporaryStatModifierEffect(
                    [game.entityHandler.addAttackToEachMonster.bind(game.entityHandler)],
                    nr.nextNumber(),
                    game,
                    "issuer",
                ));
        case "prevent the first instance of combat damage you would take each turn":
            return logic.noTargetSyncEffect(passive.onYourEventEffect("on:turn:start", [passive.preventNextDamageUpToEffect(INFINITY, game, "combat")], game, s, false, (effect: EffectData) => {
                return effect.issuer.damageTakenThisTurn.filter((damage) => damage.with instanceof DiceRoll).length === 0;  
        }, true));
        case "prevent the first instance of damage you would take each turn":
            return logic.noTargetSyncEffect(passive.onYourEventEffect("on:turn:start", [passive.preventNextDamageUpToEffect(INFINITY, game, "any")], game, s, false, (effect: EffectData) => {
                return effect.issuer.damageTakenThisTurn.filter((damage) => damage.with instanceof DiceRoll).length === 0;  
        }, true));
        case "at the start of each turn or each time this deals combat damage, the active player deals x damage to a player chosen at random":
            return logic.noTargetSyncEffect(passive.atStartAndDamageGivenDealDamageToRandomPlayerEffect(nr.nextNumber(), game));
        case "put all cards in another monster slot into discard":
            return logic.noTargetSyncEffect(active.flushMonsterSlotsEffect(game, "discard", true));
        case "your death penalty item is chosen at random":
            return logic.noTargetSyncEffect(passive.randomDeathPenaltyItemEffect(game));
        case "the first time you activate your character each round, recharge it":
            return logic.noTargetSyncEffect(passive.rechargeCharacterOnFirstActivationEachRoundEffect(game));
        case "each monster gains x [dc] till end of turn":
        case "monsters gain x [dc] till end of turn":
            return logic.noTargetSyncEffect(passive.temporaryStatModifierEffect([game.entityHandler.addDCToEachMonster.bind(game.entityHandler)], nr.nextNumber(), game, "issuer"));
        case "each monster gains -x [dc] till end of turn":
            return logic.noTargetSyncEffect(passive.temporaryStatModifierEffect([game.entityHandler.addDCToEachMonster.bind(game.entityHandler)], -nr.nextNumber(), game, "issuer"));
        case "if you would take any amount of damage, take that much damage x instead":
            return logic.noTargetSyncEffect(passive.takeDamagePlusEffect(nr.nextNumber(), game));
        case "roll and gain ¢ equal to the result":
            return logic.noTargetSyncEffect(active.rollGainCoinsEffect(game));
        case "each time a player dies, before paying penalties, loot x":
            return logic.noTargetSyncEffect(passive.lootOnPlayerDeathEffect(nr.nextNumber(), game));
        case "if this is higher than level x, instead of paying the death penalty, this levels down":
            return logic.noTargetSyncEffect(passive.levelDownInsteadOfDeathPenaltyEffect(game, nr.nextNumber()));
        case "if you would gain any number of ¢, gain that much x¢ instead":
            return logic.noTargetSyncEffect(passive.gainPlusCoinsEffect(nr.nextNumber(), game));
        case "this starts at level x":
        case "this starts with x counters":
        case "this item starts with x counters on it":
            return logic.noTargetSyncEffect(passive.startWithNCountersEffect(nr.nextNumber(), game));
        case "gain x [atk] for your first attack roll each turn":
        case "you have x [atk] for your first attack roll each turn":
            return logic.noTargetSyncEffect(passive.firstAttackRollStatModifierEffect(nr.nextNumber(), 0, 0, game));
        case "you have x [atk] for the second attack you make each turn":
            const atkValue = nr.nextNumber();
            return logic.noTargetSyncEffect(passive.syncOnYourEventEffect("on:attack:roll:modifier",[(effect: EffectData, event: any) =>{
                (event.dice as DiceRoll).additionalDamageDealt += atkValue;
                return true;
            }], game, s, false, (effect: EffectData) => {
                return effect.issuer instanceof Player && effect.issuer.attackedIdsThisTurn.length === 2;
            }));
        case "each player dies":
            return logic.noTargetSyncEffect(active.killAllXEffect(game, "player"));
        case "each monster dies":
            return logic.noTargetSyncEffect(active.killAllXEffect(game, "monster"));
        case "each other monster dies":
            return logic.noTargetSyncEffect(active.killAllXEffect(game, "monster", true));
        case "each time you would deal damage roll-\nx: prevent that damage":
            return logic.noTargetSyncEffect(passive.preventDamageOnRollEffect([nr.nextNumber()], INFINITY, game, "dealt"));
        case "each time you would take damage, roll-\nx: prevent x of that damage": {
            const rollValue = nr.nextNumber();
            const preventAmount = nr.nextNumber();
            return logic.noTargetSyncEffect(passive.preventDamageOnRollEffect([rollValue], preventAmount, game, "taken"));
        }
        case "the attacking player has -x to their next attack roll this turn":
            return logic.noTargetSyncEffect(passive.nextRollModifier(game, "attack", -nr.nextNumber(), "active"));
        case "the attacking player has x to their next attack roll this turn":
            return logic.noTargetSyncEffect(passive.nextRollModifier(game, "attack", nr.nextNumber(), "active"));
        case "the next attack roll this turn has -x":
            return logic.noTargetSyncEffect(passive.nextRollModifier(game, "attack", -nr.nextNumber(), "any"));
        case "x to your next roll":
            return logic.noTargetSyncEffect(passive.nextRollModifier(game, "any", nr.nextNumber(), "issuer"));
        case "the attacking player also deals combat damage to this on attack rolls of x":
            return logic.noTargetSyncEffect(passive.attackingPlayerDealDamageOnRollOf(game, nr.nextNumber(), s));
        case "each player rolls-\nx-x: they skip their next turn":
            return logic.noTargetSyncEffect(active.eachPlayerRollsSkipNextTurnEffect(game, nr.nextNumber(), nr.nextNumber()));
        case "deal x damage to each other player": {
            const damage = nr.nextNumber();
            return logic.noTargetSyncEffect(active.dealDamageToEachOtherPlayerEffect(game, damage));
        }
        case "each time another player gains ¢, they must give you x¢":
            return logic.noTargetSyncEffect(passive.stealCoinOnGainEffect(nr.nextNumber(), game));
        case "if you have x¢, gain x¢": {
            const coinsCondition = nr.nextNumber();
            const gainAmount = nr.nextNumber();
            return logic.noTargetSyncEffect(active.gainXCoinsIfYEffect(coinsCondition, gainAmount, game));
        }
        case "if you have x or more loot cards in your hand, loot x": {
            const threshold = nr.nextNumber();
            const lootAmount = nr.nextNumber();
            return logic.noTargetSyncEffect(active.lootXIfYEffect(threshold, true, lootAmount, game));
        }
        case "if you have x loot cards in your hand, loot x": {
            const threshold = nr.nextNumber();
            const lootAmount = nr.nextNumber();
            return logic.noTargetSyncEffect(active.lootXIfYEffect(threshold, false, lootAmount, game));
        }
        case "each other player takes x damage":
            return logic.noTargetSyncEffect(active.dealDamageToEachOtherPlayerEffect(game, nr.nextNumber()));
        case "gain x ¢ instead": {
            const fixed = nr.nextNumber();
            return logic.noTargetSyncEffect(active.modifyCoinGainedEffect(game, () => fixed));
        }
        case "deal x damage to up to x monsters or players": {
            const damage = nr.nextNumber();
            const maxTargets = nr.nextNumber();
            return {
                effectFunction: active.dealDamageToUpToXMonstersOrPlayersEffect(game, maxTargets, damage),
                targetSelectors: selectPlayerOrMonster(game, 1, maxTargets),
            };
        }
        case "combat damage you take is doubled on attack rolls of x":
            return logic.noTargetSyncEffect(passive.combatDamageModifierOnAttackRollEffect(game, [nr.nextNumber()], "double", "taken"));
        case "combat damage you deal is doubled on attack rolls of x":
            return logic.noTargetSyncEffect(passive.combatDamageModifierOnAttackRollEffect(game, [nr.nextNumber()], "double", "dealt"));
        case "combat damage you deal on attack rolls of x is increased by x": {
            const rollValue = nr.nextNumber();
            const increaseBy = nr.nextNumber();
            return logic.noTargetSyncEffect(passive.combatDamageModifierOnAttackRollEffect(game, [rollValue], increaseBy, "dealt"));
        }
        case "when this would die, prevent its death, put a counter on it, and the active player gains its rewards. then, if this has x+ counters, put this into discard":
            return logic.noTargetSyncEffect(passive.preventDeathAndAddCounterAndGainRewardsEffect(game, nr.nextNumber()));
        case "if this has x+ counters, remove all of them and loot x": {
            const threshold = nr.nextNumber();
            const lootAmount = nr.nextNumber();
            return logic.noTargetSyncEffect(active.removeCounterAndLootIfAbove(game, threshold, lootAmount));
        }
        case "choose a monster. its [atk] becomes x":
            return { effectFunction: active.setMonsterAttackToXEffect(game, nr.nextNumber()), targetSelectors: selectMonster(game) };
        case "this has x [hp] for each counter on this":
        case "you have x [hp] for each counter on this":
            return logic.noTargetSyncEffect(passive.statModifierBasedOnCountersEffect(game, [game.entityHandler.addHealth.bind(game.entityHandler)], 1, nr.nextNumber()));
        case "this has x [atk] for each counter on it": {
            const atkPer = nr.nextNumber();
            return logic.noTargetSyncEffect(passive.statModifierBasedOnCountersEffect(game, [game.entityHandler.addAttack.bind(game.entityHandler)], 1, atkPer));
        }
        case "this has -x [dc] for each counter on it": {
            const dcPer = nr.nextNumber();
            return logic.noTargetSyncEffect(passive.statModifierBasedOnCountersEffect(game, [game.entityHandler.addDC.bind(game.entityHandler)], 1, -dcPer));
        }
        case "you have x [hp] for every x counters this has on it": {
            const hpPer = nr.nextNumber();
            const countersPer = nr.nextNumber();
            return logic.noTargetSyncEffect(passive.statModifierBasedOnCountersEffect(game, [game.entityHandler.addHealth.bind(game.entityHandler)], countersPer, hpPer));
        }
        case "you have x [atk] for every x counters on this": {
            const atkPer = nr.nextNumber();
            const countersPer = nr.nextNumber();
            return logic.noTargetSyncEffect(passive.statModifierBasedOnCountersEffect(game, [game.entityHandler.addAttack.bind(game.entityHandler)], countersPer, atkPer));
        }
        case "you and that player each gain x treasure":
            const treasureAmount = nr.nextNumber();
            return logic.noTargetSyncEffect(active.combineSyncEffectFunctions([active.gainTreasuresEffect(game, treasureAmount), active.gainTreasuresEffect(game, treasureAmount, "next")]));
        case "destroy this":
            return logic.noTargetSyncEffect(active.destroyThisEffect(game));
        case "if this would be put into discard, instead give it to another player": // curse trigger
            return logic.noTargetSyncEffect(passive.giveThisToAnotherPlayerInsteadOfDiscardEffect(game));
        case "till end of turn, if a player would roll a x or x, it becomes a x instead":
            return logic.noTargetSyncEffect(passive.changeRollToXIfItIsXEffect(game, [nr.nextNumber(), nr.nextNumber()], nr.nextNumber()));
        case "the first shop item a player purchases this turn costs x¢":
            return logic.noTargetSyncEffect(passive.nextShopItemThisTurnCosts(game, nr.nextNumber()));
        case "the next shop item you purchase this turn costs x¢":
            return logic.noTargetSyncEffect(passive.nextShopItemThisTurnCosts(game, nr.nextNumber()));
        case "recharge up to x other items in play":
            const upTo = nr.nextNumber();
            return { effectFunction: active.rechargeUpToXOtherItemsEffect(game, upTo), targetSelectors: selectTapItem(game, 1, upTo) };
        case "if a player would roll a dice, they instead roll x dice. the player to their left chooses one of the rolls as the result":
            return logic.noTargetSyncEffect(passive.rollXChoose1Effect(game, nr.nextNumber(), false, "left"));
        case "you have x to your first dice roll each turn":
            return logic.noTargetSyncEffect(passive.firstRollDiceModifier(nr.nextNumber(), game, "any"));
        case "you have x to the first attack roll you make each turn":
        case "you have x to your first attack roll each turn":
            return logic.noTargetSyncEffect(passive.firstRollDiceModifier(nr.nextNumber(), game, "attack"));
        case "you have x [atk]":
            return logic.noTargetSyncEffect(passive.permanentStatModifierEffect([game.entityHandler.addAttack.bind(game.entityHandler)], nr.nextNumber(), game));
        case "you may attack any number of times on your turn":
            return logic.noTargetSyncEffect(passive.onYourTurnModifier([game.entityHandler.addAttackThisTurn.bind(game.entityHandler)], INFINITY, game));
        case "you may attack up to x times during your turn":
            return logic.noTargetSyncEffect(passive.onYourTurnModifier([game.entityHandler.addAttackThisTurn.bind(game.entityHandler)], nr.nextNumber(), game));
        case "you may attack players who control more souls than you. they have x [dc] for the attack":
            return logic.noTargetSyncEffect(room.otherPlayersAreAttackableEffect(game, nr.nextNumber(), true, (player: Player) => player.totalSouls > game.currentPlayer.totalSouls));
        case "subtract x from a roll":
            return { effectFunction: active.subtractUpToXFromRollEffect(game, nr.nextNumber()), targetSelectors: selectRoll(game) };
        case "subtract up to x from a roll":
            return { effectFunction: active.subtractUpToXFromRollEffect(game), targetSelectors: selectRollAndNumber(game, [...Array(nr.nextNumber()+1).keys()]) };
        case "add up to x to an attack roll":
            return { effectFunction: active.addUpToXToRollEffect(game, "attack"), targetSelectors: selectRollAndNumber(game, [...Array(nr.nextNumber()+1).keys()], 1, 1, "attack") };
        case "add up to x to a non-attack roll":
            return { effectFunction: active.addUpToXToRollEffect(game, "non-attack"), targetSelectors: selectRollAndNumber(game, [...Array(nr.nextNumber()+1).keys()], 1, 1, "non-attack") };
        case "you may add or subtract x from any of your non-attack rolls":
            const val = nr.nextNumber();
            return logic.noTargetSyncEffect(passive.addToYourRollValueEffect(game, [-val, val], "non-attack", [true]));
        case "add x to a roll":
            return { effectFunction: active.addXToRollEffect(nr.nextNumber()), targetSelectors: selectRoll(game) };
        case "when you control x or x souls, you have x [atk]":
            const nbSouls1 = nr.nextNumber();
            const nbSouls2 = nr.nextNumber();
            const atkBonus = nr.nextNumber();
            return logic.noTargetSyncEffect(passive.ConditionalStatModifierEffect([game.entityHandler.addAttack.bind(game.entityHandler)], atkBonus, (entity: Entity) => entity instanceof Player && [nbSouls1, nbSouls2].includes(entity.totalSouls), ["on:soul:gained", "on:soul:removed"], game, true));
        case "if you control x+ souls, you have x [atk] instead":
            const nbSouls = nr.nextNumber();
            const atk = nr.nextNumber();
            return logic.noTargetSyncEffect(passive.ConditionalStatModifierEffect([game.entityHandler.addAttack.bind(game.entityHandler)], atk, (entity: Entity) => entity instanceof Player && entity.totalSouls >= nbSouls, ["on:soul:gained", "on:soul:removed"], game, true));
        case "when you control x or x souls, you have x [atk] . if you control x+ souls, you have x [atk] instead":
            const _nbSouls1 = nr.nextNumber();
            const _nbSouls2 = nr.nextNumber();
            const _atkBonus = nr.nextNumber();
            const _nbSouls = nr.nextNumber();
            const _atk = nr.nextNumber();
            const eff1 =  passive.ConditionalStatModifierEffect([game.entityHandler.addAttack.bind(game.entityHandler)], _atkBonus, (entity: Entity) => entity instanceof Player && [_nbSouls1, _nbSouls2].includes(entity.totalSouls), ["on:soul:gained", "on:soul:removed"], game, true);
            const eff2 =  passive.ConditionalStatModifierEffect([game.entityHandler.addAttack.bind(game.entityHandler)], _atk, (entity: Entity) => entity instanceof Player && entity.totalSouls >= _nbSouls, ["on:soul:gained", "on:soul:removed"], game, true);
            return logic.noTargetSyncEffect(active.combineSyncEffectFunctions([eff1, eff2]));
        case "when this would deal combat damage to the active player, prevent it, then this deals x damage to a player chosen at random":
            return logic.noTargetSyncEffect(passive.preventDamageToCurrentPlayerAndDealToRandomPlayerEffect(game, nr.nextNumber()));
        case "this can't be recharged except by its own abilities":
                return logic.noTargetSyncEffect(passive.onlyRechargeableByOwnAbilitiesEffect(game));
        case "while this has x counters on it, you have x [atk]":
            const counters = nr.nextNumber();
            const atkBonus2 = nr.nextNumber();
            return logic.noTargetSyncEffect(passive.ConditionalStatModifierEffect([game.entityHandler.addAttack.bind(game.entityHandler)], atkBonus2, (entity: Entity, card: Card) => card.counters.value("normal") === counters, ["on:counter:modified"], game, false));
        case "each time the active player deals damage to this, they roll-\nx-x: they take x damage.\nx-x: each player takes x damage.\nx-x: this takes x damage":
            return logic.noTargetSyncEffect(monster.OnDamageByActivePlayerRollDealDamageEffect(game, nr.numbers));
        case "reveal the top x cards of the loot deck. put each card with \"bomb\" in its name in your hand and the rest on the bottom of the loot deck":
            return logic.noTargetSyncEffect(active.bombInLootDeckEffect(game, nr.nextNumber()));
        case "reveal the top x cards of the loot deck. put each card named pills in your hand and the rest on the bottom of the deck":
            return logic.noTargetSyncEffect(active.pillsInLootDeckEffect(game, nr.nextNumber()));
        case "gain ¢ equal to the number of counters on this":
            return logic.noTargetSyncEffect(active.gainCoinsBasedOnCountersEffect(game));
        case "you and that player each loot x":
            return logic.noTargetSyncEffect(active.chooseAnotherPlayerAndLootXEffect(game, nr.nextNumber()));
        case "attack rolls of x against this count as a hit and combat damage it takes on them is doubled":
            return logic.noTargetSyncEffect(monster.attackRollsAgainstThisCountAsHitAndCombatDamageDoubledEffect(game, [nr.nextNumber()]));
        case "change the result of a dice roll to a x":
            return { effectFunction: active.changeRollDiceResultEffect(game), targetSelectors: selectRollAndNumber(game, [nr.nextNumber()]) };
        case "change the result of a dice roll to a x or x":
            return { effectFunction: active.changeRollDiceResultEffect(game), targetSelectors: selectRollAndNumber(game, [nr.nextNumber(), nr.nextNumber()]) };
        case "when this is destroyed, gain x treasure":
            return logic.noTargetSyncEffect(passive.gainTreasureOnDestroyEffect(game, nr.nextNumber()));
        case "when this is destroyed, gain x¢ and loot x, where x is equal to the number of counters on this":
            return logic.noTargetSyncEffect(passive.gainCoinsAndLootOnDestroyBasedOnCountersEffect(game));
        case "each time another player purchases a shop item, gain x¢ and loot x":
            return logic.noTargetSyncEffect(passive.onAnotherPlayerEventEffect("on:purchase:success", [active.gainCoinsEffect(game, nr.nextNumber(), "issuer", [false]), active.lootCardsEffect(game, nr.nextNumber())], game, s, (data:EffectData, e:any) => e.index !== "top"));
        case "each time you purchase from the shop or treasure deck, gain x¢":
            return logic.noTargetSyncEffect(passive.onYourEventEffect("on:purchase:success", [active.gainCoinsEffect(game, nr.nextNumber(), "issuer", [false])], game, s, false));
        case "damage you would take is reduced to x":
            return logic.noTargetSyncEffect(passive.reduceDamageToXEffect(game, nr.nextNumber()));
        case "when you would roll a x, you may change the result to a x":
            return logic.noTargetSyncEffect(passive.changeRollXToYEffect(game, nr.nextNumber(), [nr.nextNumber()]));
        case "when you would roll a x, you may change the result to a x or x":
            return logic.noTargetSyncEffect(passive.changeRollXToYEffect(game, nr.nextNumber(), [nr.nextNumber(), nr.nextNumber()]));
        case "destroy all souls. each player discards their hand and loots x":
            return logic.noTargetSyncEffect(active.combineSyncEffectFunctions([active.destroyAllSoulsEffect(game), room.discardHandsAndLootEffect(game, nr.nextNumber())]));
        case "if you would loot, except during the loot step, instead loot that much x":
            return logic.noTargetSyncEffect(passive.lootPlusXExceptLootStepEffect(game, nr.nextNumber()));
        case "when you start the game, look at the top x cards of the treasure deck and choose one. it becomes your starting item and gains eternal. put the rest on the bottom of the treasure deck":
            return logic.noTargetSyncEffect(passive.startingItemEffect(game, nr.nextNumber()));
        case "before a dice is rolled, choose a number. if the next roll is that number, loot x":
            return { effectFunction: passive.lootOnNextRollEffect(game, nr.nextNumber()), targetSelectors: [...selectDiceWillRoll(game),...selectNumber1to6()] };
        case "when you roll an attack roll of x, end your turn. cancel everything that hasn't resolved":
            return logic.noTargetSyncEffect(passive.endTurnOnAttackRollXEffect(game, nr.nextNumber()));
        case "the next time a player would roll a dice, they instead roll x dice. you choose one of the rolls as the result":
            return logic.noTargetSyncEffect(passive.rollXChoose1Effect(game, nr.nextNumber(), true, "issuer"));
        case "each character is named isaac, and each item has \" ↷ : choose a dice roll. its controller rerolls it\" and eternal and loses all other abilities":
            return logic.noTargetSyncEffect(passive.isaacEffect(game));
        case "choose a player. till the start of their next turn, their character is named chicken and must be attacked once by other active players on their turns if able. the chosen player has x+ [dc] for the attacks":
            return { effectFunction: passive.chickenEffect(game, nr.nextNumber()), targetSelectors: selectPlayer(game) };
        case "you gain x [hp] till the end of turn":
        case "you gain x [hp] till end of turn":
        case "gain x [hp] till end of turn":
            return logic.noTargetSyncEffect(passive.temporaryStatModifierEffect([game.entityHandler.addHealth.bind(game.entityHandler)], nr.nextNumber(), game, "issuer"));
        case "choose a player.\nthey gain x [hp] till end of turn":
            return { effectFunction: passive.temporaryStatModifierEffect([game.entityHandler.addHealth.bind(game.entityHandler)], nr.nextNumber(), game, "next"), targetSelectors: selectPlayer(game) };
        case "choose a player.\nthey gain x [atk] and x [hp] till end of turn":
            return { effectFunction: passive.temporaryStatModifierEffect([game.entityHandler.addAttack.bind(game.entityHandler), game.entityHandler.addHealth.bind(game.entityHandler)], nr.nextNumber(), game, "next"), targetSelectors: selectPlayer(game) };
        case "choose a player.\nthey gain x [atk] and x to dice rolls till end of turn":
            return { effectFunction: passive.temporaryStatModifierEffect([game.entityHandler.addAttack.bind(game.entityHandler), game.entityHandler.addDiceModifier.bind(game.entityHandler)], nr.nextNumber(), game, "next"), targetSelectors: selectPlayer(game) };
        case "choose a player.\nthey gain x [atk] till end of turn and may attack an additional time this turn":
            return { effectFunction: passive.temporaryStatModifierEffect([game.entityHandler.addAttack.bind(game.entityHandler), game.entityHandler.addAttackThisTurn.bind(game.entityHandler)], nr.nextNumber(), game, "next"), targetSelectors: selectPlayer(game) };
        case "you have x [hp] while this has a counter on it":
            return logic.noTargetSyncEffect(passive.ConditionalStatModifierEffect([game.entityHandler.addHealth.bind(game.entityHandler)], nr.nextNumber(), (player, card) => card.counters.value("normal") > 0, ["on:counter:modified"], game, false ));
        case "choose a player. prevent the next x damage they would take this turn. till end of turn, when that player dies, deal x damage to each player other than that player and you":
            return { effectFunction: passive.preventDamageAndDealOnDeathEffect(game, nr.nextNumber(), nr.nextNumber()), targetSelectors: selectAlivePlayer(game) };
        case "you have x to attack rolls":
            return logic.noTargetSyncEffect(passive.permanentStatModifierEffect([game.entityHandler.addAttackDiceModifier.bind(game.entityHandler)], nr.nextNumber(), game));
        case "monsters have x [dc] on your turn":
            return logic.noTargetSyncEffect(passive.onYourTurnModifier([game.entityHandler.addDCToEachMonster.bind(game.entityHandler)], nr.nextNumber(), game));
        case "monsters have -x [dc] on your turn":
            return logic.noTargetSyncEffect(passive.onYourTurnModifier([game.entityHandler.reduceDCOfEachMonster.bind(game.entityHandler)], -nr.nextNumber(), game));
        case "your attack rolls of x or x count as misses":
            return logic.noTargetSyncEffect(passive.attackRollCountsAsMissEffect(game, [nr.nextNumber(), nr.nextNumber()]));
        case "you have x to the xst, xrd and xth attack roll you make each turn":
            return logic.noTargetSyncEffect(passive.firstAttackRollsModifierEffect(game, nr.nextNumber(), [nr.nextNumber(), nr.nextNumber(), nr.nextNumber()]));
        case "prevent all damage you would take till end of turn. when you roll a x-x this turn, cancel everything that hasn't resolved and end the turn":
            return logic.noTargetSyncEffect(passive.preventAllDamageAndEndTurnOnRollEffect(game, [nr.nextNumber(), nr.nextNumber()]));
        case "monsters have x [atk] on your turn":
            return logic.noTargetSyncEffect(passive.onYourTurnModifier([game.entityHandler.addAttackToEachMonster.bind(game.entityHandler)], nr.nextNumber(), game));
        case "look at the top x cards of the monster or room deck and put them back in any order":
            return { effectFunction: active.lookAndReorderTopCardsEffect(game, nr.nextNumber(), undefined, "dataIssuer"), targetSelectors: selectDeck(game, 1, 1, (name) => ["room", "monster"].includes(name)) };
        case "before a dice is rolled, choose a number. till the end of turn, each time that number is rolled, deal x damage to a monster or player":
            return { effectFunction: passive.chosenumberDamageOnRollThisTurnEffect(game, nr.nextNumber()), targetSelectors: [...selectDiceWillRoll(game),... selectNumber1to6()] };
        case "you may attack an additional time this turn":
            return logic.noTargetSyncEffect(active.giveAdditionalAttackThisTurnEffect(game, 1));
        case "put counters on this equal to the amount of damage taken. then, if this has x+ counters, remove x counters from this and gain x treasure":
            return logic.noTargetSyncEffect(active.addCountersAndGainTreasureEffect(nr.nextNumber(), nr.nextNumber(), nr.nextNumber(), game));
        case "add or subtract x from a roll":
            return { effectFunction: active.addOrSubtractXFromRollEffect(game), targetSelectors: selectRollAddOrSubtract(game, nr.nextNumber()) };
        case "return this to the hand of the player who played it":
        case "return this to your hand":
            return logic.noTargetSyncEffect(active.returnThisLootToHand(game));
        case "if this has x+ counters, it becomes a soul and loses all abilities":
        case "then, if this has x+ counters, it becomes a soul and loses all abilities":
            return logic.noTargetSyncEffect(active.becomeSoulIfAboveXCountersEffect(nr.nextNumber(), game));
        case "if you would gain any number of treasures, instead gain that many x":
            return logic.noTargetSyncEffect(passive.gainPlusTreasureEffect(game, nr.nextNumber()));
        case "each non-active player rolls:\nx-x: they must make an attack roll against this after each attack roll the active player makes this attack":
            const n1 = nr.nextNumber();
            const n2 = nr.nextNumber();
            return logic.noTargetSyncEffect(room.onAttackDeclaredNonActivePlayersRollToJoinEffect(game, Math.min(n1, n2), Math.max(n1, n2)));
        case "the player attacking this gains its reward, then you flip it. that player may attack an additional time this turn":
            return logic.noTargetSyncEffect(active.flipAndAddAttackEffect(game));
        case "[paid effect]":
        case "":
            return logic.noTargetSyncEffect(active.trueEffect());
        case "each time you roll the same result twice in a row on an attack roll on the same turn, kill the monster you're attacking":
            return logic.noTargetSyncEffect(passive.killOnDoubleAttackRollEffect(game));
        case "the next time a player would loot, they loot from the top of the loot discard instead":
            return logic.noTargetSyncEffect(passive.lootFromDiscardEffect(game));
        case "if you control this as the game starts, you go first":
            return logic.noTargetSyncEffect(passive.goFirstInTurnOrderEffect(game));
        case "this has the abilities of other items with gold counters on them":
            return logic.noTargetSyncEffect(passive.copyAbilitiesFromGoldCounterItemsEffect(game));
        case "this enters play deactivated":
            return logic.noTargetSyncEffect(passive.enterPlayDeactivatedEffect(game));
        case "take x damage and put a counter on this. then, if this has x+ counters, it becomes a soul and loses all abilities":
            return logic.noTargetSyncEffect(active.takeDamageAndAddCounterEffect(game, nr.nextNumber(), nr.nextNumber()));
        case "cancel your attack":
        case "cancel your attack on a monster":
            return logic.noTargetSyncEffect(active.cancelAttackOnMonsterEffect(game));
        case "this kills the current player":
            return logic.noTargetSyncEffect(active.killCurrentPlayerEffect(game));
        case "kill a monster named mom, mom's heart, or it lives":
            return {effectFunction: active.killMonsterEffect(game), targetSelectors: selectMomMonster(game)}
        case "choose a non-active player. the next time the active player declares an attack this turn, the chosen player must make an attack roll after each attack roll the active player makes for the attack. if that monster dies this attack, the chosen player also gains the rewards":
            return { effectFunction: active.nonActivePlayerHelpFight(game), targetSelectors: selectAliveNonActivePlayer(game) };
        case "choose a player. each item they control gains eternal till end of turn":
            return { effectFunction: passive.gainEternalTillEndOfTurnEffect(game), targetSelectors: selectPlayer(game) };
        case "prevent all non-combat damage you would take":
            return logic.noTargetSyncEffect(passive.preventNonCombatDamageEffect(game));
        case "flip this item":
            return logic.noTargetSyncEffect(active.flipThisItemEffect(game));
        case "you don't lose ¢ or discard loot cards when paying the death penalty":
            return logic.noTargetSyncEffect(passive.noDeathPenaltyCoinsAndLootEffect(game));
        case "if this would be destroyed, it becomes a soul instead":
            return logic.noTargetSyncEffect(passive.becomeSoulInsteadOfDestructionEffect(game));
        case "the first time you take damage each turn, you may recharge an item":
            return logic.noTargetSyncEffect(passive.onFirstDamageEachTurnEffect([active.rechargeItemsEffect(game, true, [true], selectItem(game)[0])], game));
        case "if another player would pay the death penalty, you choose what item they would destroy and you gain any loot cards and ¢ they would lose":
            return logic.noTargetSyncEffect(passive.replaceDeathPenaltyEffect(game));
        case "choose a player or monster. prevent the next instance of damage they would take this turn":
            return { effectFunction: passive.preventNextDamageUpToEffect(INFINITY, game), targetSelectors: selectPlayerOrMonster(game) };
        case "choose a monster. prevent the next instance of damage it would take this turn":
            return { effectFunction: passive.preventNextDamageUpToEffect(INFINITY, game), targetSelectors: selectMonster(game) };
        case "choose a player. till end of turn, if they would loot any number of loot cards, they loot double that number instead":
            return { effectFunction: passive.lootDoubleThisTurnEffect(game), targetSelectors: selectPlayer(game) };
        case "other players can't play loot cards or activate items on your turn":
            return logic.noTargetSyncEffect(passive.noPriorityPassesOnYourTurnEffect(game));
        case "other players can't play loot cards or activate items till end of turn":
            return logic.noTargetSyncEffect(passive.noPriorityPassesTillEndOfTurnEffect(game));
        case "copy a non-trinket, non-ambush loot being played":
            return {effectFunction: active.copyNonTrinketNonAmbushLootOnStackEffect(game), targetSelectors: selectLootOnStack(game, 1, 1, false, false)};
        case "the next time you play a non-trinket, non-ambush loot card this turn, copy it":
            return logic.noTargetSyncEffect(passive.copyNextNonTrinketNonAmbushLootThisTurnEffect(game));
        case "ambush":
            return {effectFunction: active.ambushEffect(game), targetSelectors: selectCoverableMonster(game)};
        case "you and that player or monster each takes x damage":
            const damage = nr.nextNumber();
            return logic.noTargetSyncEffect(active.combineSyncEffectFunctions([active.dealDamageToTargetEffect(game, damage, false, [], "issuer"), active.takeDamageEffect(game, damage, true)]));
        case "that player or monster take x damage":
            return logic.noTargetSyncEffect(active.dealDamageToTargetEffect(game, nr.nextNumber(), false, [], "issuer"));
        case "each other player plays with their hand revealed":
            return logic.noTargetSyncEffect(passive.eachOtherPlayerRevealsHandEffect(game));
        case "if another player declares an attack on a monster, you may choose which monster they attack":
            return logic.noTargetSyncEffect(passive.chooseMonsterWhenAnotherPlayerAttacksMonsterEffect(game));
        case "play x additional loot card this turn":
            return logic.noTargetSyncEffect(passive.temporaryStatModifierEffect([game.entityHandler.addLootPlay.bind(game.entityHandler)], nr.nextNumber(), game, "issuer"));
        case "play an additional loot card this turn":
            return logic.noTargetSyncEffect(passive.temporaryStatModifierEffect([game.entityHandler.addLootPlay.bind(game.entityHandler)], 1, game, "issuer"));
        case "if this would be destroyed, if it has no counters on it, put a counter on it instead":
            return logic.noTargetSyncEffect(passive.putCounterInsteadOfDestructionEffect(game));
        case "if you would take damage while this has counters on it, remove that many counters and prevent that much damage":
            return logic.noTargetSyncEffect(passive.preventDamageByRemovingCountersEffect(game));
        case "if you would gain any amount of ¢, this levels up by that much instead":
            return logic.noTargetSyncEffect(passive.gainCoinsLevelUpEffect(game));
        case "each time a player dies, this levels up":
            return logic.noTargetSyncEffect(passive.onAnyEventEffect("on:death:penalty", [(data:EffectData): boolean => { game.cardHandler.addToCounter(data.issuer, data.it, "normal", 1); return true; }], game, nr.masked));
        case "this levels up":
            return logic.noTargetSyncEffect(active.putCountersOnItemEffect(1, "normal", game));
        case "rewards are doubled till end of turn":
            return logic.noTargetSyncEffect(passive.doubleRewardsTillEndOfTurnEffect(game));
        case "you may look at the top card of the treasure deck at any time on your turn":
            return logic.noTargetSyncEffect(passive.onYourTurnModifier([game.entityHandler.addCanSeeTopOfTreasureDeck.bind(game.entityHandler)], 1, game));
        case "you may purchase an additional time on your turn":
            return logic.noTargetSyncEffect(passive.onYourTurnModifier([game.entityHandler.addPurchaseThisTurn.bind(game.entityHandler)], 1, game));
        case "you may attack an additional time on your turn":
            return logic.noTargetSyncEffect(passive.onYourTurnModifier([game.entityHandler.addAttackThisTurn.bind(game.entityHandler)], 1, game));
        case "you may play an additional loot card on your turn":
            return logic.noTargetSyncEffect(passive.onYourTurnModifier([game.entityHandler.addLootPlay.bind(game.entityHandler)], 1, game));
        case "you may play up to x additional loot cards this turn":
            return logic.noTargetSyncEffect(passive.temporaryStatModifierEffect([game.entityHandler.addLootPlay.bind(game.entityHandler)], nr.nextNumber(), game, "issuer"));
        case "prevent death, heal to full [hp] , and cancel your attack":
            return logic.noTargetSyncEffect(active.preventDeathHealFullCancelAttackEffect(game));
        case "monster have -x [dc] on your turn, where x is the number of souls the player with the most souls controls minus the number of souls you control":
            return logic.noTargetSyncEffect(passive.soulDiffDCModifierOnYourTurnEffect(game));
        case "give another non-eternal item you control to another player": 
            return { effectFunction: active.giveItemToAnotherPlayerEffect(game), targetSelectors: [selectAnotherItemYouControl(game)[0]!, selectAnotherPlayer(game)[0]!] };
        case "put a monster not being attacked under this if there are no cards under this":
            return { effectFunction: active.putMonsterUnderThisEffect(game), targetSelectors: selectMonsterNotBeingAttacked(game) };
        case "put the top card of any discard on top of its deck":
            return { effectFunction: active.putTopCardFromDiscardOnTopEffect(game), targetSelectors: selectTopAnyDiscard(game) };
        case "the first time each turn another player plays a loot card that targets you or something you control, you may cancel it":
            return logic.noTargetSyncEffect(passive.cancelLootCardThatTargetsYouEffect(game));
        case "choose a dice roll. its controller rerolls it":
            return { effectFunction: active.rerollDiceEffect(), targetSelectors: selectRoll(game) };
        case "recharge your character":
            return logic.noTargetSyncEffect(active.rechargeCharaEffect(game, youMayEffectHanging));
        case "cancel an attack. that player may attack an additional time this turn":
            return { effectFunction: active.cancelAttackAndAttackAgain(game), targetSelectors: selectPlayerInCombat(game)}
        case "cancel an attack on a monster and put that monster card on the bottom of the monster deck":
            return { effectFunction: active.cancelAttackAndPutMonsterOnBottomEffect(game), targetSelectors: selectMonsterBeingAttacked(game) };
        case "cancel the attack":
        case "cancel an attack against this":
            return logic.noTargetSyncEffect(monster.cancelAttackAgainstThis(game))
        case "force that player to reroll it":
            return logic.noTargetSyncEffect(active.forcePlayerRerollDiceEffect(game));
        case "destroy a curse":
            return { effectFunction: active.destroyCurseEffect(game, false), targetSelectors: selectCurse(game) };
        case "the next time your turn ends, destroy a non-eternal item you control":
            return logic.noTargetSyncEffect(active.destroyYourItemOnYourNextTurnEndEffect(game));
        case "deactivate each item you control and your character":
            return logic.noTargetSyncEffect(active.deactivateAllYourItemsAndCharaEffect(game));
        case "discard your hand":
            return logic.noTargetSyncEffect(active.discardHandEffect(game));
        case "loot equal to the number of cards discarded":
            return logic.noTargetSyncEffect(active.lootEqualToCardsDiscardedEffect(game));
        case "when this would take damage, each living player votes either whip or whiff-\nif whip wins, prevent the damage this would take and each non-active player takes x damage.\nif whiff wins or there is a tie, the active player loots x":
            return logic.noTargetSyncEffect(passive.voteOnWhipOrWhiffEffect(game, nr.nextNumber(), nr.nextNumber()));
        case "gain double the number of ¢ you would've gained":
            return logic.noTargetSyncEffect(active.modifyCoinGainedEffect(game, (original) => original * 2));
        case "swap this with a non-eternal item another player controls":
            return {
              effectFunction: active.swapWithNonEternalItemEffect(game),
              targetSelectors: selectAnotherPlayerNonEternalItem(game),
            };
        case "put a bounty counter on a monster":
            return { effectFunction: active.putCountersOnMonsterEffect(1, "bounty", game), targetSelectors: selectMonster(game)};
        case "monsters with a bounty counter on them get -x [dc]":
            const dcRed = nr.nextNumber();
            return logic.noTargetSyncEffect(passive.onAnyEventEffect("on:counter:modified", [], game, s, (ef: EffectData, ev: OnCounterModifiedData) => {
                if(ev.counterName !== "bounty") return false;
                if(ev.previousValue > 0) return false;
                if(ev.newValue < 0) return false;
                if(ev.receiver instanceof MonsterCard === false || ev.receiver.entity === undefined) return false;
                if(ev.newValue > 0)
                    game.entityHandler.addDC(ev.receiver.entity, -dcRed);
                if(ev.newValue === 0)
                    game.entityHandler.addDC(ev.receiver.entity, dcRed);
                return true;
            }    
            ));
        case "flip a dice roll":
            return { effectFunction: active.flipDiceRollEffect(game), targetSelectors: selectRoll(game) };
        case "each time a monster with a bounty counter on it dies, gain x¢":
            return logic.noTargetSyncEffect(passive.onAnyEventEffect("on:death:monster", [], game, s, (ef: EffectData, ev: OnDeathMonsterData) => {
                if(ev.eventIssuer instanceof Monster === false) return false;
                if(ef.issuer instanceof Player === false) return false;
                if(ev.eventIssuer.card.counters.value("bounty") <= 0) return false;
                game.gainCoins(ef.issuer, nr.nextNumber(), ef.it);
                return true;
            }    
            ));
        case "choose a non-eternal item. this becomes a copy of that item.\n(this change is indefinite.)":
            return { effectFunction: active.becomesCopyOfItemIndefinitelyEffect(game), targetSelectors: selectNonEternalItemFromAnywhere(game) };
        case "choose a non-eternal passive item. this becomes a copy of that item till end of turn":
            return { effectFunction: active.becomesCopyOfItemUntilEndOfTurnEffect(game), targetSelectors: selectNonEternalPassiveItem(game) };
        case "choose a shop item. this becomes a copy of that item till the start of your next turn. recharge this":
            return { effectFunction: active.becomesCopyOfItemUntilStartOfYourNextTurnAndRechargeEffect(game), targetSelectors: selectShopItem(game) };
        case "put this into discard": // this should be only used in events
            return logic.noTargetSyncEffect(active.putThisIntoDiscardEffect(game));
        case "steal a non-eternal item from a player":
            return { effectFunction: active.stealNonEternalItemEffect(game), targetSelectors: selectAnotherPlayerNonEternalItem(game) };
        case "steal a non-eternal item a player controls":
            return { effectFunction: active.stealNonEternalItemEffect(game), targetSelectors: selectNonEternalItem(game) };
        case "loot equal to the number of cards discarded in this way":
            return logic.noTargetSyncEffect(active.lootEqualToCardsDiscardedEffect(game));
        case "abilities and the death penalty can't make you discard loot cards or lose ¢":
            return logic.noTargetSyncEffect(passive.noLootDiscardOrCoinLossEffect(game));
        case "die":
        case "you die":
        case "this dies":
            return logic.noTargetSyncEffect(active.dieEffect(game));
        case "choose a player. loot and gain ¢ until you have the same number of each as they do":
            return { effectFunction: active.lootAndGainAsPlayerEffect(game), targetSelectors: selectPlayer(game) };
        case "it becomes a soul.\n(it's no longer an item.)":
            return logic.noTargetSyncEffect(active.enterPlayBecomeSoulEffect(game));
        case "put each monster not being attacked into discard and replace each with the top card of the monster deck":
            return logic.noTargetSyncEffect(active.flushMonsterSlotsEffect(game, "discardAndDraw"));
        case "put each monster not being attacked on the bottom of the monster deck":
            return logic.noTargetSyncEffect(active.flushMonsterSlotsEffect(game, "bottom"));
        case "if the active player is the only living player, they win":
            return logic.noTargetSyncEffect(active.ifOnlyActivePlayerAliveTheyWinEffect(game));
        case "deals x damage to a player chosen at random":
            return logic.noTargetSyncEffect(active.dealDamageToRandomPlayerEffect(game, nr.nextNumber(), "any", "current"));
        case "this deals x damage to a player chosen at random":
            return logic.noTargetSyncEffect(active.dealDamageToRandomPlayerEffect(game, nr.nextNumber(), "any"));
        case "deal x damage to a non-active player chosen at random":
            return logic.noTargetSyncEffect(active.dealDamageToRandomPlayerEffect(game, nr.nextNumber(), "non-active"));
        case "look at the top card of a deck. you may put that card on the bottom of that deck":
            return { effectFunction: active.lookAtTopCardOfDeckEffect(game, "bottom", false, false), targetSelectors: selectDeck(game) };
        case "look at the top card of a deck. you may put it into discard or put it back on top":
            return { effectFunction: active.lookAtTopCardOfDeckEffect(game, "discard", false, false), targetSelectors: selectDeck(game) };
        case "choose a player. they reroll each item they control":
            return { effectFunction: active.rerollEachItemEffect(game), targetSelectors: selectPlayer(game) };
        case "steal a loot card from them at random":
            return logic.noTargetSyncEffect(active.stealRandomLootCardEffect(game));
        case "choose a monster. the active player must attack that monster this turn if able":
            return { effectFunction: active.forceAttackMonsterEffect(game), targetSelectors: selectAttackableMonster(game) };
        case "you may play any number of additional loot cards till end of turn":
            return logic.noTargetSyncEffect(active.playUnlimitedLootCardsThisTurnEffect(game));
        case "recharge each item you control":
            return { effectFunction: active.rechargeEachItemsOfTargetEffect(game, "issuer"), targetSelectors: selectPlayer(game) };
        case "recharge each item a player controls":
        case "choose a player. recharge each item they control":
            return { effectFunction: active.rechargeEachItemsOfTargetEffect(game, "next"), targetSelectors: selectPlayer(game) };
        case "loot x, where x is the number of souls the player with the most souls controls minus the number of souls you control":
            return logic.noTargetSyncEffect(active.lootBasedOnSoulsComparedToPlayerWithMostSoulsEffect(game));
        case "put the top card of each deck into discard":
            return logic.noTargetSyncEffect(active.putTopCardOfEachDeckIntoDiscardEffect(game));
        case "loot x, where x is equal to the number of loot cards in your hand":
            return logic.noTargetSyncEffect(active.doubleCardsInHandEffect(game));
        case "choose a player. they gain x¢, where x is the number of ¢ they have":
            return {effectFunction: active.doubleTargetCoins(game), targetSelectors: selectPlayer(game)};
        case "this becomes a copy of an eternal item you control. this loses eternal":
            return { effectFunction: active.becomesCopyOfEternalItemLosesEternalEffect(game), targetSelectors: selectEternalItemYouControl(game) };
        case "each player gives their hand to the player to their left":
            return logic.noTargetSyncEffect(active.passHandsLeftEffect(game));
        case "steal a non-eternal item from a player or from the shop":
            return { effectFunction: active.stealNonEternalItemFromAnywhereEffect(game), targetSelectors: selectNonEternalItemFromAnywhere(game) };
        case "steal all shop items":
            return logic.noTargetSyncEffect(active.stealAllShopItemsEffect(game));
        case "this becomes a soul and loses all abilities":
            return logic.noTargetSyncEffect(active.BecomesSoulEffect(game));
        case "put this on the bottom of the loot deck":
            return logic.noTargetSyncEffect(active.putThisOnBottomOfLootDeckEffect(game));
        case "you may play up to x additional loot cards this turn, where x is the number of souls you control":
            return logic.noTargetSyncEffect(active.gaineLootPlayPerSoul(game));
        case "take an extra turn after this one":
            return logic.noTargetSyncEffect(active.takeExtraTurnEffect(game, false));
        case "take an extra turn after this one if it's your turn":
            return logic.noTargetSyncEffect(active.takeExtraTurnEffect(game));
        case "choose a dice roll. its controller rerolls it":
            return { effectFunction: active.rerollDiceByControllerEffect(game), targetSelectors: selectRoll(game) };
        case "give this to the player to your left":
            return logic.noTargetSyncEffect(active.giveThisToPlayerOnLeftEffect(game));
        case "change the result of a dice roll to a number of your choosing":
            return { effectFunction: active.changeRollDiceResultEffect(game), targetSelectors: selectRollAndNumber(game, [1, 2, 3, 4, 5, 6]) };
        case "reroll each item you control":
            return logic.noTargetSyncEffect(active.rerollEachItemEffect(game, "issuer"));
        case "your character doesn't recharge during your recharge step":
            return logic.noTargetSyncEffect(passive.noRechargeCharaDuringRechargeStepEffect(game));
        case "put each shop item on the bottom of the treasure deck":
            return logic.noTargetSyncEffect(active.flushShopEffect(game, "bottom"));
        case "recharge this":
            return logic.noTargetSyncEffect(active.rechargeThisEffect(game));
        case "this becomes a soul. gain it":
            return logic.noTargetSyncEffect(active.thisBecomeSoulGainItEffect(game));
        case "gain x¢, where x is the number of monster slots plus the number of loot cards in your hand":
            return logic.noTargetSyncEffect(active.gainCoinsBasedOnMonsterSlotsAndLootInHandEffect(game));
        case "loot x, where x is the number of loot cards in that player's hand":
            return logic.noTargetSyncEffect(active.lootBasedOnTargetPlayersLootCardsEffect(game));
        case "put this in the monster deck x cards from the top":
            return logic.noTargetSyncEffect(monster.putInMonsterDeckNFromTopEffect(game, nr.nextNumber()));
        case "each time this deals combat damage to the attacking player, it deals x damage to each other player":
            return logic.noTargetSyncEffect(passive.onAnyEventEffect("on:damage:taken", [active.dealDamageToEachPlayerEffect(game, nr.nextNumber(), false)], game, s, 
            (ef:EffectData, ev:OnDamageTakenData) => { 
                return ef.issuer === ev.target && ev.eventIssuer === game.currentPlayer && ev.source instanceof DiceRoll;}, false));
        case "when this dies, it deals x damage to the player who killed it":
            return logic.noTargetSyncEffect(monster.dealDamageToKillerOnDeathEffect(game, nr.nextNumber()));
        case "put it in the monster deck x cards from the top":
            return logic.noTargetSyncEffect(monster.putInMonsterDeckNFromTopEffect(game, nr.nextNumber()));
        case "double its rewards":
            return logic.noTargetSyncEffect(monster.doubleRewardsOnDeathRollEffect(game));
        case "it deals x damage to each player":
            return logic.noTargetSyncEffect(active.dealDamageToEachPlayerEffect(game, nr.nextNumber()));
        case "deal x damage to each monster and player":
            return logic.noTargetSyncEffect(active.dealDamageToEachMonsterAndPlayerEffect(game, nr.nextNumber()));
        case "it deals x damage to each non-active player":
            return logic.noTargetSyncEffect(active.dealDamageToEachPlayerEffect(game, nr.nextNumber(), false));
        case "this gains x [dc] till end of turn":
            return logic.noTargetSyncEffect(passive.temporaryStatModifierEffect([game.entityHandler.addDC.bind(game.entityHandler)], nr.nextNumber(), game, "issuer"));
        case "this gains x [atk] till end of turn":
        case "it gains x [atk] till end of turn":
            return logic.noTargetSyncEffect(passive.temporaryStatModifierEffect([game.entityHandler.addAttack.bind(game.entityHandler)], nr.nextNumber(), game, "issuer"));
        case "other monsters have x [dc]":
            return logic.noTargetSyncEffect(monster.monstersGainDCEffect(game, nr.nextNumber(), false));
        case "monsters have x [dc]":
            return logic.noTargetSyncEffect(monster.monstersGainDCEffect(game, nr.nextNumber(), true));
        case "monsters have x [hp]":
            return logic.noTargetSyncEffect(monster.monstersGainHPEffect(game, nr.nextNumber()));
        case "it heals x [hp]":
            return logic.noTargetSyncEffect(active.healEffect(game, nr.nextNumber()));
        case "look at the top x cards of the monster deck and put them back in any order":
            return logic.noTargetSyncEffect(active.lookAndReorderTopCardsEffect(game, nr.nextNumber(), "monster", "currentPlayer"));
        case "kill the player to your right":
            return logic.noTargetSyncEffect(monster.killPlayerToTheEffect(game, "right"));
        case "kill the player to your left":
            return logic.noTargetSyncEffect(monster.killPlayerToTheEffect(game, "left"));
        case "deal x damage to the player to your left":
        case "the player to your left takes x damage":
        case "deal x damage to the player to the active player's left":
            return logic.noTargetSyncEffect(monster.dealDamageToPlayerToTheEffect(game, nr.nextNumber(), "left"));
        case "the players to the active player's left and right take x damage":
            const dam = nr.nextNumber();
            return logic.noTargetSyncEffect(active.combineSyncEffectFunctions([
                monster.dealDamageToPlayerToTheEffect(game, dam, "left"), 
                monster.dealDamageToPlayerToTheEffect(game, dam, "right")]));
        case "the player to your right takes x damage":
        case "deal x damage to the player to your right":
            return logic.noTargetSyncEffect(monster.dealDamageToPlayerToTheEffect(game, nr.nextNumber(), "right"));
        case "when any player controls a soul, players who control the most souls or tied for the most must pay each other player x¢ to attack":
            return logic.noTargetSyncEffect(room.payOtherPlayersToAttackEffect(game, nr.nextNumber()));
        case "this takes no combat damage on every other attack roll made against it":
            return logic.noTargetSyncEffect(monster.noCombatDamageEveryOtherAttackRollEffect(game));
        case "each player who controls the most items or tied for the most dies":
            return logic.noTargetSyncEffect(monster.playersWithMostItemsDieEffect(game));
        case "after each attack roll the active player makes against this, each other player in turn order makes an attack roll against this":
            return logic.noTargetSyncEffect(monster.attackRollsAgainstEachOtherPlayerEffect(game));
        case "the player who kills this gains its rewards":
            return logic.noTargetSyncEffect(monster.killerGainsRewardsEffect(game));
        case "put each other monster into discard":
            return logic.noTargetSyncEffect(monster.discardEachOtherMonsterEffect(game));
        case "put a card named the harbingers from outside the game into a monster slot not being attacked":
            return logic.noTargetSyncEffect(monster.putHarbingersIntoMonsterSlotEffect(game));
        case "if this has x+ counters, flip it":
            return logic.noTargetSyncEffect(monster.flipIfXCountersEffect(game, nr.nextNumber()));
        case "then, if there are x+ counters on it, it dies":
            return logic.noTargetSyncEffect(monster.dieIfXCountersEffect(game, nr.nextNumber()));
        case "if this would die, instead put a counter on this, the active player gains x treasure, cancels their attack and this heals to full [hp]":
            return logic.noTargetSyncEffect(monster.preventDeathGainTreasureCancelAttackAndHealEffect(game, nr.nextNumber()));
        case "if it dealt combat damage to a player this turn, put it in a monster slot at the end of the turn":
            return logic.noTargetSyncEffect(monster.putInMonsterSlotAtEndOfTurnIfDealtCombatDamageEffect(game));
        case "when this is flipped to this side or attacked, each player rolls-\neach player who rolls the lowest or tied for the lowest dies":
            return logic.noTargetSyncEffect(monster.onFlipOrAttackedRollLowestDieEffect(game));
        case "at the start of each other players turn, you may offer to high-five them. if they accept, they take no combat damage on attack rolls of x or x till end of turn":
            return logic.noTargetSyncEffect(passive.offerHighFiveEffect(game, [nr.nextNumber(), nr.nextNumber()]));
        case "when this dies choose another player. they die":
            return logic.noTargetSyncEffect(monster.onDeathChoosePlayerToDieEffect(game));
        case "each time this would take damage, the active player rolls-\nx: prevent that damage":
            return logic.noTargetSyncEffect(monster.preventDamageOnRollEffect(game, [nr.nextNumber()]));
        case "it deals x damage to each other monster":
            return logic.noTargetSyncEffect(monster.dealDamageToEachOtherMonsterEffect(game, nr.nextNumber()));
        case "it deals x damage to the attacking player":
            return logic.noTargetSyncEffect(monster.dealDamageToAttackingPlayerEffect(game, nr.nextNumber()));
        case "every other time this takes damage each turn, it gains x [dc] till end of turn":
            return logic.noTargetSyncEffect(monster.onEveryOtherDamageEffect(game, passive.temporaryStatModifierEffect([game.entityHandler.addDC.bind(game.entityHandler)], nr.nextNumber(), game, "issuer")));
        case "this only takes combat damage on attack rolls of x":
            return logic.noTargetSyncEffect(monster.onlyTakesCombatDamageOnAttackRollEffect(game, [nr.nextNumber()]));
        case "when the attacking player makes their second attack roll this turn, after combat damage, cancel the attack":
            return logic.noTargetSyncEffect(monster.cancelAttackAfterSecondAttackRollEffect(game));
        case "the first time this would die each turn, prevent death. this heals x [hp] and gains x [dc] and -x [atk] till end of turn":
            return logic.noTargetSyncEffect(monster.preventDeathFirstTimeEachTurnHealAndStatModifierEffect(game , nr.nextNumber(), nr.nextNumber(), -nr.nextNumber()));
        case "when this dies, the player that killed it discards their hand":
            return logic.noTargetSyncEffect(monster.killerDiscardsHandOnDeathEffect(game));
        case "when another monster dies, this dies":
            return logic.noTargetSyncEffect(monster.dieWhenAnotherMonsterDiesEffect(game));
        case "this can't be attacked":
            return logic.noTargetSyncEffect(monster.cantBeAttackedEffect(game));
        case "damage this deals to the active player is also dealt to the player to their left":
            return logic.noTargetSyncEffect(monster.damageDealtToActivePlayerAlsoToTheEffect(game, "left"));
        case "damage dealt to this is also dealt to the player to the active player's right":
            return logic.noTargetSyncEffect(monster.damageAlsoPlayerToTheEffect(game, "right"));
        case "when a player gains this soul, choose a player who controls the most souls or tied for the most. that player wins":
            return logic.noTargetSyncEffect(monster.whenThisSoulIsGainedEffect(game, [monster.playerWithMostSoulsWinsEffect(game, "current")]));
        case "you must attack on your turn if able":
            return logic.noTargetSyncEffect(monster.attackRequirementEachTurnEffect(game, "any", 1, "total"));
        case "damage dealt to this is also dealt to the player to the active player's left":
            return logic.noTargetSyncEffect(monster.damageAlsoPlayerToTheEffect(game, "left"));
        case "shop items the active player purchases cost x¢ less":
            return logic.noTargetSyncEffect(room.cheaperShopItemsEffect(game, nr.nextNumber()));
        case "each time a player declares an attack, before choosing what to attack, they may look at the top x cards of the monster deck and put them back in any order":
            return logic.noTargetSyncEffect(room.lookAtTopNOnAttackEffect(game, nr.nextNumber()));
        case "each time a player declares an attack, the active player rolls-\nx-x: this deals x damage to that player":
            return logic.noTargetSyncEffect(monster.dealDamageOnAttackDeclarationEffect(game, nr.nextNumber(),nr.nextNumber(), nr.nextNumber()));
        case "each time a player dies, put a counter on this":
            return logic.noTargetSyncEffect(passive.onAnyEventEffect("on:death:penalty", [(data:EffectData): boolean => { game.cardHandler.addToCounter(data.issuer, data.it, "normal", 1); return true; }], game, s));
        case "each time a player dies, each other player gains x¢":
            return logic.noTargetSyncEffect(room.gainCoinsOnPlayerDeathEffect(game, nr.nextNumber()));
        case "each time a player dies, each other player loots x":
            return logic.noTargetSyncEffect(room.lootOnPlayerDeathEffect(game, nr.nextNumber()));
        case "if the active player would gain this soul, they instead choose another player. that player gains this soul":
            return logic.noTargetSyncEffect(passive.redirectSoulGainEffect(game));
        case "each other player loots x":
            return logic.noTargetSyncEffect(active.eachPlayerLootsEffect(game, nr.nextNumber(), false));
        case "monsters have x [atk]":
            return logic.noTargetSyncEffect(room.monstersGainAttackEffect(game, nr.nextNumber(), true));
        case "a monster gains x [dc] till end of turn":
            return {
                effectFunction: passive.temporaryStatModifierEffect([game.entityHandler.addDC.bind(game.entityHandler)], nr.nextNumber(), game, "next"),
                targetSelectors: selectMonster(game),
            };
        case "a monster gains -x [dc] till end of turn":
            return {
                effectFunction: passive.temporaryStatModifierEffect([game.entityHandler.addDC.bind(game.entityHandler)], -nr.nextNumber(), game, "next"),
                targetSelectors: selectMonster(game),
            };
        case "note each goal as players complete them. this room can't be put into discard till x goals are completed.\nx. play x loot cards.\nx. kill x monsters.\nx. give at least x¢ to another player at one time.\nx. purchase x items.\nx. roll a x three times. when x goals are completed, each player gains x treasure":
            return logic.noTargetSyncEffect(room.socialGoalsEffect(game, nr.numbers));
        case "each player discards their hands and loots x":
            return logic.noTargetSyncEffect(room.discardHandsAndLootEffect(game, nr.nextNumber()));
        case "each time a player loots, they take x damage":
            return logic.noTargetSyncEffect(room.takeDamageOnLootEffect(game, nr.nextNumber()));
        case "players have x [hp]":
            return logic.noTargetSyncEffect(room.allPlayersPermanentStatModifierEffect([game.entityHandler.addHealth], nr.nextNumber(), game));
        case "each time a player deals damage to a monster, they deal x damage to the player to their left":
            return logic.noTargetSyncEffect(room.WhenDealDamageMonsterDealDamageToPlayerToTheEffect(game, nr.nextNumber(), "left"));
        case "at the start of the turn, the active player may gain x treasure":
            return logic.noTargetSyncEffect(room.mayGainTreasureAtStartOfTurnEffect(game, nr.nextNumber()));
        case "if the active player has x or fewer loot cards in their hand, they take x damage":
            return logic.noTargetSyncEffect(room.damageIfLowLootEffect(game, nr.nextNumber(), nr.nextNumber()));
        case "reroll each item in play, each player discards their hand and loots x. put each monster into discard":
            return logic.noTargetSyncEffect(room.enterPlayRerollItemsDiscardHandsLootAndFlushMonstersEffect(game, nr.nextNumber()));
        case "each time a player would roll a x or x, they may reroll it":
            return logic.noTargetSyncEffect(room.rerollOnXOrYEffect(game, [nr.nextNumber(), nr.nextNumber()]));
        case "players have x [atk]":
            return logic.noTargetSyncEffect(room.allPlayersPermanentStatModifierEffect([game.entityHandler.addAttack], nr.nextNumber(), game));
        case "at the start of the turn, the active player may pay [hp] until they have x [hp] . if they do, each time a monster dies this turn, they gain x treasure":
            return logic.noTargetSyncEffect(room.payHpForTreasureBoostEffect(game, nr.nextNumber(), nr.nextNumber()));
        case "players who control the fewest souls or tied for fewest have x [atk] and may attack an additional time on their turn":
            return logic.noTargetSyncEffect(room.playersWithFewestSoulsAttackBoostEffect(game, nr.nextNumber()));
        case "players can't gain souls":
            return logic.noTargetSyncEffect(room.preventGainSoulsEffect(game, "all"));
        case "you can't gain souls":
            return logic.noTargetSyncEffect(room.preventGainSoulsEffect(game, "issuer"));
        case "each time the active player attacks the top of the monster deck, after putting it in a monster slot, they may cancel their attack":
            return logic.noTargetSyncEffect(room.cancelAttackOnTopOfMonsterDeckEffect(game));
        case "rewards are doubled":
            return logic.noTargetSyncEffect(room.doubleRewardsEffect(game));
        case "when a player dies, if that player was attacked this turn, that player gives the active player the item they would destroy for the death penalty":
            return logic.noTargetSyncEffect(room.giveDeathPenaltyItemToActivePlayerEffect(game));
        case "the player who killed it kills another player":
            return logic.noTargetSyncEffect(room.targetNextKillsAnotherPlayerEffect(game));
        case "at the start of the turn, the active player may reroll an item they control":
            return logic.noTargetSyncEffect(room.mayRerollItemAtStartOfTurnEffect(game));
        case "each player rerolls each of their items":
            return logic.noTargetSyncEffect(active.rerollEachItemEffect(game, "eachPlayer"));
        case "put each shop item into discard":
            return logic.noTargetSyncEffect(active.flushShopEffect(game, "discard"));
        case "put each room into discard":
            return logic.noTargetSyncEffect(active.flushRoomEffect(game, "discard"));
        case "put each monster into discard":
            return logic.noTargetSyncEffect(active.flushMonsterSlotsEffect(game, "discard"));
        case "if a player would gain any amount of ¢, instead each player gains that much ¢":
            return logic.noTargetSyncEffect(room.eachPlayerGainsCoinsEffect(game));
        case "if the active player didn't purchase a shop item, they discard their hand":
            return logic.noTargetSyncEffect(room.discardHandIfNoShopPurchaseAtEndOfTurnEffect(game));
        case "each time a player gains a soul, they skip their next turn":
            return logic.noTargetSyncEffect(room.skipNextTurnOnSoulGainEffect(game));
        case "this item can be attacked":
        case "this room can be attacked":
            return logic.noTargetSyncEffect(room.canBeAttackedEffect(game));
        case "players who control the most items or tied for the most may only recharge one item during their recharge step":
            return logic.noTargetSyncEffect(passive.rechargeOneDuringRechargeStepEffect(game, 1, "mostsouls"));
        case "you can't recharge more than x item during your recharge step":
            return logic.noTargetSyncEffect(passive.rechargeOneDuringRechargeStepEffect(game, nr.nextNumber(), "issuer"));
        case "your max hand size is x":
            return logic.noTargetSyncEffect(passive.maxHandSizeEffect(game, nr.nextNumber()));
        case "when a player dies, before paying penalties, they must destroy an item they control":
            return logic.noTargetSyncEffect(room.playerMustDestroyItemOnDeathEffect(game));
        case "note each goal as players complete them":
            return logic.noTargetSyncEffect(active.trueEffect());
        case "players can't activate more than one ability each turn":
            return logic.noTargetSyncEffect(room.playersCanOnlyActivateOnceATurn(game));
        case "players can't play more than one loot card each turn":
            return logic.noTargetSyncEffect(room.playersCanOnlyPlayLootOnceATurn(game));
        case "choose a player. they put a random loot card from their hand under this. till end of turn, you may play that loot card without using a loot play":
            return { effectFunction: active.makePlayerPutRandomLootUnderThisEffect(game), targetSelectors: selectPlayer(game) };
        default:
            return null; // No match found
        }
}

/**
 * If the effect includes multiple effects separated by "if you do, ", "otherwise, ", ", then ", " and ", or "." (when not at the end of the sentence), we split the effect in multiple parts and parse them individually.
 *  Effects can be a combination of effects. Let's consider two effects A and B, separated by the following:
 * - "if you do, ": A is executed, and if it returns true, then B is executed.
 * - "otherwise, ": A is executed, and if it returns false, then B is executed.
 * - ", then "    : A is executed, and then B is executed regardless of the result of A.
 * - " and "      : A is executed, and if it returns true, then B is executed.
 * - "."*: A is executed, and then B is executed regardless of the result of A.
 * Note that "if you do, " and " and " are parsed the same.
 * Note that ", then " and "." are parsed the same.
 * Finally, " and " and "." are the last to be tried, as they are more likely to be part of the same effect and not a separator.
 */
function parseSplittedEffect(s: string, game: Game, nr: NumberRobustString, selectionOnResolve: boolean, youMayEffectHanging: boolean[]): ParsedEffect | null {
    if(s.includes("otherwise, ")){
        const parts = s.split(" otherwise, ");
        const firstParsed = effectParser(parts[0]!.trim(), game, selectionOnResolve);
        const secondParsed = effectParser(parts[1]!.trim(), game, selectionOnResolve);
        return {
            effectFunction: async (data:EffectData): Promise<boolean> => {
                if(!await firstParsed.effectFunction(data))
                    await secondParsed.effectFunction(data);
                return true;
            },
            targetSelectors: [...firstParsed.targetSelectors, ...secondParsed.targetSelectors]
        };
    }
    if(s.includes(" if you do, ")){
        const parts = s.split(" if you do, ");
        const firstParsed = effectParser(parts[0]!.trim(), game, selectionOnResolve);
        const secondParsed = effectParser(parts[1]!.trim(), game, selectionOnResolve);
        return {
            effectFunction: async (data:EffectData): Promise<boolean> => {
                if(await firstParsed.effectFunction(data))
                    await secondParsed.effectFunction(data);
                return true;
            },
            targetSelectors: [...firstParsed.targetSelectors, ...secondParsed.targetSelectors]
        };
    }
    if(s.includes(", then") 
        && s !== "they give you half of their ¢ and loot cards rounded down, then gives you an item."
        && s !== "choose a monster being attacked. heal that monster to full [hp] , then deal damage equal to the number of [hp] healed in this way to another monster. if it's not your turn, cancel the attack and the active player may make an additional attack this turn."
        && s !== "when this would deal combat damage to the active player, prevent it, then this deals 1 damage to a player chosen at random."
        && !s.startsWith("the player attacking this gains its reward, then you flip it.")
        ){
        const [first, ...rest] = s.split(", then");

        const firstTrimmed = first!.trim();
        const secondTrimmed = (rest.join(", then")).trim();
        const firstParsed = effectParser(firstTrimmed, game, selectionOnResolve, youMayEffectHanging);
        const secondParsed = effectParser(secondTrimmed, game, true, youMayEffectHanging);
        return {
            effectFunction: async (data:EffectData): Promise<boolean> => {
                await firstParsed.effectFunction(data); 
                await secondParsed.effectFunction(data);
                return true;
            },
            targetSelectors: firstParsed.targetSelectors
        };
    }
    // multiple effects separated by ., try to parse them individually.
    // To do so, replace by ", then " and parse again.
    if (s.indexOf(".") !== s.length - 1 && s.indexOf(".") !== -1) 
    {
        s = s.replace(".", ", then ");
        return effectParser(s, game, selectionOnResolve, youMayEffectHanging);
    }
    if(s.indexOf(" and ") !== -1)
    {
        s = s.replace(" and ", " if you do, ");
        return effectParser(s, game, selectionOnResolve, youMayEffectHanging);
    }
    if (s.indexOf(",") !== s.length - 1 && s.indexOf(",") !== -1) 
    {
        s = s.replace(",", ", then ");
        return effectParser(s, game, selectionOnResolve, youMayEffectHanging);
    }
    return null;
}