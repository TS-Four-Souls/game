import { shuffle } from "@/utils/auxiliary";
import type { DeckName, SelectionItem, TargetSelectorResponse } from "../shared/api";
import { Card, ItemCard, LootCard, type TargetsSelector } from "./cards";
import { Entity } from "./entities/entity";
import type { Game } from "./game";
import type { Player } from "./entities/player";
import { isStackElement } from "./stack";
import { isChooseOneOptions, type ChooseOneOptions } from "./targetSelector";

/**
 * Target Builder - Standalone utility for progressive target selection
 * 
 * 
 * For choose-one selectors:
 * 1. First choice is the option description (e.g., "destroy an item you control.")
 * 2. Subsequent choices are the actual targets for that option
 * 
 * Usage:
 * ```typescript
 * // Step 1: Get first selector
 * const item = player.inPlay[0];
 * const step1 = TargetBuilder.getNextSelector(game, player, item, []);
 * // If it's choose-one with options: ["option A", "option B"]
 * // Step 2: User picks "option A", get targets for that option
 * const step2 = TargetBuilder.getNextSelector(game, player, item, ["option A"]);
 * // Now returns the admissible targets for option A
 * // Step 3: User picks a target "b2-blank_card"
 * const step3 = TargetBuilder.getNextSelector(game, player, item, ["option A", "b2-blank_card"]);
 * // Continue until complete
 * ```
 */
export class TargetBuilder {
    private static shouldAutofillSelector(selector: TargetsSelector, possibleTargets: any[]): boolean {
        return selector.min === possibleTargets.length && selector.max === possibleTargets.length;
    }

    private static completeResponse(): TargetSelectorResponse {
        return {
            description: "",
            min: 0,
            max: 0,
            options: [],
            complete: true,
            isChooseOne: false
        };
    }

    private static normalizeSelectorForPrompt(
        rootSelectors: TargetsSelector[],
        selectorIndex: number,
        selector: TargetsSelector | undefined,
        player: Player,
        item: ItemCard
    ): { selector: TargetsSelector | undefined; selectorIndex: number } {
        while (selector) {
            const possibleTargets = selector.selector(player, item);
            if (!TargetBuilder.shouldAutofillSelector(selector, possibleTargets)) {
                break;
            }
            const isChooseOne = possibleTargets.length > 0 && isChooseOneOptions(possibleTargets[0]);
            if (isChooseOne) {
                const chosenOption = (possibleTargets as ChooseOneOptions[])[0]!;

                // Fully deterministic choose-one (option and target both implied): advance.
                if (chosenOption.admissibleTargets.length <= 1) {
                    selectorIndex++;
                    selector = rootSelectors[selectorIndex];
                    continue;
                }

                // Deterministic choose-one option, but target still needs user input.
                selector = {
                    description: chosenOption.description,
                    selector: (): any[] => chosenOption.admissibleTargets,
                    min: selector.min,
                    max: selector.max,
                };
                break;
            }

            // Regular deterministic selector.
            selectorIndex++;
            selector = rootSelectors[selectorIndex];
        }

        return { selector, selectorIndex };
    }

    private static advanceFullyDeterministicSelectorsForBuild(
        rootSelectors: TargetsSelector[],
        selectorIndex: number,
        selector: TargetsSelector | undefined,
        player: Player,
        item: ItemCard,
        result: any[]
    ): { selector: TargetsSelector | undefined; selectorIndex: number } {
        while (selector) {
            const possibleTargets = selector.selector(player, item);
            if (!TargetBuilder.shouldAutofillSelector(selector, possibleTargets)) {
                break;
            }

            const isChooseOne = possibleTargets.length > 0 && isChooseOneOptions(possibleTargets[0]);
            if (isChooseOne) {
                throw new Error("SHOULD NEVER BE THERE: Cannot auto-advance through deterministic choose-one selectors during build - user choice is required to determine the path.");
                const chosenOption = (possibleTargets as ChooseOneOptions[])[0]!;
                result.push(chosenOption.description);

                if (chosenOption.admissibleTargets.length === 1) {
                    result.push(chosenOption.admissibleTargets[0]);
                    selectorIndex++;
                    selector = rootSelectors[selectorIndex];
                    continue;
                }

                if (chosenOption.admissibleTargets.length === 0) {
                    selectorIndex++;
                    selector = rootSelectors[selectorIndex];
                    continue;
                }

                // Option is deterministic but target is not; stop here.
                break;
            }

            result.push(...possibleTargets);
            selectorIndex++;
            selector = rootSelectors[selectorIndex];
        }

        return { selector, selectorIndex };
    }

    /**
     * Walk through selectors following the user's choices, handling choose-one nesting.
     * Returns the current selector to display based on the partial choices made so far non serialized.
     * 
     * 
     * @param game The game instance
     * @param player The player building the targets
     * @param item The item card whose effect is being activated
     * @param partialChoices Flat array of all string identifiers chosen so far
     * @param effectId Which effect to activate ("tap" or paid effect index)
     * @param throwIfNotCharged Whether to throw an error if the item is not charged (default: true)
     * @returns Information about the next selector to fill, or completion status non serialized
     */
    static getNextSelectorRaw(
        game: Game,
        player: Player,
        item: ItemCard,
        partialChoices: SelectionItem[] = [],
        effectId: number | "tap" = "tap",
        throwIfNotCharged: boolean = true,
        bypassAsserPendingSelection: boolean = false
    ): {
                description: string,
                min: number,
                max: number,
                options: any[],
                complete: boolean,
                isChooseOne: boolean,
            } {
        if(!bypassAsserPendingSelection)
            game.assert.noPendingSelection();
        if(!item)
            throw new Error(`Item not found.`);
        if(throwIfNotCharged && effectId === "tap" && !item.charged)
            throw new Error(`Item ${item.name} is not charged.`);
        // console.log("TargetBuilder.getNextSelector for item:", item.name, "effectId:", effectId, "partialChoices:", partialChoices, item.activeEffectList);

        const rootSelectors = [... item.getEffectTarget(effectId)];

        let selectorIndex = 0;
        let selector: TargetsSelector | undefined = rootSelectors[selectorIndex];
        if (!selector) {
            return TargetBuilder.completeResponse();
        }

        // Walk through choices using for loop
        let choicesProcessed = 0;
        for (let i = 0; i < partialChoices.length; i++) {
            const normalized = TargetBuilder.normalizeSelectorForPrompt(rootSelectors, selectorIndex, selector, player, item);
            if (normalized.selectorIndex !== selectorIndex) {
                choicesProcessed = 0;
            }
            selectorIndex = normalized.selectorIndex;
            selector = normalized.selector;

            if (!selector) {
                return TargetBuilder.completeResponse();
            }

            const possibleTargets: any[] = selector.selector(player, item);
            const choice = partialChoices[i]!;

            // Check if this is a choose-one selector
            if (possibleTargets.length > 0 && isChooseOneOptions(possibleTargets[0])) {
                // Choose-one: find the chosen option
                const chosenOption = (possibleTargets as ChooseOneOptions[]).find(
                    opt => opt.description === choice.payload
                );
                console.log(`Processing choice "${choice.payload}" for choose-one selector "${selector.description}". possible options:`, (possibleTargets as ChooseOneOptions[]).map(opt => opt.description).join(", "));
                if (!chosenOption) {
                    throw new Error(`Invalid choose-one option: ${choice}`);
                }
                rootSelectors.splice(selectorIndex + 1, 0, ...chosenOption.admissibleTargets);
                selectorIndex++;
                selector = rootSelectors[selectorIndex];
                if (!selector) {
                    return TargetBuilder.completeResponse();
                }
            } else {
                // Regular selector - validate choice by matching against possibleTargets
                const resolved = TargetBuilder.resolveIdentifier(choice, possibleTargets);
                if (resolved === undefined) {
                    throw new Error(`Invalid target choice: ${choice} for item ${item.name}, selector: ${selector.description}`);
                }

                choicesProcessed++;

                // Check if we've filled this selector's count
                if (choicesProcessed >= selector.max) {
                    // Move to next selector
                    selectorIndex++;
                    selector = rootSelectors[selectorIndex];
                    choicesProcessed = 0;
                    
                    if (!selector) {
                        return TargetBuilder.completeResponse();
                    }
                }
            }
        }

        if (!selector) {
            return TargetBuilder.completeResponse();
        }

        const normalized = TargetBuilder.normalizeSelectorForPrompt(rootSelectors, selectorIndex, selector, player, item);
        selectorIndex = normalized.selectorIndex;
        selector = normalized.selector;

        if (!selector) {
            return TargetBuilder.completeResponse();
        }

        // Get the next selector to display
        const possibleTargets = selector.selector(player, item);
        
        // Check if this is a choose-one selector
        const isChooseOne = possibleTargets.length > 0 && isChooseOneOptions(possibleTargets[0]);

        if (isChooseOne) {
            // Return choose-one option descriptions
            const options = (possibleTargets as ChooseOneOptions[]).map(opt => opt.description);
            return {
                description: selector.description,
                min: 1,
                max: 1,
                options: options,
                complete: false,
                isChooseOne: true
            };
        } else {
            // Return regular targets as string identifiers
            return {
                description: selector.description,
                min: selector.min,
                max: selector.max,
                options: possibleTargets,
                complete: false,
                isChooseOne: false
            };
        }
    }

    /**
     * Walk through selectors following the user's choices, handling choose-one nesting.
     * Returns the current selector to display based on the partial choices made so far.
     * 
     * @param game The game instance
     * @param player The player building the targets
     * @param item The item card whose effect is being activated
     * @param partialChoices Flat array of all string identifiers chosen so far
     * @param effectId Which effect to activate ("tap" or paid effect index)
     * @param throwIfNotCharged Whether to throw an error if the item is not charged (default: true)
     * @returns Information about the next selector to fill, or completion status, serialized
     */
    static getNextSelector(
        game: Game,
        player: Player,
        item: ItemCard,
        partialChoices: SelectionItem[] = [],
        effectId: number | "tap" = "tap",
        throwIfNotCharged: boolean = true,
        bypassAsserPendingSelection: boolean = false
    ): TargetSelectorResponse {
        const selectorRaw = TargetBuilder.getNextSelectorRaw(game, player, item, partialChoices, effectId, throwIfNotCharged, bypassAsserPendingSelection);
        return {
            description: selectorRaw.description,
            min: selectorRaw.min,
            max: selectorRaw.max,
            options: TargetBuilder.convertToSelectionItems(selectorRaw.options),
            complete: selectorRaw.complete,
            isChooseOne: selectorRaw.isChooseOne
        };
    }
    /**
     * Return an item from a player's inPlay or hand by its index.
     * 
     * @param game The game instance
     * @param player The player owning the item
     * @param itemId The index of the item in the specified set
     * @param type "inPlay" to get from inPlay, "hand" to get from hand (default: "inPlay")
     * @returns The ItemCard found
     */
    static getCardFromPlayer(game: Game,
    player: Player,
    itemId: number,
    type : "inPlay" | "hand" = "inPlay"): ItemCard {
        const set = type === "inPlay" ? player.inPlay : player.hand.cards;
        const card = set[itemId];
        if(!card || !(card instanceof ItemCard))
            throw new Error(`Item not found in player's ${type}.`);
        return card;
    }

    static convertToSelectionItems(options: any[]): SelectionItem[] {
         return options.map(option => {

            if (typeof option === 'object' && option !== null && 'slug' in option && option instanceof Card) {
                return { payload: {name: option.name, slug: option.slug, globalId: option.globalId}, type: "card" };
            }

            if (typeof option === 'object' && option !== null && 'id' in option && option instanceof Entity) {
                const entity = option;
                return {type: entity.json.type, payload: {name: entity.json.name, slug: entity.json.slug, globalId: entity.json.globalId, color: entity.color, type: entity.json.type}};
            }

            if (isStackElement(option)) {
                return { type: "stackElement", payload: option.json };
            }

            if (typeof option === 'number')
                return {type: "number", payload: option};
            if (typeof option === 'string')
                return {type: "string", payload: option.toLowerCase()};
            if (typeof option === 'boolean')
                return {type: "boolean", payload: option};
            if (option === null) {
                return {type: "null", payload: null};
            }
            
            if (typeof option === 'object' && option !== null && '_type' in option && '_order' in option && '_discard' in option) {
                // Deck object
                return { type: "deck", payload: option._type as DeckName };
            }
            
            // { player: Player; hand: Hand }
            if( typeof option === 'object' && 'player' in option && 'hand' in option)
                return {type: "couplePlayerHand", payload: {player: {name: (option.player as Player).id, slug: (option.player as Player).slug, globalId: (option.player as Player).globalId}, hand: option.hand.cards.map((c: Card) => {return {name: c.name, slug: c.slug, globalId: c.globalId}})}};
            if (Array.isArray(option) || typeof option === 'object') {
                try {
                    return {type: "array", payload: TargetBuilder.convertToSelectionItems(option)};
                } catch {
                    return {type: "unknown", payload: null};
                }
            }
            return {type: "unknown", payload: null};
            // throw new Error("Not implemented yet");
        });
    }

    /**
     * Resolve a string identifier back to the actual target by matching against possibleTargets.
     * This validates the choice matches one of the selector's options.
     * 
     * Since identifiers no longer have type prefixes, we determine the type from possibleTargets.
     * 
     * @param identifier The string identifier (e.g., "b2-blank_card", "1", "5")
     * @param possibleTargets The array of possible targets from the selector
     * @returns The matched target object, or undefined if not found
     */
    static resolveIdentifier(identifier: SelectionItem, possibleTargets: any[]): any {
        if (possibleTargets.length === 0) 
            throw new Error("No possible targets to resolve against.");
        switch(identifier.type) {
            case "card":
                return possibleTargets.find(t =>
                    t && t.slug === identifier.payload.slug &&
                    (identifier.payload.globalId === undefined || t.globalId === identifier.payload.globalId)
                );
            case "player":
            case "monster":
                return possibleTargets.find(t =>
                    t && t.json.name === identifier.payload.name &&
                    t.json.globalId === identifier.payload.globalId
                );
            case "deck":
                return possibleTargets.find(t => t && t._type === identifier.payload);
            case "number":
            case "string":
            case "boolean":
                return possibleTargets.find(t => t === identifier.payload);
            case "null":
                return possibleTargets.find(t => t === null);
            case "couplePlayerHand":
                return possibleTargets.find(t => 
                    typeof t === 'object' && 'player' in t && 'hand' in t &&
                    t.player.slug === identifier.payload.player.slug &&
                    t.player.globalId === identifier.payload.player.globalId &&
                    JSON.stringify(t.hand.cards.map((c: Card) => ({ slug: c.slug, globalId: c.globalId }))) === JSON.stringify(identifier.payload.hand)
                );
            case "stackElement":
                return possibleTargets.find(t => isStackElement(t) && t.stackId === identifier.payload.id);
            case "array":
                try {
                    const parsed = identifier.payload.map((item: SelectionItem) => {
                        return TargetBuilder.resolveIdentifier(item, possibleTargets);
                    });
                    return possibleTargets.find(t => JSON.stringify(t) === JSON.stringify(parsed));
                } catch {
                    return undefined;
                }
            default:
                return undefined;
        }
    }

    /**
     * Build complete targets from flat array of string identifiers.
     * Returns a flat array of resolved targets matching the flat choice structure.
     * 
     * @param game The game instance
     * @param player The player building targets
     * @param item The item card whose effect is being activated
     * @param partialChoices Flat array of all string identifiers
     * @param effectId Which effect to activate
     * @returns Flat array of resolved targets [target0, target1, target2, ...]
     */
    static buildTargets(
        game: Game,
        player: Player,
        item: ItemCard,
        partialChoices: SelectionItem[],
        effectId: number | "tap" = "tap"
    ): any[] {
        const validTargets = TargetBuilder.validTargetExists(game, player, item, effectId);
        if(validTargets !== true)
            throw new Error(`Cannot build targets: ${validTargets}`);

        game.assert.noPendingSelection();
        if(!item)
            throw new Error(`Item not found.`);
        const rootSelectors = [...item.getEffectTarget(effectId)];
        const result: any[] = [];

        let selectorIndex = 0;
        let choiceIndex = 0;
        let selector: TargetsSelector | undefined = rootSelectors[selectorIndex];

        while (selector) {
            const advanced = TargetBuilder.advanceFullyDeterministicSelectorsForBuild(
                rootSelectors,
                selectorIndex,
                selector,
                player,
                item,
                result
            );
            selectorIndex = advanced.selectorIndex;
            selector = advanced.selector;
            if (!selector) break;
            const possibleTargets = selector.selector(player, item);

            // Check if this is a choose-one selector
            if (possibleTargets.length > 0 && isChooseOneOptions(possibleTargets[0])) {
                if (choiceIndex >= partialChoices.length) {
                    break;
                }

                const choice = partialChoices[choiceIndex]!;
                choiceIndex++; // Move past the option choice
                const chosenOption = (possibleTargets as ChooseOneOptions[]).find(
                    opt => opt.description === choice.payload
                );

                if (!chosenOption) {
                    throw new Error(`Invalid choose-one option: ${choice}`);
                }
                result.push(chosenOption.description);
                rootSelectors.splice(selectorIndex+1, 0, ...chosenOption.admissibleTargets);
            } else {
                if (choiceIndex >= partialChoices.length) {
                    break;
                }

                // Regular selector - collect count targets
                for (let i = 0; i < selector.max && choiceIndex < partialChoices.length; i++) {
                    const targetId = partialChoices[choiceIndex]!;
                    const resolved = TargetBuilder.resolveIdentifier(targetId, possibleTargets);
                    if (resolved !== undefined) {
                        result.push(resolved);
                    }else{
                        throw new Error(`Invalid target choice: ${targetId} for item ${item.name}, selector: ${selector.description}`);
                    }
                    choiceIndex++;
                }
            }

            selectorIndex++;
            selector = rootSelectors[selectorIndex];
        }
        if (!item.targetStillValid(player, effectId, result)) {
            throw new Error(`One or more targets are no longer valid. ${TargetBuilder.convertToSelectionItems(result).map(o => JSON.stringify(o)).join(", ")}`);
        }
        return result;
    }

    static async buildTargetsOnResolve(
        game: Game,
        player: Player,
        item: ItemCard,
        effectId: number | "tap"
    ): Promise<any[]> {
        if(!item)
            throw new Error(`Item not found or has no active effect.`);
        if(effectId === "tap"){
            const activeEffect = item.getActiveEffect();
            if (!activeEffect)
                throw new Error(`Item ${item.name} has no active effect to copy.`);
        }else if (!item.activeEffectList.map(e => e.index).includes(effectId as number)) {
            throw new Error(`Paid effect with index ${effectId} not found on item ${item.name}, available: ${item.activeEffectList.map(e => e.index).join(", ")}.`);
        }
        if(player === undefined)
            throw new Error(`Effect issuer is not a player.`);

        // The next target is expected to be an array of targets for the copied effect
        const targets: any[] = [];
        let options = TargetBuilder.getNextSelectorRaw(game, player, item, targets, effectId, false);
        while(!options.complete)
            {
            if(options.isChooseOne)
            {
                const feasibleChoices = []
                for(const option of options.options)
                {
                    try {
                        const tmp = TargetBuilder.getNextSelectorRaw(game, player, item, [...targets, TargetBuilder.convertToSelectionItems([option])[0]], effectId, false);
                        if(tmp.complete || tmp.options.length > tmp.min)
                        {
                            feasibleChoices.push(option);
                        }
                    } catch (e) {}
                }
                options.options = feasibleChoices;
                if(options.options.length === 0)
                {
                    throw new Error(`No valid targets available for the copied card.`);
                }
            }
            const selection = await game.select(
                player,
                options.min,
                options.max,
                options.options,
                "Select targets for the copied card."
            );
            const normalizedSelection = selection.selected.map((choice) =>choice);
            targets.push(...normalizedSelection);
            options = TargetBuilder.getNextSelectorRaw(game, player, item, TargetBuilder.convertToSelectionItems(targets), effectId, false);
            if(!options.complete && options.options.length === 0)
            {
                throw new Error(`No valid targets available for the copied card ${item.name}.`);
            }
        }
        return TargetBuilder.buildTargets(game, player, item, TargetBuilder.convertToSelectionItems(targets), effectId);
    }

    /* verifyPaiementCanBeMade checks if the player can pay the cost described by string s. 
    * It specifically handle non-decision based cost (money, health, counters).
    * It returns true if the payment can be made, or a string error message if it cannot.
    */
    static verifyPaiementCanBeMade(game: Game, player: Player, card: ItemCard, s: string): string | true {
        s = s.trim().toLowerCase();
        const coins = parseNumber(s, /^\[paid effect\] pay\s+(\d+)\u00A2:?/u);
        if (coins !== null) {
            if (!game.canLoseCoins(player, coins, false, "paiement")) {
                return `You don't have enough coins to pay this cost.`;
            }
        }
        const health = parseNumber(s, /^\[paid effect\] pay\s+(\d+)\s+[hp]:?/u);
        if (health !== null) {
            if (player.currentHealthPoints < health) {
                return `You don't have enough health to pay this cost.`;
            }
        }
        let countersToRemove = parseNumber(s, /^\[paid effect\] remove (\d+) counters? from this\.?/u);
        if (countersToRemove === null)
            countersToRemove = /^\[paid effect\] remove a counter from this.?/.test(s) ? 1 : null;
        if( countersToRemove !== null)
            if (card.counters.value("normal") === 0 || card.counters.value("normal") < countersToRemove) {
                return `You don't have enough counters to pay this cost.`;
            }
        let lootsToDiscard = parseNumber(s, /^\[paid effect\] discard (\d+) loot cards?\.?/u);
        if(lootsToDiscard === null)
            lootsToDiscard = /^\[paid effect\] discard a loot card\.?/.test(s) ? 1 : null;
        if (lootsToDiscard !== null) {
            if (player.hand.length < lootsToDiscard) {
                return `You don't have enough loot cards to pay this cost.`;
            }
        }
        if(s.startsWith("[paid effect] destroy this") && card.eternal)
            return "you can not destroy an eternal item.";
        if(s.startsWith("[paid effect] give another non-eternal item you control") && player.inPlay.filter(i => i !== card && !i.eternal).length === 0)
            return "you have no item to give.";
        
        return true;
    }

    static validTargetExists(
        game: Game,
        player: Player,
        item: ItemCard,
        effectId: number | "tap" = "tap"
    ): string | true {
        if(!item)
            return "Item not found.";
        // console.log(`Checking valid targets for item: ${item.name}, effectId: ${effectId} descr ${item.activeEffectList[effectId as number]?.description}`);
        if(effectId !== "tap")
            {
                const id = effectId + (item.hasTapEffect() ? 1 : 0); // if the item has a tap effect, the paid effects start at index 1, otherwise at index 0
                const paiement = TargetBuilder.verifyPaiementCanBeMade(game, player, item, item.activeEffectList[id]?.description || "");
                if(paiement !== true)
                    return paiement;
            }
        // The next target is expected to be an array of targets for the copied effect
        let targets: any[] = [];
        let options = TargetBuilder.getNextSelector(game, player, item, targets, effectId, false, true);
        const backtrackingIndices: number[] = [];
        while(!options.complete)
        {
            const selection = options.options.slice(0, options.max);
            if(selection.length > options.max || selection.length < options.min)
            {
                if(backtrackingIndices.length === 0)
                    return "No valid targets.";
                const lastIndex = backtrackingIndices.pop()!;
                const prevChooseOneOption = targets[lastIndex];
                targets = targets.slice(0, lastIndex);
                options = TargetBuilder.getNextSelector(game, player, item, targets, effectId, false, true);
                const prevChooseOneIdx = options.options.findIndex((opt: any) => opt.description === prevChooseOneOption.description);
                    if(prevChooseOneIdx === -1)
                        throw new Error(`Could not find previous choose-one option "${prevChooseOneOption.description}" among options: ${options.options.map((opt: any) => opt.description).join(", ")}`);
                    if(options.options.length <= prevChooseOneIdx + 1)
                        return "No valid targets. (No option to backtrack to)";
                    targets.push(options.options[prevChooseOneIdx+1]);
                options = TargetBuilder.getNextSelector(game, player, item, targets, effectId, false, true);
                continue;
            }
            if(options.isChooseOne)
                backtrackingIndices.push(targets.length);
            targets.push(...selection);
            options = TargetBuilder.getNextSelector(game, player, item, targets, effectId, false, true);
        }
        return options.complete;
    }

    static buildRandomValidTargets(
        game: Game,
        player: Player,
        item: ItemCard,
        where: "inPlay" | "hand"
    ): string | {index: number | "tap"; targets: any[]} {
        
        if(!item)
            return "Item not found.";

        const indices = [...item.activeEffectList]
        if(where === "hand" && item.hasTapEffect() && indices.length === 0 && item instanceof LootCard && item.trinket)
        {
            return {index: "tap", targets: []};
        }
        shuffle(Math.random, indices);
        for(const id of indices)
        {
            const effectId = id.index;
            if(effectId !== "tap")
                {
                    const paiement = TargetBuilder.verifyPaiementCanBeMade(game, player, item, item.activeEffectList[effectId]?.description || "");
                    if(paiement !== true)
                    {
                        continue;
                    }
                }
            else if(!item.charged)
            {
                continue;
            }
            // The next target is expected to be an array of targets for the copied effect
            let targets: any[] = [];
            let options = TargetBuilder.getNextSelector(game, player, item, targets, effectId, false, true);
            const backtrackingIndices: number[] = [];
            while(!options.complete)
            {
                // pick a number uniformly between options.min and Math.min(options.max, options.options.length)
                const upper = Math.min(options.max, options.options.length);
                const range = upper - options.min + 1;
                const nbToSelect = options.min + (range > 0 ? Math.floor(Math.random() * range) : 0);
                const shuffledOptions = [...options.options];
                shuffle(Math.random, shuffledOptions);
                const selection = shuffledOptions.slice(0, nbToSelect);
                if(selection.length > options.max || selection.length < options.min)
                {
                    if(backtrackingIndices.length === 0)
                        break;
                    const lastIndex = backtrackingIndices.pop()!;
                    const prevChooseOneOption = targets[lastIndex];
                    targets = targets.slice(0, lastIndex);
                    options = TargetBuilder.getNextSelector(game, player, item, targets, effectId, false, true);
                    const prevChooseOneIdx = options.options.findIndex((opt: any) => opt.description === prevChooseOneOption.description);
                    if(prevChooseOneIdx === -1)
                        throw new Error(`Could not find previous choose-one option "${prevChooseOneOption.description}" among options: ${options.options.map((opt: any) => opt.description).join(", ")}`);
                    if(options.options.length <= prevChooseOneIdx + 1)
                        return "No valid targets. (No option to backtrack to)";
                    targets.push(options.options[prevChooseOneIdx+1]);
                    options = TargetBuilder.getNextSelector(game, player, item, targets, effectId, false, true);
                    // continue;
                }
                if(options.isChooseOne)
                    backtrackingIndices.push(targets.length);
                targets.push(...selection);
                options = TargetBuilder.getNextSelector(game, player, item, targets, effectId, false, true);
            }
            try {
                // Convert serialized selection items into resolved targets expected by game/player APIs
                const resolved = TargetBuilder.buildTargets(game, player, item, targets, effectId);
                return {index: effectId, targets: resolved};
            } catch (e) {
                // console.error(`Error building targets for item ${item.name}, effectId: ${effectId}:`, e);
                // If conversion fails, try next effect
                continue;
            }
        }
        return "No valid targets found for any effect.";
    }
}

// Returns the numeric amount if matched, otherwise null
export function parseNumber(text: string, re: RegExp): number | null {
    const m = text.trim().match(re);
    return m ? Number(m[1]) : null;
}