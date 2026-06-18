import { type EffectFunction, type TargetsSelector, type EffectType, EffectData, Card } from "../cards";
import { EffectOnStack } from '../stackElement';
import type { Entity } from "../entities/entity";
import type { Player } from "../entities/player";
import { TargetBuilder } from "../targetBuilder";
import { isChooseOneOptions } from "../targetSelector";
import { combineEffectFunctions } from "./activeEffect";


export class Effect {
    protected _card: Card;
    protected _description: string;
    protected _effectFunction: EffectFunction;
    protected _paymentFunction?: EffectFunction;
    protected _targetsSelector: TargetsSelector[];
    protected _cleanup: () => void = () => { };
    protected _type: EffectType;
    // protected _cleanup: () => void = () => {};
    constructor(description: string,
        type: EffectType,
        card: Card,
        effectFunction: EffectFunction = (data: EffectData): boolean => { return true; },
        targetsSelector: TargetsSelector[] = [{ description: "", selector: (issuer: Player, card: Card): Entity[] => [], min: 0, max: 0 }],
        paymentFunction?: EffectFunction
    ) {
        this._description = description;
        this._type = type;
        this._effectFunction = effectFunction;
        this._targetsSelector = targetsSelector;
        this._paymentFunction = paymentFunction;
        this._card = card;
    }

    get card(): Card {
        return this._card;
    }
    get description(): string {
        return this._description;
    }
    get targetsSelector(): TargetsSelector[] {
        return this._targetsSelector;
    }
    set effectFunction(effectFunction: EffectFunction) {
        this._effectFunction = effectFunction;
    }
    get effectFunction(): EffectFunction {
        return this._effectFunction;
    }

    get type(): EffectType {
        return this._type;
    }

    hasPayment(): boolean {
        return this._paymentFunction !== undefined;
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
            for (const admissibleTarget of this._targetsSelector[0]!.selector(issuer, this.card)) {
                if (admissibleTarget.description.toLowerCase() === descr.toLowerCase()) {
                    let admisibleTargetsIndex = 0;
                    let nbTargetsForSelector = 0;
                    for (const t of targetsList) {
                        if (((admissibleTarget.admissibleTargets[admisibleTargetsIndex]) as TargetsSelector).selector(issuer, this.card).includes(t)) {
                            nbTargetsForSelector++;
                        } else if (nbTargetsForSelector >= ((admissibleTarget.admissibleTargets[admisibleTargetsIndex]) as TargetsSelector).min) {
                            admisibleTargetsIndex++;
                        } else {
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
            const admissibleTargets = firstSelector.selector(issuer, this.card);

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
            const admissibleTargets = selector.selector(issuer, this.card);

            if (admissibleTargets.length > 0 && isChooseOneOptions(admissibleTargets[0])) {
                // Should not reach here with new format
                return this.chooseOneTargetStillValid(issuer, targets.slice(targetIndex));
            } else {
                // Regular selector - check the next `selector.max` targets
                for (let j = 0; j < selector.max && targetIndex < targets.length; j++) {
                    const target = targets[targetIndex];
                    if (!admissibleTargets.includes(target)) {
                        if (j >= selector.min) {
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
function combineEffects(effect1: Effect, effect2: Effect): Effect {
    if (effect1.type !== "active" || effect2.type !== "active") {
        throw new Error("Only active effects can be combined.");
    }
    const descr = `${effect1.description} ${effect2.description}`;
    const effect = combineEffectFunctions([effect1.effectFunction, effect2.effectFunction]);
    return new Effect(descr, "active", effect1.card, effect, effect1.targetsSelector.concat(effect2.targetsSelector));

}
// Effect handler manages multiple effects of the same type of a card.
class EffectHandler {
    protected _effects: Effect[] = [];
    protected cleaners: (() => void)[] = [];

    cleanupAll(): void {
        for (const cleaner of this.cleaners) {
            cleaner();
        }
        this.cleaners = [];
        this._effects = [];
    }
}
class PassiveEffectHandler extends EffectHandler {
    protected _type: "passive" = "passive";

    addEffect(effect: Effect): void {
        if (effect.type === "passive")
            this._effects.push(effect);
        else throw new Error("Cannot put a non-passive effect in a PassiveEffectHandler.");
    }
    subscribeAll(issuerProvider: () => Entity, it: Card): void {
        for (const effect of this._effects) {
            // Passive effects don't have targets, pass empty array
            const targets: any[] = [];
            // if(effect.targetsSelector.length > 0) {
            //     targets = effect.targetsSelector.map(selector => { selector.selector(owner as Player)[0]; });
            // }
            void effect.effectFunction(new EffectData(it, issuerProvider, targets));
        }
    }
}
class ActiveEffectHandler extends EffectHandler {
    protected _type: "active" = "active";
    protected _activeEffect: Effect | null = null;

    addEffect(effect: Effect): void {
        switch (effect.type) {
            case "active":
                if (this._activeEffect !== null) {
                    this._activeEffect = combineEffects(this._activeEffect, effect);
                }

                else
                    this._activeEffect = effect;
                break;
            case "paid":
                this._effects.push(effect);
                break;
            default:
                throw new Error("Cannot put a passive effect in an ActiveEffectHandler.");
        }
    }

    getActiveEffect(): Effect {
        if (this._activeEffect === null) {
            throw new Error("No active effect found in ActiveEffectHandler.");
        }
        return this._activeEffect;
    }

    async activate(issuer: Entity, it: Card, targets: any[]): Promise<boolean> {
        if (this._activeEffect === null) {
            throw new Error("No active effect found in ActiveEffectHandler.");
        }
        return await this._activeEffect.effectFunction(new EffectData(it, () => issuer as Player, targets));
    }

    async pay(issuer: Entity, it: Card, targets: any[], effectId: number): Promise<boolean> {
        const effect = this.getPaidEffect(effectId);
        return await effect.effectFunction(new EffectData(it, () => issuer as Player, targets));
    }

    hasTapEffect(): boolean {
        return this._activeEffect !== null;
    }

    getPaidEffect(index: number): Effect {
        const paidEffects = this._effects[index];
        if (!paidEffects) {
            throw new Error(`Paid effect at index ${index} not found.`);
        }
        return paidEffects;
    }

    // getEffect(index: number = 0): Effect | undefined {
    //     return this._effects.length > index ? this._effects[index] : undefined;
    // }
    // activeEffect(issuer: Entity, it: Card, effectId: number, targets: any[]): void {
    //     if (this._type !== "active" && this._effects.length > 0)
    //         throw new Error("activeEffect can only be called for active effects.");
    //     // Implement shovel and blank card before uncommenting this
    // if( effectId < 0 || effectId >= this._effects.length) { 
    //     throw new Error(`Effect id ${effectId} is out of bounds for active effects of length ${this._effects.length}.`);
    // }
    //     const effect = this._effects[effectId];
    //     if (effect) {
    //         if (effect.type !== "passive") {
    //             effect.effectFunction({ it, issuer: issuer as Player, targets: targets });
    //         }
    //     }
    // }
    getTargetSelectors(index: number | "tap"): TargetsSelector[] {
        if (index === "tap")
            return this.getActiveEffect().targetsSelector || [];

        else
            return this._effects[index]?.targetsSelector || [];
    }

    get effectNames(): string[] {
        return this._effects.map(e => e.description);
    }

    getPaidEffectId(description: string): number {
        const idx = this._effects.findIndex((effect) => effect.description === description);
        if (idx === -1) {
            throw new Error(`Effect with description "${description}" not found in effect list ${this._effects.map(e => e.description).join(", ")}.`);
        }
        return idx;
    }
}
export class EffectInterface {
    private activeEffects: ActiveEffectHandler;
    private passiveEffects: PassiveEffectHandler;
    protected _issuer: Player | undefined;
    protected it: Card;

    constructor(it: Card) {
        this.activeEffects = new ActiveEffectHandler();
        this.passiveEffects = new PassiveEffectHandler();
        this.it = it;
    }

    reset(): void {
        this.activeEffects = new ActiveEffectHandler();
        this.passiveEffects = new PassiveEffectHandler();
    }

    addEffect(effect: Effect): void {
        if (effect.type === "passive") {
            this.passiveEffects.addEffect(effect);
        } else {
            this.activeEffects.addEffect(effect);
        }
    }

    hasTapEffect(): boolean {
        return this.activeEffects.hasTapEffect();
    }

    subscribeAll(issuerProvider: () => Entity): void {
        this.passiveEffects.subscribeAll(issuerProvider, this.it);
    }

    async paidEffect(issuer: Entity, targets: any[], effectId: number): Promise<EffectOnStack> {
        const effect = this.activeEffects.getPaidEffect(effectId);

        const data = new EffectData(this.it, () => issuer as Player, targets);
        // Execute payment if it exists
        if (effect.hasPayment()) {
            if (!await effect.executePayment(data)) {
                throw new Error(`Payment denied for ${this.it.slug}, with targets: "${JSON.stringify(TargetBuilder.convertToSelectionItems(data.targets))}".`);
            }
            // Effect gets second element of targets array
            return new EffectOnStack(effect.effectFunction, data, effect.description, effect.type);
        }
        return new EffectOnStack(effect.effectFunction, data, effect.description, effect.type);
    }

    tapEffect(issuer: Entity, targets: any[]): EffectOnStack {
        const effect = this.activeEffects.getActiveEffect();
        if (!issuer)
            throw new Error("EffectInterface.tapEffect: issuer is undefined or null.");
        const data = new EffectData(this.it, () => issuer as Player, targets);
        return new EffectOnStack(effect.effectFunction, data, effect.description, effect.type);
    }
    // activeEffect(issuer: Entity, targets: any[], effectId: number): void {
    //     this.activeEffects.pay(issuer, this.it, targets, effectId);
    // }
    get activeEffectList(): { index: ("tap" | number); description: string; }[] {
        const effects: { index: ("tap" | number); description: string; }[] = [];
        if (this.activeEffects.hasTapEffect())
            effects.push({ index: "tap" as const, description: this.activeEffects.getActiveEffect().description });
        for (const [index, effect] of this.activeEffects.effectNames.entries())
            effects.push({ index: index, description: effect });
        return effects;
    }


    // Get the first active effect (for cards that have a single effect)
    getActiveEffect(index: number = 0): Effect | undefined {
        return this.activeEffects.getActiveEffect();
    }

    getTargetSelectors(index: number | "tap"): TargetsSelector[] {
        return this.activeEffects.getTargetSelectors(index);
    }
    // Lifecycle methods for loot cards - onPlay takes targets as parameter and returns a resolve function
    onPlay(issuer: Player, targets: any[]): (() => void | Promise<void>) {
        this._issuer = issuer;
        const effect = this.activeEffects.getActiveEffect();
        if (!effect) {
            return () => { };
        }

        // Return a resolve function to be called later
        return async () => {
            if (this._issuer) {
                // Validate targets before calling effect function
                if (effect.targetStillValid(this._issuer!, targets)) {
                    await effect.effectFunction(new EffectData(this.it, () => this._issuer!, targets));
                }
                await this.subscribeAll(() => this._issuer!);
            }
        };
    }

    targetStillValid(
        player: Player,
        effectId: number | "tap",
        targets: any[]
    ): boolean {
        const effect = effectId === "tap" ? this.activeEffects.getActiveEffect() : this.activeEffects.getPaidEffect(effectId);
        return effect.targetStillValid(player, targets);
    }
    debugSetTargets(targets: any[]): void {
        // This method is deprecated - targets should be passed to onPlay instead
        console.warn("debugSetTargets is deprecated. Pass targets to onPlay instead.");
    }
}
