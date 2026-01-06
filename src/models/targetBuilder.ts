import type { Game } from "./game";
import type { Player } from "./player";
import { Card, ItemCard, type TargetsSelector } from "./cards";
import { isChooseOneOptions, type ChooseOneOptions } from "./targetSelector";
import { isStackElement } from "./stack";
import { isChooseOneResult, type ChooseOneResult } from "./effectParser";
/**
 * Represents the server's response when building targets progressively
 */
export interface TargetSelectorResponse {
    /** Description of what to select */
    description: string;
    /** How many targets to select */
    count: number;
    /** Whether the player can select fewer targets than count (asMany) */
    asMany: boolean;
    /** Available options as string identifiers */
    options: string[];
    /** Whether target building is complete */
    complete: boolean;
    /** For choose-one selectors: true = picking option description, false = picking actual targets */
    isChooseOne: boolean;
}

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
 * const itemIndex = player.inPlay.indexOf(item);
 * const step1 = TargetBuilder.getNextSelector(game, player, itemIndex, []);
 * // If it's choose-one with options: ["option A", "option B"]
 * // Step 2: User picks "option A", get targets for that option
 * const step2 = TargetBuilder.getNextSelector(game, player, itemIndex, ["option A"]);
 * // Now returns the admissible targets for option A
 * // Step 3: User picks a target "b2-blank_card"
 * const step3 = TargetBuilder.getNextSelector(game, player, itemIndex, ["option A", "b2-blank_card"]);
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
     * @param itemIndex The index of the item in player.inPlay whose effect is being activated
     * @param partialChoices Flat array of all string identifiers chosen so far
     * @param effectId Which effect to activate ("tap" or paid effect index)
     * @returns Information about the next selector to fill, or completion status
     */
    static getNextSelector(
        game: Game,
        player: Player,
        itemIndex: number,
        partialChoices: string[] = [],
        effectId: number | "tap" = "tap",
        lootCard: boolean = false
    ): TargetSelectorResponse {
        // Get all target selectors for this effect
        const item: ItemCard = lootCard ? player.hand.cards[itemIndex] as ItemCard : player.inPlay[itemIndex] as ItemCard;
        if(!item)
            throw new Error(`Item at index ${itemIndex} not found.`);
        if(effectId === "tap" && !item.charged)
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
                    opt => opt.description === choice
                );

                if (!chosenOption) {
                    throw new Error(`Invalid choose-one option: ${choice}`);
                }

                // Now we need to get targets from the chosen option's admissibleTargets
                // Create a temporary selector for the admissible targets
                selector = {
                    description: chosenOption.description,
                    selector: () => chosenOption.admissibleTargets,
                    count: selector.count,
                    asMany: selector.asMany
                };
                choicesProcessed = 0; // Reset for the sub-selector
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
                options,
                complete: false,
                isChooseOne: true
            };
        } else {
            // Return regular targets as string identifiers
            return {
                description: selector.description,
                count: selector.count,
                asMany: selector.asMany,
                options: TargetBuilder.convertToStringIdentifiers(possibleTargets),
                complete: false,
                isChooseOne: false
            };
        }
    }

    /**
     * Convert target objects to string identifiers that can be sent to clients
     * and later resolved back to the actual objects.
     * 
     * Since options is always a homogeneous array, we determine the type from the first element
     * and return simple string values without type prefixes.
     * 
     * @param options Array of target options (Cards, Players, Monsters, numbers, etc.)
     * @returns Array of string identifiers
     */
    static convertToStringIdentifiers(options: any[]): string[] {
        // console.log("Converting options to string identifiers:", options);
        return options.map(option => {

            // Handle Cards
            if (typeof option === 'object' && option !== null && 'slug' in option) {
                return option.slug;
            }

            // Handle Entities (by ID)
            if (typeof option === 'object' && option !== null && 'id' in option) {
                return option.id;
            }

            if (isChooseOneResult(option)) {
                return `${option.description} => ${TargetBuilder.convertToStringIdentifiers(option.chosenOptions)}`;
            }

            // Handle Stack Elements
            if (isStackElement(option)) {
                // console.log("Stack element json:", JSON.stringify(option.json));
                return JSON.stringify(option.json);
            }

            // Handle primitive types (numbers, strings, booleans)
            if (typeof option === 'number' || typeof option === 'string' || typeof option === 'boolean') {
                return `${option}`;
            }

            // Handle null explicitly
            if (option === null) {
                return 'null';
            }
            
            // { player: Player; hand: Hand }
            if( typeof option === 'object' && 'player' in option && 'hand' in option)
                return option.player.id + ': ' + option.hand.cards.map((c: Card) => c.slug).join(',');

            // Handle arrays and plain objects with JSON stringification
            if (Array.isArray(option) || typeof option === 'object') {
                return JSON.stringify(option);
            }

            // Fallback for unknown types
            return option?.constructor?.name || 'undefined';
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
    private static resolveIdentifier(identifier: string, possibleTargets: any[]): any {
        if (possibleTargets.length === 0) return undefined;

        // Special case: if identifier is 'null', find null in the array
        if (identifier === 'null') {
            return possibleTargets.find(t => t === null);
        }

        const firstTarget = possibleTargets[0];

        // Null - skip to next target if first is null
        if (firstTarget === null) {
            // Find first non-null target to determine type
            const nonNullTarget = possibleTargets.find(t => t !== null);
            if (!nonNullTarget) {
                // All null array, already handled above
                return undefined;
            }
            // Use the non-null target as firstTarget for type detection
            return TargetBuilder.resolveIdentifier(identifier, [nonNullTarget, ...possibleTargets.filter(t => t !== nonNullTarget)]);
        }

        // Cards - match by slug
        if (firstTarget && typeof firstTarget === 'object' && 'slug' in firstTarget) {
            return possibleTargets.find(t => t && t.slug === identifier);
        }

        // Entities - match by ID
        if (firstTarget && typeof firstTarget === 'object' && 'id' in firstTarget) {
            return possibleTargets.find(t => t && t.id === identifier);
        }

        // Stack Elements - match by json
        if (isStackElement(firstTarget)) {
            return possibleTargets.find(t => `${JSON.stringify(t.json)}` === identifier);
        }

        // Primitives - try parsing and direct match
        if (typeof firstTarget === 'number') {
            const parsed = parseFloat(identifier);
            return possibleTargets.find(t => t === parsed);
        }

        if (typeof firstTarget === 'boolean') {
            const parsed = identifier === 'true';
            return possibleTargets.find(t => t === parsed);
        }

        if (typeof firstTarget === 'string') {
            return possibleTargets.find(t => t === identifier);
        }

        // Arrays and plain objects - match by JSON stringification
        if (Array.isArray(firstTarget) || typeof firstTarget === 'object') {
            try {
                const parsed = JSON.parse(identifier);
                return possibleTargets.find(t => JSON.stringify(t) === JSON.stringify(parsed));
            } catch {
                return undefined;
            }
        }

        // Fallback - direct match
        return possibleTargets.find(t => t === identifier || String(t) === identifier);
    }

    /**
     * Build complete targets from flat array of string identifiers.
     * Returns a flat array of resolved targets matching the flat choice structure.
     * 
     * @param game The game instance
     * @param player The player building targets
     * @param itemIndex The index of the item in player.inPlay being activated
     * @param partialChoices Flat array of all string identifiers
     * @param effectId Which effect to activate
     * @returns Flat array of resolved targets [target0, target1, target2, ...]
     */
    static buildTargets(
        game: Game,
        player: Player,
        itemIndex: number,
        partialChoices: string[],
        effectId: number | "tap" = "tap",
        lootCard: boolean = false
    ): any[] {
                const item: ItemCard = lootCard ? player.hand.cards[itemIndex] as ItemCard : player.inPlay[itemIndex] as ItemCard;
        if(!item)
            throw new Error(`Item at index ${itemIndex} not found.`);
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
                    opt => opt.description === choice
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

                // Create ChooseOneResult object
                const chooseOneResult: ChooseOneResult = {
                    description: chosenOption.description,
                    chosenOptions: chosenTargets
                };
                result.push(chooseOneResult);
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
}
