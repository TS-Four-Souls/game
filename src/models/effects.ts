import { DamageOnStack, DiceRoll, Player } from "./player";
import { type Card, LootCard, ItemCard, MonsterCard, InplayType, BsoulCard, EffectOnStack, LootCardEffect, MonsterType } from "./cards";
import { EffectData, type EffectFunction, type TargetsSelector, type EffectType } from "./types/cardTypes";
import { Game } from "./game";
import type { Entity } from "./entity";
import { effect } from "zod/v3";
import type { Stack, StackElement } from "./stack";
import { it, no } from "zod/locales";
import *  as passive from "./passiveEffect";
import * as active from "./activeEffect";
import * as monster from "./monsterEffects";
import type { BonusSoulCardType } from "@/types/cardTypes";
import { parse } from "zod";
import { Monster } from "./monster";
import { inAnotherplayItemSelector, anotherPlayerSelector, playerSelector, activeEntitySelector, deckSelector, rollSelector, inplayUnchargedItemSelector, inplayCurseSelector, inplayItemSelector, visibleItemSelector, stackElementSelector, YourItemSelector, inplayItemAndSoulSelector, isChooseOneOptions } from "./targetSelector";
import { effectParser, type ParsedEffect } from "./effectParser";

/**
 * Represents an effect that can be executed on the game state.
 * Effects are mutable during parsing and immutable during execution.
 */
export class Effect {
    protected _description: string;
    protected _effectFunction: EffectFunction;
    protected _targetsSelector: TargetsSelector[];
    protected _paymentFunction?: EffectFunction;
    protected _canPay: (data: EffectData) => boolean = () => true;
    protected _handleYouMay: boolean = false;
    protected _selectionOnResolve: boolean = false;
    protected _type: EffectType;
    protected _cleanup: () => void = () => {};

    // Constructor compatible with both old and new usage patterns
    constructor(
        description: string,
        typeOrFunc: EffectType | EffectFunction,
        effectFunctionOrTargets?: EffectFunction | TargetsSelector[],
        targetsOrUndefined?: TargetsSelector[],
        paymentFunction?: EffectFunction
    ) {
        this._description = description;
        
        // Old pattern: new Effect(desc, type, func, targets, payment)
        if (typeof typeOrFunc === 'string') {
            this._type = typeOrFunc;
            this._effectFunction = effectFunctionOrTargets as EffectFunction || (() => true);
            this._targetsSelector = targetsOrUndefined || [];
            this._paymentFunction = paymentFunction;
        }
        // New pattern: new Effect(desc, func, targets)
        else {
            this._type = "passive";
            this._effectFunction = typeOrFunc;
            this._targetsSelector = (effectFunctionOrTargets as TargetsSelector[]) || [];
        }
    }

    get description(): string {
        return this._description;
    }

    set description(value: string) {
        this._description = value;
    }

    get targetSelectors(): TargetsSelector[] {
        return this._targetsSelector;
    }

    get targetsSelector(): TargetsSelector[] {
        return this._targetsSelector;
    }

    get effectFunction(): EffectFunction {
        return this._effectFunction;
    }

    set effectFunction(effectFunction: EffectFunction) {
        this._effectFunction = effectFunction;
    }

    get type(): EffectType {
        return this._type;
    }

    get handleYouMay(): boolean {
        return this._handleYouMay;
    }

    get selectionOnResolve(): boolean {
        return this._selectionOnResolve;
    }

    // Setters for parser use
    set type(type: EffectType) {
        this._type = type;
    }

    set handleYouMay(value: boolean) {
        this._handleYouMay = value;
    }

    set selectionOnResolve(value: boolean) {
        this._selectionOnResolve = value;
    }

    set targetsSelector(selectors: TargetsSelector[]) {
        this._targetsSelector = selectors;
    }

    set paymentFunction(fn: EffectFunction | undefined) {
        this._paymentFunction = fn;
    }

    set canPayFunction(fn: (data: EffectData) => boolean) {
        this._canPay = fn;
    }

    hasPayment(): boolean {
        return this._paymentFunction !== undefined;
    }

    canPay(data: EffectData): boolean {
        return this._canPay(data);
    }

    async executePayment(data: EffectData): Promise<boolean> {
        if (!this._paymentFunction) {
            throw new Error("Cannot execute payment: no payment function defined");
        }
        return await this._paymentFunction(data);
    }

    async execute(data: EffectData): Promise<boolean> {
        return await this._effectFunction(data);
    }

    // Target validation methods
    private chooseOneTargetStillValid(issuer: Player, chooseOneArray: any[]): boolean {
        // Flat array format: ["description", ...targets]
        if (!Array.isArray(chooseOneArray) || chooseOneArray.length === 0) return false;
        
        const descr = chooseOneArray[0];
        if (typeof descr !== 'string') return false;
        
        const targetsList = chooseOneArray.slice(1);
        if (targetsList.length > 0) {
            for (const admissibleTarget of this._targetsSelector[0]!.selector(issuer)) {
                if (admissibleTarget.description.toLowerCase() === descr.toLowerCase()) {
                    for (const t of targetsList) {
                        if (!admissibleTarget.admissibleTargets.includes(t)) {
                            return false;
                        }
                    }
                    return true;
                }
            }
        }
        return true;
    }

    targetStillValid(issuer: Player, targets: any[]): boolean {
        if (targets.length === 0) return true;
        
        // Check if the first selector is a choose-one selector
        if (this._targetsSelector.length > 0) {
            const firstSelector = this._targetsSelector[0]!;
            const admissibleTargets = firstSelector.selector(issuer);
            
            // If this is a choose-one selector and targets are provided
            if (admissibleTargets.length > 0 && isChooseOneOptions(admissibleTargets[0])) {
                // The entire targets array IS the flat choose-one format: ["description", ...targets]
                if (typeof targets[0] === 'string') {
                    return this.chooseOneTargetStillValid(issuer, targets);
                }
                return false;
            }
        }
        
        // Regular format validation: [target1, target2, target3]
        let targetIndex = 0;
        
        for (let i = 0; i < this._targetsSelector.length; i++) {
            if (targetIndex >= targets.length) break;
            
            const selector = this._targetsSelector[i]!;
            const admissibleTargets = selector.selector(issuer);
            
            if (admissibleTargets.length > 0 && isChooseOneOptions(admissibleTargets[0])) {
                // Should not reach here with new format
                return false;
            } else {
                // Regular selector - check the next `selector.max` targets
                for (let j = 0; j < selector.max && targetIndex < targets.length; j++) {
                    const target = targets[targetIndex];
                    if (!admissibleTargets.includes(target)) {
                        if(j >= selector.min) {
                            // If we have already validated the minimum required targets, we can ignore extra invalid targets
                            break;
                        }
                        return false;
                    }
                    targetIndex++;
                }
            }
        }
        
        return true;
    }
}

/**
 * Parses effect strings into Effect objects.
 * Uses a stateful approach where the effectParser function from effectParser.ts is wrapped
 * and converted into Effect objects with additional parsing for modifiers.
 */
export class EffectParser {
    game: Game;
    current: Effect;
    private _defaultEffect: EffectFunction;
    private _selectionOnResolve: boolean = false;
    private _youMayEffectHanging: [boolean] = [false];

    constructor(game: Game) {
        this.game = game;
        this._defaultEffect = active.addInPlayEffect(game);
        this.current = this.createInvalidEffect();
    }

    /**
     * Main entry point for parsing an effect string.
     * Uses the existing effectParser function and wraps the result into an Effect object.
     */
    parse(effectText: string, defaultEffect?: EffectFunction, selectionOnResolve: boolean = false): Effect {
        this.reset();
        this._selectionOnResolve = selectionOnResolve;
        
        try {
            // Use the existing effectParser function from effectParser.ts
            const parsed: ParsedEffect = effectParser(
                effectText,
                this.game,
                defaultEffect ?? this._defaultEffect,
                this._selectionOnResolve,
                this._youMayEffectHanging
            );
            
            // Convert ParsedEffect to Effect and populate with parsed data
            this.populateFromParsedEffect(effectText, parsed);
            
            // Parse additional modifiers that might not be captured by effectParser
            this.parseAdditionalModifiers(effectText);
            
            return this.current;
        } catch (error) {
            console.error("Error parsing effect:", effectText, error);
            return this.createInvalidEffect();
        }
    }

    /**
     * Resets the parser to a clean state with an invalid effect.
     */
    private reset(): void {
        this.current = this.createInvalidEffect();
        this._selectionOnResolve = false;
        this._youMayEffectHanging = [false];
    }

    private createInvalidEffect(): Effect {
        return new Effect(
            "Invalid effect",
            async () => { throw new Error("Invalid effect"); },
            []
        );
    }

    /**
     * Populates the current Effect from a ParsedEffect returned by effectParser.
     */
    private populateFromParsedEffect(originalText: string, parsed: ParsedEffect): void {
        this.current.description = originalText;
        this.current.effectFunction = parsed.effectFunction;
        this.current.targetsSelector = parsed.targetSelectors;
        
        // Detect effect type from description
        this.detectEffectType(originalText);
        
        // Set youMay flag if it was detected by effectParser
        this.current.handleYouMay = this._youMayEffectHanging[0];
        
        // Set selection timing
        this.current.selectionOnResolve = this._selectionOnResolve;
    }

    /**
     * Detects the effect type based on the description text.
     */
    private detectEffectType(text: string): void {
        const lowerText = text.toLowerCase();
        
        // Passive effects (triggered by events)
        if (lowerText.includes("each time") ||
            lowerText.includes("when") ||
            lowerText.includes("at the start") ||
            lowerText.includes("at the end") ||
            lowerText.includes("while")) {
            this.current.type = "passive";
            return;
        }
        
        // Check for tap effect marker
        if (text.includes("[Tap Effect]")) {
            this.current.type = "active";
            return;
        }
        
        // Check for paid effect marker
        if (text.includes("[Paid Effect]")) {
            this.current.type = "paid";
            return;
        }
        
        // Default to passive for now
        this.current.type = "passive";
    }

    /**
     * Parses additional modifiers that might not be captured by the main effectParser.
     */
    private parseAdditionalModifiers(text: string): void {
        this.parseTapEffectMarker(text);
    }


    /**
     * Checks for tap effect marker and updates type accordingly.
     */
    private parseTapEffectMarker(text: string): void {
        if (text.includes("[Tap Effect]")) {
            this.current.type = "active";
        }
    }

    /**
     * Utility method to parse a single effect and return it.
     * This is a convenience wrapper around the parse method.
     */
    static parseEffect(effectText: string, game: Game): Effect {
        const parser = new EffectParser(game);
        return parser.parse(effectText);
    }
}