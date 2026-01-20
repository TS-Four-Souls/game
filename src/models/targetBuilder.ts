import type { Game } from "./game";
import type { Player } from "./player";
import { Card, ItemCard, type TargetsSelector } from "./cards";
import { isChooseOneOptions, type ChooseOneOptions } from "./targetSelector";
import { isStackElement } from "./stack";
import type { TargetSelectorResponse } from "../shared/api";
import type { Entity } from "./entity";
import type { SelectionItem, SelectionItemType } from "../shared/api";

/**
 * Target Builder - Standalone utility for progressive target selection
 * 
 * Inspired by SelectorWalker, this walks through selectors handling choose-one nesting.
 * Uses a flat array of choices (similar to SelectorWalker) instead of nested arrays.
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
     * @returns Information about the next selector to fill, or completion status
     */
    static getNextSelector(
        game: Game,
        player: Player,
        item: ItemCard,
        partialChoices: SelectionItem[] = [],
        effectId: number | "tap" = "tap",
        throwIfNotCharged: boolean = true
    ): TargetSelectorResponse {
        game.assertNoPendingSelection();
        if(!item)
            throw new Error(`Item not found.`);
        if(throwIfNotCharged && effectId === "tap" && !item.charged)
            throw new Error(`Item ${item.name} is not charged.`);
        // console.log("TargetBuilder.getNextSelector for item:", item.name, "effectId:", effectId, "partialChoices:", partialChoices);

        const rootSelectors = item.getEffectTarget(effectId);

        let selectorIndex = 0;
        let selector: TargetsSelector | undefined = rootSelectors[selectorIndex];

        if (!selector) {
            return {
                description: "",
                count: 0,
                asMany: false,
                options: [],
                complete: true,
                isChooseOne: false
            };
        }

        // Walk through choices using for loop
        let choicesProcessed = 0;
        for (let i = 0; i < partialChoices.length; i++) {
            const possibleTargets: any[] = selector.selector(player);
            const choice = partialChoices[i]!;

            // Check if this is a choose-one selector
            if (possibleTargets.length > 0 && isChooseOneOptions(possibleTargets[0])) {
                // Choose-one: find the chosen option
                const chosenOption = (possibleTargets as ChooseOneOptions[]).find(
                    opt => opt.description === choice.payload
                );

                if (!chosenOption) {
                    throw new Error(`Invalid choose-one option: ${choice}`);
                }

                // If admissibleTargets is empty, this option needs no targets - move to next selector
                if (chosenOption.admissibleTargets.length === 0) {
                    selectorIndex++;
                    selector = rootSelectors[selectorIndex];
                    choicesProcessed = 0;
                    
                    if (!selector) {
                        return {
                            description: "",
                            count: 0,
                            asMany: false,
                            options: [],
                            complete: true,
                            isChooseOne: false
                        };
                    }
                } else {
                    // Create a temporary selector for the admissible targets
                    selector = {
                        description: chosenOption.description,
                        selector: () => chosenOption.admissibleTargets,
                        count: selector.count,
                        asMany: selector.asMany
                    };
                    choicesProcessed = 0; // Reset for the sub-selector
                }
            } else {
                // Regular selector - validate choice by matching against possibleTargets
                const resolved = TargetBuilder.resolveIdentifier(choice, possibleTargets);
                if (!resolved) {
                    throw new Error(`Invalid target choice: ${choice}`);
                }

                choicesProcessed++;

                // Check if we've filled this selector's count
                if (choicesProcessed >= selector.count) {
                    // Move to next selector
                    selectorIndex++;
                    selector = rootSelectors[selectorIndex];
                    choicesProcessed = 0;

                    if (!selector) {
                        return {
                            description: "",
                            count: 0,
                            asMany: false,
                            options: [],
                            complete: true,
                            isChooseOne: false
                        };
                    }
                }
            }
        }

        // Get the next selector to display
        const possibleTargets = selector.selector(player);

        // Check if this is a choose-one selector
        const isChooseOne = possibleTargets.length > 0 && isChooseOneOptions(possibleTargets[0]);

        if (isChooseOne) {
            // Return choose-one option descriptions
            const options = (possibleTargets as ChooseOneOptions[]).map(opt => opt.description);
            return {
                description: selector.description,
                count: 1,
                asMany: false,
                options: TargetBuilder.convertToSelectionItems(options),
                complete: false,
                isChooseOne: true
            };
        } else {
            // Return regular targets as string identifiers
            return {
                description: selector.description,
                count: selector.count,
                asMany: selector.asMany,
                options: TargetBuilder.convertToSelectionItems(possibleTargets),
                complete: false,
                isChooseOne: false
            };
        }
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

    /**
     * Convert target objects to string identifiers that can be sent to clients
     * and later resolved back to the actual objects.
     * 
     * @param options Array of target options (Cards, Players, Monsters, numbers, etc.)
     * @returns Array of string identifiers
     */
    // static convertToSelectionItems(options: any[]): string[] {
    //     return this.convertToSelectionItems(options).map(item => JSON.stringify(item.payload));
    //     // console.log("Converting options to string identifiers:", options);
    //     // return options.map(option => {

    //     //     // Handle Cards
    //     //     if (typeof option === 'object' && option !== null && 'slug' in option) {
    //     //         return option.slug;
    //     //     }

    //     //     // Handle Entities (by ID)
    //     //     if (typeof option === 'object' && option !== null && 'id' in option) {
    //     //         return option.id;
    //     //     }

    //     //     // Handle Stack Elements
    //     //     if (isStackElement(option)) {
    //     //         // console.log("Stack element json:", JSON.stringify(option.json));
    //     //         return JSON.stringify(option.json);
    //     //     }

    //     //     // Handle primitive types (numbers, strings, booleans)
    //     //     if (typeof option === 'number' || typeof option === 'string' || typeof option === 'boolean') {
    //     //         return `${option}`;
    //     //     }

    //     //     // Handle null explicitly
    //     //     if (option === null) {
    //     //         return 'null';
    //     //     }
            
    //     //     // { player: Player; hand: Hand }
    //     //     if( typeof option === 'object' && 'player' in option && 'hand' in option)
    //     //         return option.player.id + ': ' + option.hand.cards.map((c: Card) => c.slug).join(',');

    //     //     // Handle arrays and plain objects with JSON stringification
    //     //     if (Array.isArray(option) || typeof option === 'object') {
    //     //         return JSON.stringify(option);
    //     //     }

    //     //     // Fallback for unknown types
    //     //     return option?.constructor?.name || 'undefined';
    //     // });
    // }

    // "card" | "player" | "monster" | "number" | "boolean" | "stackElement" | "chooseOneOption" | "array" | "object" | "null" | "unknown";

    static convertToSelectionItems(options: any[]): SelectionItem[] {
         return options.map(option => {

            if (typeof option === 'object' && option !== null && 'slug' in option) {
                return { payload: {name: option.name, slug: option.slug}, type: "card" };
            }

            if (typeof option === 'object' && option !== null && 'id' in option) {
                const entity = option as Entity;
                return {type: entity.json.type, payload: {name: entity.json.name, slug: entity.json.slug}};
            }

            if (isStackElement(option)) {
                return { type: "stackElement", payload: option.json };
            }

            if (typeof option === 'number')
                return {type: "number", payload: option};
            if (typeof option === 'string')
                return {type: "string", payload: option};
            if (typeof option === 'boolean')
                return {type: "boolean", payload: option};
            if (option === null) {
                return {type: "null", payload: null};
            }
            
            // { player: Player; hand: Hand }
            if( typeof option === 'object' && 'player' in option && 'hand' in option)
                return {type: "couplePlayerHand", payload: {player: {name: (option.player as Player).id, slug: (option.player as Player).slug}, hand: option.hand.cards.map((c: Card) => {return {name: c.name, slug: c.slug}})}};
            if (Array.isArray(option) || typeof option === 'object') {
                return {type: "array", payload: option.map((item: any) => TargetBuilder.convertToSelectionItems([item]))};
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
    private static resolveIdentifier(identifier: SelectionItem, possibleTargets: any[]): any {
        if (possibleTargets.length === 0) return undefined;
        switch(identifier.type) {
            case "card":
                return possibleTargets.find(t => t && t.slug === identifier.payload.slug);
            case "player":
            case "monster":
                return possibleTargets.find(t => t && t.json.name === identifier.payload.name);
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
                    JSON.stringify(t.hand.cards.map((c: Card) => c.slug)) === JSON.stringify(identifier.payload.hand)
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

        // // Special case: if identifier is 'null', find null in the array
        // if (identifier.type === 'null') {
        //     return possibleTargets.find(t => t === null);
        // }

        // const firstTarget = possibleTargets[0];

        // // Null - skip to next target if first is null
        // if (firstTarget === null) {
        //     // Find first non-null target to determine type
        //     const nonNullTarget = possibleTargets.find(t => t !== null);
        //     if (!nonNullTarget) {
        //         // All null array, already handled above
        //         return undefined;
        //     }
        //     // Use the non-null target as firstTarget for type detection
        //     return TargetBuilder.resolveIdentifier(identifier, [nonNullTarget, ...possibleTargets.filter(t => t !== nonNullTarget)]);
        // }

        // // Cards - match by slug
        // if (firstTarget && typeof firstTarget === 'object' && 'slug' in firstTarget) {
        //     return possibleTargets.find(t => t && t.slug === identifier);
        // }

        // // Entities - match by ID
        // if (firstTarget && typeof firstTarget === 'object' && 'id' in firstTarget) {
        //     return possibleTargets.find(t => t && JSON.stringify(t.json) === identifier);
        // }

        // // Stack Elements - match by json
        // if (isStackElement(firstTarget)) {
        //     return possibleTargets.find(t => `${JSON.stringify(t.json)}` === identifier);
        // }

        // // Primitives - try parsing and direct match
        // if (typeof firstTarget === 'number') {
        //     const parsed = parseFloat(identifier);
        //     return possibleTargets.find(t => t === parsed);
        // }

        // if (typeof firstTarget === 'boolean') {
        //     const parsed = identifier === 'true';
        //     return possibleTargets.find(t => t === parsed);
        // }

        // if (typeof firstTarget === 'string') {
        //     return possibleTargets.find(t => t === identifier);
        // }

        // // Arrays and plain objects - match by JSON stringification
        // if (Array.isArray(firstTarget) || typeof firstTarget === 'object') {
        //     try {
        //         const parsed = JSON.parse(identifier);
        //         return possibleTargets.find(t => JSON.stringify(t) === JSON.stringify(parsed));
        //     } catch {
        //         return undefined;
        //     }
        // }

        // // Fallback - direct match
        // return possibleTargets.find(t => t === identifier || String(t) === identifier);
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
        game.assertNoPendingSelection();
        if(!item)
            throw new Error(`Item not found.`);
        const rootSelectors = item.getEffectTarget(effectId);
        const result: any[] = [];

        let selectorIndex = 0;
        let choiceIndex = 0;
        let selector: TargetsSelector | undefined = rootSelectors[selectorIndex];

        while (selector && choiceIndex < partialChoices.length) {
            const possibleTargets = selector.selector(player);

            // Check if this is a choose-one selector
            if (possibleTargets.length > 0 && isChooseOneOptions(possibleTargets[0])) {
                const choice = partialChoices[choiceIndex]!;
                const chosenOption = (possibleTargets as ChooseOneOptions[]).find(
                    opt => opt.description === choice.payload
                );

                if (!chosenOption) {
                    throw new Error(`Invalid choose-one option: ${choice}`);
                }

                choiceIndex++; // Move past the option choice

                // Collect the targets for this option from admissibleTargets
                const targetsNeeded = selector.count;
                const admissibleTargets = chosenOption.admissibleTargets;
                const chosenTargets: any[] = [];

                for (let i = 0; i < targetsNeeded && choiceIndex < partialChoices.length; i++) {
                    const targetId = partialChoices[choiceIndex]!;
                    const resolved = TargetBuilder.resolveIdentifier(targetId, admissibleTargets);
                    if (resolved) {
                        chosenTargets.push(resolved);
                    }
                    choiceIndex++;
                }

                // Push description and spread targets into flat array
                result.push(chosenOption.description, ...chosenTargets);
            } else {
                // Regular selector - collect count targets
                for (let i = 0; i < selector.count && choiceIndex < partialChoices.length; i++) {
                    const targetId = partialChoices[choiceIndex]!;
                    const resolved = TargetBuilder.resolveIdentifier(targetId, possibleTargets);
                    if (resolved) {
                        result.push(resolved);
                    }
                    choiceIndex++;
                }
            }

            selectorIndex++;
            selector = rootSelectors[selectorIndex];
        }
        if (!item.targetStillValid(player, effectId, result)) {
            throw new Error(`One or more targets are no longer valid.`);
        }
        return result;
    }

    static async buildTargetsOnResolve(
        game: Game,
        player: Player,
        item: ItemCard
    ): Promise<any[]> {
        if(!item)
            throw new Error(`Item not found or has no active effect.`);
        const activeEffect = item.getActiveEffect();
        if (!activeEffect)
            throw new Error(`Item ${item.name} has no active effect to copy.`);
        if(player === undefined)
            throw new Error(`Effect issuer is not a player.`);

        // The next target is expected to be an array of targets for the copied effect
        let targets: any[] = [];
        let options = TargetBuilder.getNextSelector(game, player, item, targets, "tap", false);
        while(!options.complete)
        {
            const selection = await game.select(player, options.count, options.options, options.asMany, "Select targets for the copied card.");
            targets.push(...selection.selected);
            options = TargetBuilder.getNextSelector(game, player, item, targets, "tap", false);
        }
        return TargetBuilder.buildTargets(game, player, item, targets, "tap");
    }
}
