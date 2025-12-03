import { shuffle, print } from '@/utils/auxiliary';
import type { CardRewards, EternalCardType, GenericCardType, LootCardType, ItemCardType, TreasureCardType, CharacterCardType, MonsterCardType, BonusSoulCardType } from '@/utils/cardTypes';

class Card {
    protected _json: GenericCardType;
    protected _id: number;
    protected _slug: string;
    protected _name: string;
    protected _type: string;
    protected _origin: string;
    protected _quote: string | undefined;
    protected _front: string;
    protected _back: string;
    protected _keywords: string[];
    protected _tags: { [key: string]: any };
    protected _minimumPlayers: number;
    protected _effectOutcomes: string[];
    protected _souls: number = 0;
    constructor(id: number, 
        json: GenericCardType) {
        this._json = json;
        this._id = id;
        this._slug = json.slug;
        this._name = json.name;
        this._type = json.type;
        this._origin = json.origin;
        this._quote = json.quote;
        this._front = json.front;
        this._back = json.back;
        this._keywords = [];
        this._tags = {};
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
    get soul(): number {
        return this._souls;
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
}

class LootCard extends Card {
    protected _reward: CardRewards | undefined;
    protected _trinket: boolean = false;
    constructor(id: number, json: LootCardType) {
        super(id, json);
        this._reward = json.rewards;
        if (json.trinket) {
            this._trinket = json.trinket;
        }
    }

    isTrinket(): boolean {
        return this._trinket;
    }
}
enum ItemType {CHARGED, UNCHARGED, PASSIVE, PAID}
class ItemCard extends Card {
    protected _treasureType: ItemType;
    protected _eternal: boolean = false;
    protected _guppy: boolean = false;

    protected _cost: string;
    constructor(id: number, json: ItemCardType) {
        super(id, json);
        this._cost = "";
        this._treasureType = ItemType.PASSIVE;
        if (json.effectOutcome !== undefined) {
            if (json.effectOutcome.join(", ").includes("[Tap effect]")) {
                this._treasureType = ItemType.UNCHARGED;
            } else if (json.effectOutcome.join(", ").includes("[Paid effect]")) {
                this._treasureType = ItemType.PAID;
            }
        }
    }

    recharge(): boolean {
        if (this._treasureType === ItemType.UNCHARGED) {
            this._treasureType = ItemType.CHARGED;
            return true;
        }
        return false;
    }

    activate(): boolean {
        if (this._treasureType === ItemType.CHARGED) {
            this._treasureType = ItemType.UNCHARGED;
            return true;
        }
        if (this._treasureType === ItemType.PAID) {
            return true;
        }
        return false;
    }
    get cost(): string {
        return this._cost;
    }
    isEternal(): boolean {
        return this._eternal;
    }
    isGuppy(): boolean {
        return this._guppy;
    }
    setEternal(eternal: boolean): void {
        this._eternal = eternal;
    }
}

class treasureCard extends ItemCard {
    protected _subtype: string;

    constructor(id: number, json: TreasureCardType) {
        super(id, json);
        this._subtype = json.subtype;
    }
    get subtype(): string {
        return this._subtype;
    }
}

class eternalCard extends ItemCard {
    constructor(id: number, json: EternalCardType) {
        super(id, json);
        this._eternal = true;
    }
}

class CharacterCard extends Card {
    protected _eternalCard: string | null = null;
    protected _life: number = 0;
    protected _damage: number = 0;
    constructor(id: number, json: CharacterCardType) {
        super(id, json);
        if(json.eternalCard) {
            this._eternalCard = json.eternalCard.slug;
        }
        if(json.stats) {
            this._life = json.stats.healthPoints || 0;
            this._damage = json.stats.attackPoints || 0;
        }
    }
    get eternalCard(): string | null {
        return this._eternalCard;
    }
    get life(): number {
        return this._life;
    }
    get damage(): number {
        return this._damage;
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
    protected _life:number = 0;
    protected _subtype: string;
    protected _damage:number = 0;
    protected _evasion:number = 0;

    constructor(id: number, json: MonsterCardType) {
        super(id, json);
        this._monsterType = MonsterType.EVENT;
        this._subtype = json.subtype;
        if(json.stats) {
            this._life = json.stats.healthPoints || 0;
            this._damage = json.stats.attackPoints || 0;
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

    get life(): number {
        return this._life;
    }
    get damage(): number {
        return this._damage;
    }
    get evasion(): number {
        return this._evasion;
    }
}

class bsoulCard extends Card {
    protected _soul:number = 0;
    constructor(id: number, json: BonusSoulCardType) {
        super(id, json);
        if (json.rewards && json.rewards.soul) {
            if(typeof json.rewards.soul === "number")
            {
                this._soul = json.rewards.soul;
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
            this._set.push(new LootCard(this._set.length, json ));
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
            this._set.push(new bsoulCard(this._set.length, json ));
        }
        else{
            console.log(`Unknown card: ${json}, adding as generic Card.`);
            this._set.push(new Card(this._set.length, json ));
        }
        return;
    }
    get(id: number) : Card {
        if (id < 0 || id >= this._set.length) {
            throw new Error(`Card id ${id} is out of bounds for card set of length ${this._set.length}`);
        }
        if(typeof this._set[id] === "undefined" || this._set[id] === null) {
            throw new Error(`Card id ${id} is undefined or null in card set.`);
        }
        return this._set[id];
    }
    get type() : string{ 
        return this._type; }
    get length() : number{ 
        return this._set.length; }

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
            throw new Error(`Card id ${index} is undefined or null in card set.`);
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
    }

    shuffle() {
        shuffle<number>(this._order)
    }

    draw() {
        if (this._order.length == 0) {
            this.resetDiscard();
        }
        const id: number = this._order.pop()!;
        return this._set.get(id);
    }

    drawSeveral(n: number) {
        const cards = Array(n)
        for (let i = 0; i < n; i++) {
            if (this._order.length == 0) {
                this.resetDiscard();
            }
            cards[i] = this.draw();
        }
        return cards;
    }

    drawCardAt(positionFromTop: number) {
        const posFromEnd: number = this._order.length - positionFromTop;
        const id: number = this._order[posFromEnd]!;
        const result = this._set.get(id);
        this._order.splice(posFromEnd, 1);
        return result;
    }
    addTopPosition(card: Card) {
        this._order.push(card.id);
    }

    addBottomPosition(card: Card) {
        this._order.unshift(card.id);
    }
    addCardAtPosFromTop(card: Card, positionFromTop: number) {
        const posFromEnd = Math.max(this._order.length - positionFromTop, 0);
        this._order.splice(posFromEnd, 0, card.id);
    }
    addRandomPosition(card: Card) {
        const randomIdx = Math.floor(Math.random() * this._order.length);
        this.addCardAtPosFromTop(card, randomIdx);
    }

    addDiscardTop(card: Card) {
        this._discard.push(card.id);
    }

    get discard() {
        const result = []
        for (let i = this._discard.length - 1; i >= 0; i--) {
            const id = this._discard[i];
                if (typeof id !== "undefined" && id !== null) {
                    result.push(this._set.get(id));
                }
                
        }
        return result;
    }

    shuffleDiscard() {
        shuffle<number>(this._discard);
    }

    resetDiscard() {
        this.shuffleDiscard();
        this._order = this._discard.concat(this._order);
        this._discard = [];
    }
    getCardFromSlug(slug: string) : Card|undefined {
        for (let i = this._order.length - 1; i >= 0; i--) {
            const id = this._order[i];
            if (typeof id !== "undefined" && id !== null) {
                const card = this._set.get(id);
                if (card?.slug == slug) {
                    return card;
                }
            }
        }
        return undefined;
    }
    getCards(filter: (card: Card) => boolean) : Card[] {
        const result: Card[] = [];
        for (let i = this._order.length - 1; i >= 0; i--) {
            const id = this._order[i];
            if (typeof id !== "undefined" && id !== null) {
                const card = this._set.get(id);
                if (filter(card)) {
                    const positionFromTop = this._order.length - i;
                    result.push(this.drawCardAt(positionFromTop)!);
                }
            }
        }
        return result;
    }
    displayAllCards() {
        this._order.forEach((id) => {
            const card = this._set.get(id);
            console.log(card?.slug);
        });
    }
    ////// debug //////
    displayOrder() {
        console.log(this._order.reverse());
        this._order.reverse();
    }
}

class Hand {
    _hand: Card[];
    constructor() {
        this._hand = []
    }
    addToHand(card: Card) {
        if (card.type !== "loot") {
            print("Error, hand should only contain loot cards.")
        }
        this._hand.push(card);
    }
    moveCardToPos(from: number, to: number) {
        const card: Card = this._hand[from]!;
        this._hand.splice(from, 1);
        this._hand.splice(to, 0, card);
    }
    removeFromHand(pos: number) : Card {
        const card: Card = this._hand[pos]!;
        this._hand.splice(pos, 1);
        return card;
    }
    get cards() : Card[] {
        return this._hand;
    }
    playCard(index: number) : Card {
        return this.removeFromHand(index);
    }
}

function LoadDecks(card_sets: {[key: string]: CardSet}, numPlayers: number) : {[key: string]: Deck} {
    const decks: {[key: string]: Deck} = {};
    for (const type of Object.keys(card_sets)) {
        const set = card_sets[type];
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

export { Card, LootCard, treasureCard, MonsterCard, bsoulCard, CharacterCard, eternalCard, MonsterType, ItemType, CardSet, Deck, Hand, LoadsCardSets, LoadDecks, randomCardFromSet, isSameSlug };