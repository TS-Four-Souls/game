import { shuffle, print } from '@/utils/auxiliary';
import { chooseOneTargetSelector, effectParser, targetSelectorParser, isChooseOneResult, type ChooseOneOptions, type ChooseOneResult, isChooseOneOptions } from '@/models/effectParser';
import type { CardRewards, EternalCardType, GenericCardType, LootCardType, InPlayCardType, TreasureCardType, CharacterCardType, MonsterCardType, BonusSoulCardType, GuppyCard } from '@/types/cardTypes';
import { Player } from './player';
import { assert } from 'console';
import type { Entity } from './entity';
import type { Game } from './game';

export type EffectType =
    | "passive"
    | "active"
    | "paid";

export class Effect {
    protected _description: string;
    protected _effectFunction: EffectFunction;
    protected _targetsSelector: TargetsSelector[];
    protected _cleanup: () => void = () => {};
    protected _type: EffectType;
    // protected _cleanup: () => void = () => {};

    constructor(description: string,
        type: EffectType,
        effectFunction: EffectFunction
            = (data: EffectData) => { return true; },
        targetsSelector: TargetsSelector[]
            = [{ description: "", selector: (issuer: Player) => [] }]
    ) {
        this._description = description;
        this._type = type;
        this._effectFunction = effectFunction;
        this._targetsSelector = targetsSelector;
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

    // Target validation methods
    private chooseOneTargetStillValid(issuer: Player, targets: any[]): boolean {
        if (targets.length > 1)
            throw new Error("chooseOne target should have length at most 1.");
        for (const chooseOneTarget of targets) {
            const descr = chooseOneTarget.description;
            const targetsList = chooseOneTarget.chosenOptions;
            if (targetsList.length > 0) {
                for (const admissibleTarget of this._targetsSelector[0]!.selector(issuer)) {
                    if (admissibleTarget.description === descr) {
                        for (const t of targetsList) {
                            if (!admissibleTarget.admissibleTargets.includes(t)) {
                                return false;
                            }
                        }
                        return true;
                    }
                }
            }
        }
        return true;
    }

    targetStillValid(issuer: Player, targets: any[]): boolean {
        if (targets.length > 0) {
            for (const i in this._targetsSelector) {
                if (targets[i]?.length > 0) {
                    const admissibleTargets = this._targetsSelector[i]!.selector(issuer);
                    if (isChooseOneResult(targets[i][0])) {
                        return this.chooseOneTargetStillValid(issuer, [targets[i][0]]);
                    } else {
                        for (const targetId in targets) {
                            if (!admissibleTargets[targetId]?.includes(targets[targetId][0])) {
                                return false;
                            }
                        }
                    }
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
    subscribeAll(owner: Entity, it: Card) {
        for (const effect of this._effects) {
            // Passive effects don't have targets, pass empty array
            effect.effectFunction({ it, issuer: owner as Player, targets: [] });
        }
    }
}

class ActiveEffectHandler extends EffectHandler {
    protected _type: "active" = "active";
    constructor() {super();}


    addEffect(effect: Effect): void {
        if (effect.type !== "passive")
            this._effects.push(effect);
        else throw new Error("Cannot put a passive effect in an ActiveEffectHandler.");
    }

    getEffect(index: number = 0): Effect | undefined {
        return this._effects.length > index ? this._effects[index] : undefined;
    }

    activeEffect(issuer: Entity, it: Card, effectId: number, targets: any[]): void {
        if (this._type !== "active" && this._effects.length > 0)
            throw new Error("activeEffect can only be called for active effects.");
        // Implement shovel and blank card before uncommenting this
        // if( effectId < 0 || effectId >= this._effects.length) { 
        //     throw new Error(`Effect id ${effectId} is out of bounds for active effects of length ${this._effects.length}.`);
        // }
        const effect = this._effects[effectId];
        if (effect) {
            if (effect.type !== "passive") {
                effect.effectFunction({ it, issuer: issuer as Player, targets: targets });
            }
        }
    }

    getTargetSelectors(index: number): TargetsSelector[] {
        return this._effects[index]?.targetsSelector || [];
    }

    get effectNames(): string[] {
        return this._effects.map(e => e.description);
    }

    getEffectId(description: string): number {
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
    
    subscribeAll(owner: Entity): void {
        this.passiveEffects.subscribeAll(owner, this.it);
    }
    
    activeEffect(issuer: Entity, targets: any[], effectId: number): void {
        this.activeEffects.activeEffect(issuer, this.it, effectId, targets);
    }

    // Get the first active effect (for cards that have a single effect)
    getActiveEffect(index: number = 0): Effect | undefined {
        return this.activeEffects.getEffect(index);
    }

    getEffectType(index: number = 0): EffectType {
        const effect = this.activeEffects.getEffect(index);
        if (!effect) {
            throw new Error(`Effect at index ${index} not found.`);
        }
        return effect.type;
    }

    getTargetSelectors(index: number): TargetsSelector[] {
        return this.activeEffects.getTargetSelectors(index);
    }
    // Lifecycle methods for loot cards - onPlay takes targets as parameter and returns a resolve function
    onPlay(issuer: Player, targets: any[]): (() => void) {
        this._issuer = issuer;
        const effect = this.activeEffects.getEffect(0);
        if (!effect) {
            return () => {};
        }

        // Return a resolve function to be called later
        return () => {
            const trinket = (this.it as LootCard).trinket
            if(this._issuer) {
                if(trinket) {
                    this._issuer.addInPlay(this.it);
                }
                   // Validate targets before calling effect function
                   if (effect.targetStillValid(this._issuer!, targets)) {
                       effect.effectFunction({ it: this.it, issuer: this._issuer!, targets: targets });
                   } else {
                       console.log("EffectInterface.onPlay resolve: targetStillValid() returned false for", (this.it as any).name);
                   }
            }
        };
    }

    debugSetTargets(targets: any[]): void {
        // This method is deprecated - targets should be passed to onPlay instead
        console.warn("debugSetTargets is deprecated. Pass targets to onPlay instead.");
    }
}

class Card {
    protected _json: GenericCardType;
    protected _id: number;
    protected _slug: string;
    protected _name: string;
    protected _type: string;
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
    protected _charged: boolean = false;
    protected _owner!: Player;
    protected _eternal: boolean = false;
    protected _position: Deck | null | Hand | Card[];
    protected _cleanup: (() => void)[] = [];
    constructor(id: number, 
        json: GenericCardType) {
        this._json = json;
        this._id = id;
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
        this._position = null;
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
    get id() {
        return this._id;
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
    get subtype(): string {
        return this._subtype;
    }
    get eternal(): boolean {
        return this._eternal;
    }
    get cleaners(): (() => void)[] {
        return this._cleanup;
    }
    cleanup(): void {
        for (const cleaner of this._cleanup) {
            cleaner();
        }
    }

    recharge(): boolean {
        if (this._charged === false) {
            this._charged = true;
            return true;
        }
        return false;
    }

    activate(targets: any[], effectId: number): boolean {
        // Implement shovel and blank card before uncommenting this
        // switch (this._effectInterface.getEffectType(effectId)) {
        //     case "active":
        //         this._effectInterface.activeEffect(this._owner, targets, effectId);
        //         this._charged = false;
        //         return true;
        //     case "paid":
        //         this._effectInterface.activeEffect(this._owner, targets, effectId);
        //         return true;
        //     default:
        //         break;
        // }
        // return false;
        // Temporary implementation until shovel and blank card are done, assuming effectId 0 is active effect.
        if (this._charged === true && effectId === 0) {
            this._effectInterface.activeEffect(this._owner, targets, effectId);
            this._charged = false;
            return true;
        }
        else if (effectId > 0) {
            this._effectInterface.activeEffect(this._owner, targets, effectId);
            return true;
        }
        return false;
    }
    onAddInPlay(owner: Player): void {
        this._owner = owner;
        this._effectInterface.subscribeAll(owner);
    }
    addEffect(effect: Effect) {
        this._effectInterface.addEffect(effect);
    }
}

export type TargetsSelector = 
{
    description: string;
    selector: (issuer: Player) => any[];
};

export type EffectData = {
    it: Card,
    issuer: Player,
    targets: any[]
}
export type EffectFunction = (data: EffectData) => boolean;

enum InplayType { CHARGED, UNCHARGED, PASSIVE, PAID, PLAYABLE }
export class ItemCard extends Card {
    protected _inplayType: InplayType;
    protected _guppy: boolean = false;

    protected _cost: string;
    constructor(id: number, json: InPlayCardType) {
        super(id, json);
        this._guppy = (json as GuppyCard).guppy === true;
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
        return this._inplayType === InplayType.CHARGED || this._inplayType === InplayType.UNCHARGED;
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
    onTap(targets: any[] = [], effectId: number =0): void {
        this.activate(targets, effectId);
    }
    setEternal(eternal: boolean): void {
        this._eternal = eternal;
    }
}

class LootCard extends ItemCard {
    protected _reward: CardRewards | undefined;
    protected _trinket: boolean = false;

    constructor(id: number, json: LootCardType) {
        super(id, json);
        this._inplayType = InplayType.PLAYABLE;
        this._reward = json.rewards;
        this._effectInterface = new EffectInterface(this);
        if (json.trinket) {
            this._trinket = json.trinket;
            this._inplayType = InplayType.PASSIVE;
        }
    }

    get trinket(): boolean {
        return this._trinket;
    }

    onPlay(issuer: Player, targets: any[] = []): () => void {
        // Return a resolve function that captures trinket state
        const resolveFunction = this._effectInterface.onPlay(issuer, targets);
        return () => {
            resolveFunction();
        };
    }

    getTargetSelectors(): TargetsSelector[] {
        return this._effectInterface.getTargetSelectors(0);
    }
}

// Wrapper class to hold loot card effect resolution on the stack
export class LootCardEffect {
    private card: LootCard;
    private resolve: () => void;

    constructor(card: LootCard, resolveFunction: () => void) {
        this.card = card;
        this.resolve = resolveFunction;
    }

    onResolve(): void {
        this.resolve();
    }

    get json() {
        return this.card.json;
    }
}

class treasureCard extends ItemCard {

    constructor(id: number, json: TreasureCardType) {
        super(id, json);
        this._subtype = json.subtype;
    }
}

class eternalCard extends ItemCard {
    constructor(id: number, json: EternalCardType) {
        super(id, json);
        this._eternal = true;
    }
}

class CharacterCard extends ItemCard {
    protected _eternalCard: string | null = null;
    protected _healthPoints: number = 0;
    protected _attackPoints: number = 0;

    constructor(id: number, json: CharacterCardType) {
        super(id, json);
        if(json.eternalCard) {
            this._eternalCard = json.eternalCard.slug;
        }
        if(json.stats) {
            this._healthPoints = json.stats.healthPoints || 0;
            this._attackPoints = json.stats.attackPoints || 0;
        }
        this._eternal = true;
    }

    onTapChara(targets: any[] = []): void {
        console.log(`Tapping character card ${this.name}.`);
        if(this._owner === undefined) {
            throw new Error("CharacterCard has no owner assigned.");
        }
        if (this.charged) {
            this.charged = false;
            // Get the active effect and execute it directly
            const activeEffect = this._effectInterface.getActiveEffect(0);
            if (activeEffect) {
                // Validate targets before calling effect function
                if (activeEffect.targetStillValid(this._owner, targets)) {
                    activeEffect.effectFunction({ it: this, issuer: this._owner, targets: targets });
                } else {
                    console.log("CharacterCard.onTapChara: targetStillValid() returned false for", this.name);
                }
            }
        }
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

    constructor(id: number, json: MonsterCardType) {
        super(id, json);
        this._monsterType = MonsterType.EVENT;
        this._subtype = json.subtype;
        this._reward = json.rewards || {soul: 0, coin: 0, loot: 0, treasure: 0};
        if(json.stats) {
            this._healthPoints = json.stats.healthPoints || 0;
            this._attackPoints = json.stats.attackPoints || 0;
            this._evasion = json.stats.evasionPoints || 0;

            if (json.rewards && json.rewards.soul) {
                this._monsterType = MonsterType.BOSS;
                if (typeof json.rewards.soul === "number") {
                    this._souls = json.rewards.soul as number;
                }
            } else {
                this._monsterType = MonsterType.MONSTER;
            }
        }
    }
    get encounterType(): MonsterType {
        return this._monsterType;
    }
    get isCurse(): boolean {
        return this.subtype === "curse";
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
}

class BsoulCard extends Card {
    constructor(id: number, json: BonusSoulCardType) {
        super(id, json);
        if (json.rewards && json.rewards.soul) {
            if(typeof json.rewards.soul === "number")
            {
                this._souls = json.rewards.soul;
            }
        }
    }
}

class CardSet {
    protected _set: Card[];
    protected _type: string;
    constructor(type: string) {
        this._type = type
        this._set = []
    }
    addCard(json: GenericCardType) : void{
        if(json.type === "loot") {
            this._set.push(new LootCard(this._set.length, json));
        }
        else if(json.type === "treasure") {
            this._set.push(new treasureCard(this._set.length, json ));
        }
        else if(json.type === "eternal") {
            this._set.push(new eternalCard(this._set.length, json ));
        }
        else if(json.type === "character") {
            this._set.push(new CharacterCard(this._set.length, json ));
        }
        else if(json.type === "monster") {
            this._set.push(new MonsterCard(this._set.length, json ));
        }
        else if(json.type === "bsoul") {
            this._set.push(new BsoulCard(this._set.length, json ));
        }
        else{
            console.log(`Unknown card: ${json}, adding as generic Card.`);
            this._set.push(new Card(this._set.length, json ));
        }
        return;
    }
    get(id: number) : Card {
        if(this._set === undefined) {
            throw new Error(`Card set of type ${this._type} is undefined.`);
        }
        if (id < 0 || id >= this._set.length) {
            throw new Error(`Card id ${id} is out of bounds for card set of length ${this._set.length}`);
        }
        if(typeof this._set[id] === "undefined" || this._set[id] === null) {
            throw new Error(`Card lllll id ${id} is undefined or null in card set of type ${this._type}.`);
        }
        return this._set[id];
    }

    id(card: Card) : number {
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
    get cards() : Card[] { 
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
function LoadsCardSets(json_array: GenericCardType[]) : {[key: string]: CardSet} {
    const sets: {[key: string]: CardSet} = {};
    for(let index:number = 0; index < json_array.length; index++) {
        const card_json = json_array[index];
        if (typeof card_json === "undefined" || card_json === null) {
            throw new Error(`Card id ${card_json} is undefined or null in card set.`);
        }
        const type: string = String(card_json.type);
        let set = sets[type];
        if (!set) {
            set = new CardSet(type);
            sets[type] = set;
        }
        set.addCard(card_json);
    }
    return sets;
}
class Deck {
    _type: string;
    _set: CardSet
    _order: number[];
    _discard: number[];

    constructor(set: CardSet, type: string, order: number[]) {
        // Type of cards in the deck.
        this._type = type;
        // Set of all the cards that can belong to the deck.
        this._set = set;
        // reverse order of the cards ids remaining in the deck.
        this._order = order.reverse();
        // Set of discarded cards of the deck.
        this._discard = [];

        order.forEach((id) => {
            const card = this._set.get(id);
        });
    }

    get length(): number {
        return this._order.length;
    }

    shuffle(): void {
        shuffle<number>(this._order)
    }

    remove(card:Card)
    {
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

    draw(): Card {
        // console.log(`Drawing card from deck of type ${this._type}.`);
        return this.drawCardAt(0);
    }
    get cards(): Card[] {
        return this._order.map((id) => this._set.get(id)).reverse();
    }
    drawSeveral(n: number): Card[] {
        const cards = Array(n)
        for (let i = 0; i < n; i++) {
            if (this._order.length == 0) {
                this.resetDiscard();
            }
            cards[i] = this.draw();
        }
        return cards;
    }

    drawCardAt(positionFromTop: number): Card {
        if (this._order.length < positionFromTop + 1) {
            this.resetDiscard();
        }
        const posFromEnd: number = this._order.length - 1 - positionFromTop;
        if (posFromEnd < 0 || posFromEnd >= this._order.length) {
            throw new Error(`Cannot draw card at position ${positionFromTop} from top, deck of type ${this._type} has only ${this._order.length} cards.`);
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

    addTopPosition(card: Card): void {
        this.addCardAtPosFromTop(card, 0);
    }

    addBottomPosition(card: Card): void {
        this.addCardAtPosFromTop(card, this._order.length);
    }
    addCardAtPosFromTop(card: Card, positionFromTop: number): void {
        const posFromEnd = Math.max(this._order.length - positionFromTop, 0);
        this._order.splice(posFromEnd, 0, card.id);
    }
    addRandomPosition(card: Card): void {
        const randomIdx = Math.floor(Math.random() * this._order.length);
        this.addCardAtPosFromTop(card, randomIdx);
    }

    addDiscardTop(card: Card): void {
        this._discard.push(card.id);
    }

    get discard(): Card[] {
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
        shuffle<number>(this._discard);
    }

    resetDiscard(): void {
        this.shuffleDiscard();
        this._order = this._discard.concat(this._order);
        this._discard = [];
    }
    getCardFromSlug(slug: string) : Card|undefined {
        const res = this.getCards((card) => card.slug === slug);
        if( res.length > 1 ) {
            throw new Error(`Multiple cards with slug ${slug} found in deck of type ${this._type}.`);
        }
        if( res.length === 0 ) {
            throw new Error(`No card with slug ${slug} found in deck of type ${this._type}.`);
        }
        return  res[0];
    }
    getCards(filter: (card: Card) => boolean) : Card[] {
        const result: Card[] = [];
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
    _hand: Card[];
    constructor() {
        this._hand = []
    }
    get length(): number {
        return this._hand.length;
    }
    get cards(): Card[] {
        return this._hand;
    }
    addToHand(card: Card) {
        if (card.type !== "loot") {
            print("Error, hand should only contain loot cards.")
            throw new Error("Hand can only contain loot cards.");
        }
        this._hand.push(card);
    }
    moveCardToPos(from: number, to: number) {
        const card: Card = this._hand[from]!;
        this._hand.splice(from, 1);
        this._hand.splice(to, 0, card);
    }
    removeFromHandByPos(pos: number) : Card {
        const card: Card = this._hand[pos]!;
        this._hand.splice(pos, 1);
        return card;
    }
    removeCard(target: Card): boolean{
        const index = this._hand.indexOf(target);
        if(index >= 0)
        {
            this.removeFromHandByPos(index);
            return true;
        }
        return false;
    }
    playCard(index: number) : Card {
        return this.removeFromHandByPos(index);
    }
}

function LoadDecks(json_array: GenericCardType[], numPlayers: number) : {[key: string]: Deck} {
    // Create fresh CardSets from JSON to ensure independent card instances
    const decks_cardSets = LoadsCardSets(json_array);
    
    const decks: {[key: string]: Deck} = {};
    for (const type of Object.keys(decks_cardSets)) {
        const set = decks_cardSets[type];
        if (!set || set.length === 0) {
            continue;
        }
        let range = [];
        for (let i = 0; i < set.length; i++) {
            // TODO: re-enable minimum players filtering. It is disable to be able to test all cards.
            // if(set.get(i)!.minimumPlayers <= numPlayers) 
            {
                range.push(i);
            }
        }
        shuffle<number>(range);
        const firstCard = set.get(0)!;
        assert(range.length === set.length, `LoadDecks: range length ${range.length} does not match set length ${set.length} for deck type ${type}.`);
        decks[type] = new Deck(set, firstCard.type, range);
    }
    return decks;
}

function isSameSlug(slug: string, card: Card) : boolean   
{
    return card.slug === slug;
}

function randomCardFromSet(set: CardSet) : Card {
    const randomIndex = Math.floor(Math.random() * set.length);
    const card = set.get(randomIndex);
    if (card === undefined) {
        throw new Error(`Card id ${randomIndex} is out of bounds for card set of length ${set.length}`);
    }
    return card;
}

export { Card, LootCard, treasureCard, MonsterCard, BsoulCard, CharacterCard, eternalCard, MonsterType, InplayType, CardSet, Deck, Hand, LoadsCardSets, LoadDecks, randomCardFromSet, isSameSlug };