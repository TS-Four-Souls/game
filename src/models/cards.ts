import { type EffectOnStackJson, type LootCardOnStackJson } from '@/shared/api';
import type { BonusSoulCardType, CardRewards, CharacterCardType, EternalCardType, GenericCardType, InPlayCardType, LootCardType, MonsterCardType, RoomCardType, TreasureCardType } from '@/types/cardTypes';
import { print, shuffle } from '@/utils/auxiliary';
import type { Entity } from './entities/entity';
import { Player } from './entities/player';
import type { GameParameters } from './gameParameters';
import { StackElement } from './stackElement';
import { TargetBuilder } from './targetBuilder';
import { isChooseOneOptions } from './targetSelector';
import { EffectData, type CardSetsCollection, type DecksCollection, type DeckType, type DeckTypeToCardType, type EffectFunction, type EffectType, type TargetsSelector } from './types/cardTypes';

export class Effect {
    protected _description: string;
    protected _effectFunction: EffectFunction;
    protected _paymentFunction?: EffectFunction;
    protected _targetsSelector: TargetsSelector[];
    protected _cleanup: () => void = () => {};
    protected _type: EffectType;
    // protected _cleanup: () => void = () => {};

    constructor(description: string,
        type: EffectType,
        effectFunction: EffectFunction
            = (data: EffectData) => { return true; },
        targetsSelector: TargetsSelector[]
            = [{ description: "", selector: (issuer: Player) => [], min: 0, max: 0 }],
        paymentFunction?: EffectFunction
    ) {
        this._description = description;
        this._type = type;
        this._effectFunction = effectFunction;
        this._targetsSelector = targetsSelector;
        this._paymentFunction = paymentFunction;
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
            for (const admissibleTarget of this._targetsSelector[0]!.selector(issuer)) {
                if (admissibleTarget.description.toLowerCase() === descr.toLowerCase()) {
                    let admisibleTargetsIndex = 0;
                    let nbTargetsForSelector = 0;
                    for (const t of targetsList) {
                        if (((admissibleTarget.admissibleTargets[admisibleTargetsIndex]) as TargetsSelector).selector(issuer).includes(t)) {
                            nbTargetsForSelector++;
                        } else if(nbTargetsForSelector >= ((admissibleTarget.admissibleTargets[admisibleTargetsIndex]) as TargetsSelector).min) {
                            admisibleTargetsIndex++;
                        }else {
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

    // set cleanup(cleanup: () => void) {
    //     this._cleanup = cleanup;
    // }
    // get cleanup(): () => void {
    //     return this._cleanup;
    // }

}
// Effect handler manages multiple effects of the same type of a card.
class EffectHandler{
    protected _effects: Effect[] = [];
    protected cleaners: (() => void)[] = [];

    constructor() {}
    
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
    constructor() {super();}

    addEffect(effect: Effect): void {
        if (effect.type === "passive")
            this._effects.push(effect);
        else throw new Error("Cannot put a non-passive effect in a PassiveEffectHandler.");
    }
    subscribeAll(issuerProvider: () => Entity, it: Card) {
        for (const effect of this._effects) {
            // Passive effects don't have targets, pass empty array
            let targets: any[] = [];
            // if(effect.targetsSelector.length > 0) {
            //     targets = effect.targetsSelector.map(selector => { selector.selector(owner as Player)[0]; });
            // }
            effect.effectFunction(new EffectData(it, issuerProvider, targets));
        }
    }
}

class ActiveEffectHandler extends EffectHandler {
    protected _type: "active" = "active";
    protected _activeEffect: Effect | null = null;
    constructor() {super();}


    addEffect(effect: Effect): void {
        switch (effect.type){
            case "active":
                if (this._activeEffect !== null)
                    throw new Error("Cannot have multiple active effects in an ActiveEffectHandler.");
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

class EffectInterface {
    private activeEffects: ActiveEffectHandler;
    private passiveEffects: PassiveEffectHandler;
    protected _issuer: Player | undefined;
    protected it: Card;

    constructor(it: Card) {
        this.activeEffects = new ActiveEffectHandler();
        this.passiveEffects = new PassiveEffectHandler();
        this.it = it;
    }

    addEffect(effect: Effect): void {
        if(effect.type === "passive") {
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
                throw new Error(`Payment denied for ${this.it.slug}.`);
            }
            // Effect gets second element of targets array
            return new EffectOnStack(effect.effectFunction, data, effect.description);
        }
        return new EffectOnStack(effect.effectFunction, data, effect.description);
    }
    
    tapEffect(issuer: Entity, targets: any[]): EffectOnStack {
        const effect = this.activeEffects.getActiveEffect();
        if(!issuer)
            throw new Error("EffectInterface.tapEffect: issuer is undefined or null.");
        const data = new EffectData(this.it, () => issuer as Player, targets);
        return new EffectOnStack(effect.effectFunction, data, effect.description);
    }
    // activeEffect(issuer: Entity, targets: any[], effectId: number): void {
    //     this.activeEffects.pay(issuer, this.it, targets, effectId);
    // }

    get activeEffectList(): {index: ("tap" | number), description: string}[] {
        let effects: {index: ("tap" | number), description: string}[] = [];
        if( this.activeEffects.hasTapEffect() )
            effects.push({index: "tap" as const, description: this.activeEffects.getActiveEffect().description});
        for (const [index, effect] of this.activeEffects.effectNames.entries()) 
            effects.push({index: index, description: effect});
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
            return () => {};
        }

        // Return a resolve function to be called later
        return async () => {
            if(this._issuer) {
                // Validate targets before calling effect function
                if (effect.targetStillValid(this._issuer!, targets)) {
                    await effect.effectFunction(new EffectData(this.it, () => this._issuer!, targets));
                }
                this.subscribeAll(() => this._issuer!);
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

class Card {
    protected _json: GenericCardType;
    protected _id: number;
    protected _globalId: number;
    protected _slug: string;
    protected _name: string;
    protected _type: DeckType;
    protected _subtype: string;
    protected _origin: string;
    protected _quote: string | undefined;
    protected _front: string;
    protected _back: string;
    protected _keywords: string[];
    protected _tags: { [key: string]: any };
    protected _minimumPlayers: number;
    protected _effectOutcomes: string[];
    protected _effectInterface: EffectInterface;
    protected _souls: number = 0;
    protected _charged: boolean = true;
    protected _owner!: Entity;
    protected _associatedEntity!: Entity;
    protected _eternal: boolean = false;
    protected _canBeDiscarded: boolean = true;
    protected _cleanup: (() => void)[] = [];
    protected _onFlip: (() => void)[] = [];
    protected _entity: Entity | undefined = undefined;
    protected _identityHash: string | null = null;

    constructor(id: number,
        globalId: number,
        json: GenericCardType) {
        this._json = json;
        this._id = id;
        this._globalId = globalId;
        this._slug = json.slug;
        this._name = json.name;
        this._type = json.type;
        this._subtype = json.type;
        this._origin = json.origin;
        this._quote = json.quote;
        this._front = json.front;
        this._back = json.back;
        this._keywords = [];
        this._tags = {};
        this._effectInterface = new EffectInterface(this);
        // this._tags = json.tags || {};
        this._minimumPlayers = json.minimumPlayers || 1;
        this._effectOutcomes = json.effectOutcome || [];
    }
    toString() : string {
        let toAdd:string = "";
        if(this._keywords.length > 0) {
            toAdd = ", " + this._keywords.join("; ");
        }
        if(this._tags && Object.keys(this._tags).length > 0) {
            toAdd = " " + JSON.stringify(this._tags);
        }
        return this._name + ": " + this._effectOutcomes.join(", ") + toAdd;
    }

    get activeEffectList(): {index: "tap" | number, description: string}[] {
        if(this instanceof LootCard && this.trinket)
            return [];
        if(this instanceof MonsterCard && this.isCurse)
            return [];
        return this._effectInterface.activeEffectList;
    }

    get entity(): Entity | undefined {
        return this._entity;
    }
    get hasEntity(): boolean {
        return this._entity !== undefined;
    }
    set entity(value: Entity | undefined) {
        this._entity = value;
    }
    get charged(): boolean {
        return this._charged;
    }
    set charged(value: boolean) {
        this._charged = value;
    }
    get soul(): number {
        return this._souls;
    }
    set soul(value: number) {
        this._souls = value;
    }
    get slug() : string {
        return this._slug;
    }
    get type() {
        return this._type;
    }
    set id(value: number) {
        this._id = value;
    }
    get id() {
        return this._id;
    }
    get globalId(): number {
        return this._globalId;
    }
    get name() {
        return this._name;
    }
    get minimumPlayers() {
        return this._minimumPlayers;
    }
    get effectOutcomes() {
        return this._effectOutcomes;
    }
    get keywords() {
        return this._keywords;
    }
    get tags() {
        return this._tags;
    }
    get json() {
        return this._json;
    }
    get jsonAPI() {
        return {
            slug: this._slug,
            name: this._name,
            globalId: this._globalId,
        };
    }
    get subtype(): string {
        return this._subtype;
    }
    get eternal(): boolean {
        return this._eternal;
    }
    get cleaners(): (() => void)[] {
        return this._cleanup;
    }
    get owner(): Entity {
        return this._owner;
    }
    set owner(value: Entity) {
        this._owner = value;
    }
    get canBeDiscarded(): boolean{
        return this._canBeDiscarded
    }
    set canBeDiscarded(value: boolean){
        this._canBeDiscarded = true;
    }
    flip(): void {
        [this._front, this._back] = [this._back, this._front];
        for (const onFlipEffect of this._onFlip) {
            onFlipEffect();
        }
    }

    private computeIdentityHash(): string {
        const keys = Object.keys(this._json)
            .filter(key => !["front", "back", "slug", "quote", "origin"].includes(key))
            .sort();
        const identityParts = keys.map(key =>
            `${key}:${JSON.stringify(this._json[key as keyof GenericCardType])}`
        );
        return identityParts.join('|');
    }

    private getIdentityHash(): string {
        if (this._identityHash === null) {
            this._identityHash = this.computeIdentityHash();
        }
        return this._identityHash;
    }

    isSameCard(other: Card): boolean {
        return this.getIdentityHash() === other.getIdentityHash();
    }
    cleanup(): void {
        for (const cleaner of this._cleanup) {
            cleaner();
        }
        this._cleanup = [];
    }

    recharge(): boolean {
        if (this._charged === false) {
            this._charged = true;
            return true;
        }
        return false;
    }

    deactivate(): void {
        if(this.hasTapEffect()) {
             this._charged = false;
        }
    }

    onAddInPlay(issuerProvider: () => Entity): void {
        this._owner = issuerProvider();
        this._effectInterface.subscribeAll(issuerProvider);
    }
    addEffect(effect: Effect) {
        this._effectInterface.addEffect(effect);
    }

    getActiveEffect(): Effect | undefined {
        return this._effectInterface.getActiveEffect();
    }

    hasTapEffect(): boolean {
        return this._effectInterface.hasTapEffect();
    }

    /**
     * Transforms this card to become a copy of another card.
     * Returns the original state so it can be restored later.
     * @param otherCard - The card to copy
     * @param attachEffects - Optional callback to attach effects to this card
     */
    becomesCopyOf(otherCard: Card, attachEffects?: (card: Card) => void): { originalState: any, restore: () => void } {
        // Store original state including cleanup array
        const originalState = {
            json: this._json,
            slug: this._slug,
            name: this._name,
            subtype: this._subtype,
            effectOutcomes: this._effectOutcomes,
            effectInterface: this._effectInterface,
            cleanup: [...this._cleanup], // Store a COPY of the cleanup array
            owner: this._owner,
        };

        // Don't cleanup here - we need to preserve the original effectInterface state
        // Cleanup will happen in restore() for the copied effects only
        
        // Copy properties from the other card
        this._json = otherCard._json;
        this._slug = otherCard._slug;
        this._name = otherCard._name;
        this._subtype = otherCard._subtype;
        this._effectOutcomes = otherCard._effectOutcomes;
        
        // Create a new effect interface
        this._effectInterface = new EffectInterface(this);
        
        // Clear cleanup array for the transformed state
        this._cleanup = [];
        
        // Attach effects if callback provided
        if (attachEffects) {
            attachEffects(this);
        }
        
        // Restore function
        const restore = () => {
            // Clean up copied effects
            this.cleanup();
            
            // Restore original properties
            this._json = originalState.json;
            this._slug = originalState.slug;
            this._name = originalState.name;
            this._subtype = originalState.subtype;
            this._effectOutcomes = originalState.effectOutcomes;
            this._effectInterface = originalState.effectInterface;
            this._cleanup = originalState.cleanup; // Restore the original cleanup array
            
            // Re-subscribe effects if we have an owner
            if (originalState.owner) {
                this._effectInterface.subscribeAll(() => originalState.owner);
            }
        };

        return { originalState, restore };
    }
}

enum InplayType { CHARGED, UNCHARGED, PASSIVE, PAID, PLAYABLE }
export class ItemCard extends Card {
  protected _inplayType: InplayType;
  protected _guppy: boolean = false;

  protected _cost: string;
    constructor(id: number, globalId: number, json: InPlayCardType) {
        super(id, globalId, json);
    this._guppy = json.guppy === true;
    this._cost = "";
    this._inplayType = InplayType.PASSIVE;
    if (json.effectOutcome !== undefined) {
      if (json.effectOutcome.join(", ").includes("[Tap Effect]")) {
        this._inplayType = InplayType.UNCHARGED;
      } else if (json.effectOutcome.join(", ").includes("[Paid Effect]")) {
        this._inplayType = InplayType.PAID;
      }
    }
  }

  get inPlayType(): InplayType {
    return this._inplayType;
  }
  isActiveItem(): boolean {
    return (
      this._inplayType === InplayType.CHARGED ||
      this._inplayType === InplayType.UNCHARGED
    );
  }
  getEffectTarget(effectId: number | "tap"): TargetsSelector[] {
    return this._effectInterface.getTargetSelectors(effectId);
  }

  // recharge(): boolean {
  //     if (this._inplayType === InplayType.UNCHARGED) {
  //         this._inplayType = InplayType.CHARGED;
  //         return true;
  //     }
  //     return false;
  // }

  // activate(): boolean {
  //     if (this._inplayType === InplayType.CHARGED) {
  //         this._inplayType = InplayType.UNCHARGED;
  //         return true;
  //     }
  //     if (this._inplayType === InplayType.PAID) {
  //         return true;
  //     }
  //     return false;
  // }
  get cost(): string {
    return this._cost;
  }
  isEternal(): boolean {
    return this._eternal;
  }
  isGuppy(): boolean {
    return this._guppy;
  }
  async tryActivateEffect(
    targets: any[] = [],
    effectId: number | "tap" = "tap"
  ): Promise<EffectOnStack> {
    switch (effectId) {
      case "tap":
        if (this._charged === true) {
          this._charged = false;
          return this._effectInterface.tapEffect(this._owner, targets);
        }
        throw new Error("Cannot activate uncharged item");
      default:
        return await this._effectInterface.paidEffect(this._owner, targets, effectId);
    }
  }
  targetStillValid(
    player: Player,
    effectId: number | "tap",
    targets: any[]
  ): boolean {
    return this._effectInterface.targetStillValid(player, effectId, targets);
  }
  setEternal(eternal: boolean): void {
    this._eternal = eternal;
  }
}

class LootCard extends ItemCard {
    protected _reward: CardRewards | undefined;
    protected _trinket: boolean = false;
    protected _afterEffect: "discard" | "addInPlay" | "nothing" = "discard";

    constructor(id: number, globalId: number, json: LootCardType) {
        super(id, globalId, json);
        this._inplayType = InplayType.PLAYABLE;
        this._reward = json.rewards;
        this._effectInterface = new EffectInterface(this);
        if (json.trinket) {
            this._trinket = json.trinket;
            this._inplayType = InplayType.PASSIVE;
            this._afterEffect = "addInPlay";
        }
    }

    get afterEffect(): "discard" | "addInPlay" | "nothing" {
        return this._afterEffect;
    }

    set afterEffect(value: "discard" | "addInPlay" | "nothing") {
        this._afterEffect = value;
    }

    get trinket(): boolean {
        return this._trinket;
    }

    onPlay(issuer: Player, targets: any[] = []): (() => void | Promise<void>) {
        this._owner = issuer;
        // Return a resolve function that captures trinket state
        const resolveFunction = this._effectInterface.onPlay(issuer, targets);
        return () => {
            return resolveFunction();
        };
    }

    getTargetSelectors(): TargetsSelector[] {
        return this._effectInterface.getTargetSelectors("tap");
    }
}

// Wrapper class to hold loot card effect resolution on the stack
export class LootCardEffect extends StackElement {
    private _card: LootCard;
    private targets: any[];
    private issuer: Player;

    constructor(issuer: Player, card: LootCard, targets: any[]) {
        super();
        this._card = card;
        this.targets = targets;
        this.issuer = issuer;
    }

    get card(): LootCard {
        return this._card;
    }

    async onResolve(): Promise<void> {
        await this._card.onPlay(this.issuer, this.targets)();
    }

    override get json(): LootCardOnStackJson {
        return {
            type: "LootCardEffect",
            card: this.card.jsonAPI,
            targets: TargetBuilder.convertToSelectionItems(this.targets),
            issuer: this.issuer.json,
            ...super.baseJson,
         } ;
    }
}

export class RoomCard extends ItemCard {
    constructor(id: number, globalId: number, json: RoomCardType) {
        super(id, globalId, json);
    }
}
class TreasureCard extends ItemCard {

    constructor(id: number, globalId: number, json: TreasureCardType) {
        super(id, globalId, json);
        this._subtype = json.subtype;
    }
}

class EternalCard extends ItemCard {
    constructor(id: number, globalId: number, json: EternalCardType) {
        super(id, globalId, json);
        this._eternal = true;
    }
}

class CharacterCard extends ItemCard {
    protected _eternalCard: string | null = null;
    protected _healthPoints: number = 0;
    protected _attackPoints: number = 0;

    constructor(id: number, globalId: number, json: CharacterCardType) {
        super(id, globalId, json);
        if(json.eternalCard) {
            this._eternalCard = json.eternalCard.slug;
        }
        if(json.stats) {
            this._healthPoints = json.stats.healthPoints || 0;
            this._attackPoints = json.stats.attackPoints || 0;
        }
        this._charged = false;
        this._eternal = true;
    }
    override onAddInPlay(issuerProvider: () => Entity): void {
        const owner = issuerProvider();
        super.onAddInPlay(issuerProvider);
        owner.addHealthPoints(this._healthPoints);
        owner.addAttackPoints(this._attackPoints);
    }
    onRemoveFromPlay(): void {

    }
    get eternalCard(): string | null {
        return this._eternalCard;
    }
    get healthPoints(): number {
        return this._healthPoints;
    }
    get attackPoints(): number {
        return this._attackPoints;
    }
}
/*
* MONSTER: attackable
* BOSS: attackable that gives soul on defeat.
* EVENT: not attackable, resolve effect on encounter.
*/
enum MonsterType {MONSTER, BOSS, EVENT}
class MonsterCard extends Card {
    protected _monsterType:MonsterType;
    protected _healthPoints:number = 0;
    protected _attackPoints:number = 0;
    protected _evasion: number = 0;
    protected _reward: CardRewards;
    protected _afterEffect: "discard" | "handled" | "nothing" = "discard";

    constructor(id: number, globalId: number, json: MonsterCardType) {
        super(id, globalId, json);
        this._monsterType = MonsterType.MONSTER;
        if(["gevent", "bevent", "curse"].includes(json.subtype)) {
            this._monsterType = MonsterType.EVENT;
        }
        this._subtype = json.subtype;
        this._reward = json.rewards || {soul: 0, coin: 0, loot: 0, treasure: 0};
        // Curses handle their own placement in player.curses
        if(this.isCurse) {
            this._afterEffect = "nothing";
        }
        if(json.stats) {
            this._healthPoints = json.stats.healthPoints || 0;
            this._attackPoints = json.stats.attackPoints || 0;
            this._evasion = json.stats.evasionPoints || 0;

            if (json.rewards){
                if (json.rewards.soul) {
                    this._monsterType = MonsterType.BOSS;
                    if (typeof json.rewards.soul === "number") {
                        this._souls = json.rewards.soul;
                    }
                }
            }
        }
    }
    get encounterType(): MonsterType {
        return this._monsterType;
    }
    get isCurse(): boolean {
        return this.subtype === "curse";
    }
    get isEvent(): boolean {
        return this._monsterType === MonsterType.EVENT;
    }
    get healthPoints(): number {
        return this._healthPoints;
    }
    get attackPoints(): number {
        return this._attackPoints;
    }
    get evasion(): number {
        return this._evasion;
    }
    get rewards(): CardRewards | undefined {
        return this._json.rewards;
    }
    /**
     * Determines what happens to the card after its effect is resolved.
     * Some cards handle their own placement after resolution.
     * For instance, curses are placed in the player's curse area and are not discarded.
     * Another example is "Delirium", that goes back into the deck 6 cards from the top.
     */
    get afterEffect(): "discard" | "nothing" | "handled"{
        return this._afterEffect;
    }
    set afterEffect(value: "discard" | "nothing" | "handled") {
        this._afterEffect = value;
    }
    async onPlay(issuer: Player, targets: any[] = []): Promise<void>{
        return this._effectInterface.onPlay(issuer, targets)();
    }
}

class BsoulCard extends Card {
    granted: boolean = false;

    override get jsonAPI() {
        return {
            slug: this._slug,
            name: this._name,
            globalId: this._globalId,
            granted: this.granted,
            ...( this.tags.counters !== undefined ? { counter: this.tags.counters } : {} ),
        };
    }
    
    constructor(id: number, globalId: number, json: BonusSoulCardType) {
        super(id, globalId, json);
        if (json.rewards && json.rewards.soul) {
            if(typeof json.rewards.soul === "number")
            {
                this._souls = json.rewards.soul;
            }
        }
    }
}
/**
 * Type mapping from Card classes to their corresponding JSON types
 */
type CardToJsonType<T extends Card> = 
    T extends LootCard ? LootCardType :
    T extends EternalCard ? EternalCardType :
    T extends CharacterCard ? CharacterCardType :
    T extends TreasureCard ? TreasureCardType :
    T extends MonsterCard ? MonsterCardType :
    T extends BsoulCard ? BonusSoulCardType :
    T extends RoomCard ? RoomCardType :
    GenericCardType;

/**
 * Creates a card instance from JSON data based on its type.
 * Overloaded signatures provide type inference based on JSON type.
 */
function createCardFromJson(id: number, globalId: number, json: LootCardType): LootCard;
function createCardFromJson(id: number, globalId: number, json: TreasureCardType): TreasureCard;
function createCardFromJson(id: number, globalId: number, json: EternalCardType): EternalCard;
function createCardFromJson(id: number, globalId: number, json: CharacterCardType): CharacterCard;
function createCardFromJson(id: number, globalId: number, json: MonsterCardType): MonsterCard;
function createCardFromJson(id: number, globalId: number, json: BonusSoulCardType): BsoulCard;
function createCardFromJson(id: number, globalId: number, json: RoomCardType): RoomCard;
function createCardFromJson(id: number, globalId: number, json: GenericCardType): Card;
function createCardFromJson(id: number, globalId: number, json: GenericCardType): Card {
    switch (json.type) {
        case "loot":
            return new LootCard(id, globalId, json);
        case "treasure":
            return new TreasureCard(id, globalId, json);
        case "eternal":
            return new EternalCard(id, globalId, json);
        case "character":
            return new CharacterCard(id, globalId, json);
        case "monster":
            return new MonsterCard(id, globalId, json);
        case "bsoul":
            return new BsoulCard(id, globalId, json);
        case "room":
            return new RoomCard(id, globalId, json);
        default:
            console.log(`Unknown card: ${json}, adding as generic Card.`);
            return new Card(id, globalId, json);
    }
}

class CardSet<T extends Card> {
    protected _set: T[];
    protected _type: string;
    constructor(type: string) {
        this._type = type
        this._set = []
    }
    addCard(json: GenericCardType, globalId: number) : void{
        this._set.push(createCardFromJson(this._set.length, globalId, json) as T);
        return;
    }
    get(id: number) : T {
        if(this._set === undefined) {
            throw new Error(`Card set of type ${this._type} is undefined.`);
        }
        if (id < 0 || id >= this._set.length) {
            throw new Error(`Card id ${id} is out of bounds for card set of length ${this._set.length}`);
        }
        if(typeof this._set[id] === "undefined" || this._set[id] === null) {
            throw new Error(`Card id ${id} is undefined or null in card set of type ${this._type}.`);
        }
        return this._set[id];
    }

    id(card: T) : number {
        const index = this._set.indexOf(card);
        if (index === -1) {
            throw new Error(`Card not found in card set.`);
        }
        return index;
    }
    get type() : string{ 
        return this._type; }
    get length() : number{ 
        return this._set.length; }
    get cards() : T[] { 
        return this._set; 
    }
    showAllCards() : void {
        this._set.forEach((card) => {
            console.log(card);
        });
    }
}
/*
* Loads card sets from an array of json cards.
* Returns a dictionary of card sets indexed by their type.
*/
function LoadsCardSets(json_array: GenericCardType[]) : {nextGlobalId: number, cardSets: CardSetsCollection} {
    const sets: CardSetsCollection = {
        loot: new CardSet<LootCard>('loot'),
        treasure: new CardSet<TreasureCard>('treasure'),
        eternal: new CardSet<EternalCard>('eternal'),
        character: new CardSet<CharacterCard>('character'),
        monster: new CardSet<MonsterCard>('monster'),
        bsoul: new CardSet<BsoulCard>('bsoul'),
        room: new CardSet<RoomCard>('room'),
    };
    json_array.sort((a, b) => 
        (a.name + a.slug).localeCompare(b.name + b.slug)
    );
    let globalId = 0;
    for(let index:number = 0; index < json_array.length; index++) {
        const card_json = json_array[index];
        if (typeof card_json === "undefined" || card_json === null) {
            throw new Error(`Card id ${card_json} is undefined or null in card set.`);
        }
        const type: string = String(card_json.type);
        
        switch(type) {
            case "loot":
                sets.loot.addCard(card_json, globalId++);
                break;
            case "treasure":
                sets.treasure.addCard(card_json, globalId++);
                break;
            case "eternal":
                sets.eternal.addCard(card_json, globalId++);
                break;
            case "character":
                sets.character.addCard(card_json, globalId++);
                break;
            case "monster":
                sets.monster.addCard(card_json, globalId++);
                break;
            case "bsoul":
                sets.bsoul.addCard(card_json, globalId++);
                break;
            case "room":
                sets.room.addCard(card_json, globalId++);
                break;
            default:
                throw new Error(`Unknown card type: ${type}. Only loot, treasure, eternal, character, monster, bsoul, and room are allowed.`);
        }
    }
    return {nextGlobalId: globalId, cardSets: sets};
}

function prepareEffectString(s: string): string {
    s = s.replace("[Tap Effect]", ""); // remove tap effect marker
    s = s.replace("[Paid Effect]", ""); // remove paid effect marker
    s = s.replace("[Curse Effect] ", ""); // remove curse effect marker
    s = s.trim();
    return s;
}
export class EffectOnStack extends StackElement {
    protected _effectFunction: EffectFunction
    protected _data: EffectData;
    protected _description: string;

    constructor(effectFunction: EffectFunction, data: EffectData, description: string) {
        super();
        // if(!data)
        //     throw new Error("EffectOnStack constructor: data is undefined or null.");
        this._effectFunction = effectFunction;
        this._data = data;
        this._description = prepareEffectString(description);
    }
    async onResolve(): Promise<boolean> {
        return await this._effectFunction(this._data);
    }

    get data(): EffectData {
        return this._data;
    }
    set targets(targets: any[]) {
        this._data.targets = targets;
        // Reset the consumption index when targets are set externally
        (this._data as any)._nextIndex = 0;
    }
    override get json(): EffectOnStackJson {
        return { 
            type: "effect",
            issuer: this._data.issuer.json, 
            targets: TargetBuilder.convertToSelectionItems([...this._data.targets, ...this._data.selectedOnResolve]), 
            card: this.data.it.jsonAPI, 
            effect: this._description,
            ...super.baseJson,
        };
    }
}
class Deck<T extends Card> {
    _type: DeckType;
    _nextId: number;
    _set: CardSet<T>
    _order: number[];
    _discard: number[];
    _random: () => number;

    constructor(set: CardSet<T>, type: DeckType, order: number[], random: () => number) {
        // Type of cards in the deck.
        this._type = type;
        // Set of all the cards that can belong to the deck.
        this._set = set;
        // reverse order of the cards ids remaining in the deck.
        this._order = order.reverse();
        this._nextId = order.length - 1;
        // Set of discarded cards of the deck.
        this._discard = [];
        this._random = random;

        order.forEach((id) => {
            const card = this._set.get(id);
        });
    }

    get nextId(){
        return ++this._nextId;
    }

    get length(): number {
        return this._order.length;
    }

    shuffle(): void {
        shuffle<number>(this._random, this._order)
    }

    remove(card:T)
    {
        assertCardMatchesDeck(this._type, card);
        const cardId = card.id;
        const setCardId = this._set.id(card);
        if(cardId !== setCardId)
        {
            throw new Error("Card to remove does not belong to this deck's card set.");
        }
        const index = this._order.indexOf(cardId);
        if(index >= 0)
        {
            this._order.splice(index, 1);
        }
        else{
            const discardIndex = this._discard.indexOf(cardId);
            if(discardIndex >= 0)
            {
                this._discard.splice(discardIndex, 1);
            }
            else{
                throw new Error("Card to remove not found in deck or discard pile.");
            }
        }
    }

    draw(): T {
        return this.drawCardAt(0);
    }
    get cards(): T[] {
        return this._order.map((id) => this._set.get(id)).reverse();
    }
    drawSeveral(n: number): T[] {
        const cards = Array(n)
        for (let i = 0; i < n; i++) {
            if (this._order.length == 0) {
                this.resetDiscard();
            }
            cards[i] = this.draw();
        }
        return cards;
    }

    drawCardAt(positionFromTop: number): T {
        if (this._order.length < positionFromTop + 1) {
            this.resetDiscard();
        }
        const posFromEnd: number = this._order.length - 1 - positionFromTop;
        if (posFromEnd >= this._order.length) {
            throw new Error(`Cannot draw card at position ${positionFromTop} from top, deck of type ${this._type} has only ${this._order.length} cards.`);
        }
        if(posFromEnd < 0 || this._order.length === 0)
        {
            throw new Error(`Cannot draw card at position ${positionFromTop} from top even after resetting discard, deck of type ${this._type} has only ${this._order.length} cards.`);
        }
        const id: number = this._order[posFromEnd]!;
        if(id === undefined || id === null) {
            throw new Error(`Card id at position ${positionFromTop} from top is undefined or null in deck of type ${this._type}.`);
        }
        if(this._set === undefined) {
            throw new Error(`Card set of type ${this._type} is undefined.`);
        }
        // console.log(`Drawing card id ${id} from deck of type ${this._type} at position from top ${positionFromTop}.`);
        const result = this._set.get(id);
        this._order.splice(posFromEnd, 1);
        return result;
    }

    addTopPosition(card: T): void {
        assertCardMatchesDeck(this._type, card);
        this.addCardAtPosFromTop(card, 0);
    }

    addBottomPosition(card: T): void {
        assertCardMatchesDeck(this._type, card);
        this.addCardAtPosFromTop(card, this._order.length);
    }
    addCardAtPosFromTop(card: T, positionFromTop: number): void {
        assertCardMatchesDeck(this._type, card);
        const posFromEnd = Math.max(this._order.length - positionFromTop, 0);
        this._order.splice(posFromEnd, 0, card.id);
    }
    addRandomPosition(card: T): void {
        assertCardMatchesDeck(this._type, card);
        const randomIdx = Math.floor(this._random() * this._order.length);
        this.addCardAtPosFromTop(card, randomIdx);
    }

    addDiscardTop(card: T): void {
        assertCardMatchesDeck(this._type, card);
        this._discard.push(card.id);
    }

    drawTopDiscard(): T | null {
        if (this._discard.length === 0) {
            return null;
        }
        const id = this._discard.pop()!;
        if (typeof id === "undefined" || id === null) {
            throw new Error(`Card id drawn from discard pile is undefined or null in deck of type ${this._type}.`);
        }
        return this._set.get(id);
    }

    get discard(): T[] {
        const result = []
        for (let i = this._discard.length - 1; i >= 0; i--) {
            const id = this._discard[i];
                if (typeof id !== "undefined" && id !== null) {
                    result.push(this._set.get(id));
                }
                
        }
        return result;
    }

    shuffleDiscard(): void {
        shuffle<number>(this._random, this._discard);
    }

    resetDiscard(): void {
        this.shuffleDiscard();
        this._order = this._discard.concat(this._order);
        this._discard = [];
    }
    getCardFromSlug(slug: string, globalId?: number) : T|undefined {
        const res = this.getCard((card) =>
            card.slug === slug && (globalId === undefined || card.globalId === globalId)
        );
        if( res === undefined ) {
            throw new Error(
                globalId === undefined
                    ? `No card with slug ${slug} found in deck of type ${this._type}.`
                    : `No card with slug ${slug} and global id ${globalId} found in deck of type ${this._type}.`
            );
        }
        return  res;
    }
    getCard(filter: (card: T) => boolean) : T|undefined {
        for (let i = 0; i < this._order.length; i++) {
            const id = this._order[i];
            if (typeof id !== "undefined" && id !== null) {
                const card = this._set.get(id);
                if (filter(card)) {
                    const positionFromTop = this._order.length - 1 - i;
                    // console.log(`Found card ${card.slug} at position from top ${positionFromTop}.`);
                    const card: T = this.drawCardAt(positionFromTop);
                    return card;
                }
            }
        }
        return undefined;
    }

    getCards(filter: (card: T) => boolean) : T[] {
        const result: T[] = [];
        for (let i = 0; i < this._order.length; i++) {
            const id = this._order[i];
            if (typeof id !== "undefined" && id !== null) {
                const card = this._set.get(id);
                if (filter(card)) {
                    const positionFromTop = this._order.length - 1 - i;
                    // console.log(`Found card ${card.slug} at position from top ${positionFromTop}.`);
                    result.push(this.drawCardAt(positionFromTop)!);
                }
            }
        }
        return result;
    }
    ////// debug //////
    displayAllCards(): void {
        this._order.forEach((id) => {
            const card = this._set.get(id);
            console.log(card?.slug);
        });
    }
    displayOrder(): void {
        console.log(this._order.reverse());
        this._order.reverse();
    }
}

class Hand {
    _hand: LootCard[];
    constructor() {
        this._hand = []
    }
    get length(): number {
        return this._hand.length;
    }
    get cards(): LootCard[] {
        return this._hand;
    }
    addToHand(card: LootCard) {
        if (card.type !== "loot") {
            print("Error, hand should only contain loot cards.")
            throw new Error("Hand can only contain loot cards.");
        }
        this._hand.push(card);
    }
    moveCardToPos(from: number, to: number) {
        const card: LootCard = this._hand[from]!;
        this._hand.splice(from, 1);
        this._hand.splice(to, 0, card);
    }
    removeFromHandByPos(pos: number) : LootCard {
        const card: LootCard = this._hand[pos]!;
        this._hand.splice(pos, 1);
        return card;
    }
    removeCard(target: LootCard): boolean{
        const index = this._hand.indexOf(target);
        if(index >= 0)
        {
            this.removeFromHandByPos(index);
            return true;
        }
        return false;
    }
    playCard(index: number) : LootCard {
        return this.removeFromHandByPos(index);
    }
}

export function isDeckType(value: string): value is DeckType {
    return ['loot', 'treasure', 'eternal', 'character', 'monster', 'bsoul', 'room'].includes(value);
}

export function assertCardMatchesDeck<T extends DeckType>(
    deckName: T,
    card: Card
): asserts card is DeckTypeToCardType[T] {
    if (card === undefined || card.type !== deckName) {
        throw new Error(`Card type ${card?.type} doesn't match deck ${deckName}`);
    }
}

function createEmptyDecksCollection(random: () => number): DecksCollection {
    const emptyCardSets = {
        loot: new CardSet<LootCard>('loot'),
        treasure: new CardSet<TreasureCard>('treasure'),
        eternal: new CardSet<EternalCard>('eternal'),
        character: new CardSet<CharacterCard>('character'),
        monster: new CardSet<MonsterCard>('monster'),
        bsoul: new CardSet<BsoulCard>('bsoul'),
        room: new CardSet<RoomCard>('room'),
    };
    return {
        loot: new Deck(emptyCardSets.loot, 'loot', [], random),
        treasure: new Deck(emptyCardSets.treasure, 'treasure', [], random),
        eternal: new Deck(emptyCardSets.eternal, 'eternal', [], random),
        character: new Deck(emptyCardSets.character, 'character', [], random),
        monster: new Deck(emptyCardSets.monster, 'monster', [], random),
        bsoul: new Deck(emptyCardSets.bsoul, 'bsoul', [], random),
        room: new Deck(emptyCardSets.room, 'room', [], random),
    };
}

// Module-level cache for getCardsByCopy results - avoids recomputing across game instances
const cardSetCopyCache = new WeakMap<CardSet<any>, any[][]>();

function getCardsByCopy<T extends Card>(set: CardSet<T>): T[][] {
    // Return cached result if available
    if (cardSetCopyCache.has(set)) {
        return cardSetCopyCache.get(set)!;
    }
    const copies: T[][] = [];
     for (let i = 0; i < set.length; i++) {
        const card = set.get(i);
        const copyIndex = copies.findIndex((copyGroup) => copyGroup[0]!.isSameCard(card));
        if (copyIndex === -1) {
            copies.push([card]);
        } else {
            copies[copyIndex]!.push(card);
        }
    }
    // Cache the result for future calls with the same CardSet
    cardSetCopyCache.set(set, copies);
    return copies;
}
function LoadDecks(json_array: GenericCardType[], numPlayers: number, parameters: GameParameters, random: () => number) : DecksCollection {
    // Create fresh CardSets from JSON to ensure independent card instances
    let {nextGlobalId, cardSets: decks_cardSets} = LoadsCardSets(json_array);
    
    const decks = {} as DecksCollection;
    const cardTypes: (keyof CardSetsCollection)[] = ['loot', 'treasure', 'eternal', 'character', 'monster', 'bsoul', 'room'];
    for (const type of cardTypes) {
        const set = decks_cardSets[type] as CardSet<any>;
        if (set.length === 0) {
            continue;
        }
        
        let range = [];
        if(['eternal', 'character'].includes(type) )
            for (let i = 0; i < set.length; i++) {
                range.push(i);
            }
        else
        {
            const copies = getCardsByCopy<Card>(decks_cardSets[type] as CardSet<Card>);
            const paramType = type as 'loot' | 'treasure' | 'monster' | 'bsoul' | 'room';
            const paramCards = parameters[paramType].json(); // Cache to avoid repeated calls
            
            // Build slug→copies Map for O(1) lookup instead of O(n) search
            const slugToCopies = new Map<string, Card[]>();
            for (const copyGroup of copies) {
                if (copyGroup.length > 0) {
                    slugToCopies.set(copyGroup[0]!.slug, copyGroup);
                }
            }
            
            for (const cardParam of paramCards) {
                const copyGroup = slugToCopies.get(cardParam.slug);
                if (copyGroup === undefined) {
                    throw new Error(`Card with slug ${cardParam.slug} not found in card set of type ${type}.`);
                }
                let next_set_id = 0;
                let createCopy = false;
                for(let counter = 0; counter < cardParam.count; counter++) {
                    let nextId = copyGroup[next_set_id]!.id;
                    if (createCopy) {
                        nextId = decks_cardSets[type]!.length;
                        decks_cardSets[type]!.cards.push(createCardFromJson(nextId, nextGlobalId++, copyGroup[next_set_id]!.json) as any);
                    }
                    range.push(nextId);
                    next_set_id = (next_set_id + 1) % copyGroup.length;
                    if(next_set_id === 0)
                        createCopy = true;
                }
            }
        }
        shuffle<number>(random, range);
        (decks as any)[type] = new Deck(set, type, range, random);
    }
    
    return decks;
}

function isSameSlug(slug: string, card: Card) : boolean   
{
    return card.slug === slug;
}

function randomCardFromSet<T extends Card>(set: CardSet<T>, random: () => number) : T {
    const randomIndex = Math.floor(random() * set.length);
    const card = set.get(randomIndex);
    if (card === undefined) {
    throw new Error(`Card id ${randomIndex} is out of bounds for card set of length ${set.length}`);
    }
    return card;
}

export { EffectData } from './types/cardTypes';
export type { CardSetsCollection, DecksCollection, DeckType, DeckTypeToCardType, EffectFunction, EffectType, TargetsSelector } from './types/cardTypes';
export { BsoulCard, Card, CardSet, CharacterCard, createCardFromJson, createEmptyDecksCollection, Deck, EternalCard, Hand, InplayType, isSameSlug, LoadDecks, LoadsCardSets, LootCard, MonsterCard, MonsterType, randomCardFromSet, TreasureCard as TreasureCard };

