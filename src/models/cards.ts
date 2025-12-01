import { shuffle, print } from '@/utils/auxiliary';

class Card {
    _json: any;
    _id: number;
    constructor(id: number, 
        json: any) {
        this._json = json;
        this._id = id;
    }
    getId() {
        return this._id;
    }
}
class CardSet {
    private _set: Card[];
    private _type: string;
    constructor(type: string) {
        this._type = type
        this._set = []
    }
    addCard(json: any) : void{
        this._set.push(new Card(this._set.length, json ));
    }
    get(id: number) : Card|undefined {
        if (id < 0 || id >= this._set.length) {
            throw new Error(`Card id ${id} is out of bounds for card set of length ${this._set.length}`);
        }
        return this._set[id];
    }
    type() : string{ 
        return this._type; }
    length() : number{ 
        return this._set.length; }
    showAllCards() : void {
        this._set.forEach((card) => {
            console.log(JSON.stringify(card._json, null, 2));
        });
    }
}

function LoadsCardSets(json: any) : {[key: string]: CardSet} {
    const sets: {[key: string]: CardSet} = {};
    for (const jsonKey in json) {
        const card_json = json[jsonKey];
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
        shuffle(this._order)
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
        this._order.push(card.getId());
    }

    addBottomPosition(card: Card) {
        this._order.unshift(card.getId());
    }
    addCardAtPosFromTop(card: Card, positionFromTop: number) {
        const posFromEnd = Math.max(this._order.length - positionFromTop, 0);
        this._order.splice(posFromEnd, 0, card.getId());
    }
    addRandomPosition(card: Card) {
        const randomIdx = Math.floor(Math.random() * this._order.length);
        this.addCardAtPosFromTop(card, randomIdx);
    }

    addDiscardTop(card: Card) {
        this._discard.push(card.getId());
    }

    getDiscard() {
        const result = []
        for (let i = this._discard.length - 1; i >= 0; i--) {
            const id = this._discard[i];
            if(id){
                result.push(this._set.get(id));
            }
                
        }
        return result;
    }

    shuffleDiscard() {
        shuffle(this._discard);
    }

    resetDiscard() {
        this.shuffleDiscard();
        this._order = this._discard.concat(this._order);
        this._discard = [];
    }
    getCardFromSlug(slug: string) : Card|undefined {
        for (let i = this._order.length - 1; i >= 0; i--) {
            const id = this._order[i];
            if(id){
                const card = this._set.get(id);
                if (card?._json.slug == slug) {
                    return card;
                }
            }
        }
        return undefined;
    }
    getCards(filter: (card: Card|undefined) => boolean) : Card[] {
        const result: Card[] = [];
        for (let i = this._order.length - 1; i >= 0; i--) {
            const id = this._order[i];
            if (id) {
                const card = this._set.get(id);
                if (filter(card)) {
                    const positionFromTop = this._order.length - i;
                    result.push(this.drawCardAt(positionFromTop)!);
                }
            }
        }
        return result;
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
        if (card._json.type !== "loot") {
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
    getCards() : Card[] {
        return this._hand;
    }
}

function LoadDecks(card_sets: {[key: string]: CardSet}) : {[key: string]: Deck} {
    const decks: {[key: string]: Deck} = {};
    for (const type of Object.keys(card_sets)) {
        const set = card_sets[type];
        if (!set || set.length() === 0) {
            continue;
        }
        const range = [...Array(set.length()).keys()];
        shuffle(range);
        const firstCard = set.get(0)!;
        decks[type] = new Deck(set, firstCard._json.type, range);
    }
    return decks;
}

function isSameSlug(slug: string, card: Card) : boolean   
{
    return card._json.slug === slug;
}

function randomCardFromSet(set: CardSet) : Card {
    const randomIndex = Math.floor(Math.random() * set.length());
    const card = set.get(randomIndex);
    if (card === undefined) {
        throw new Error(`Card id ${randomIndex} is out of bounds for card set of length ${set.length()}`);
    }
    return card;
}

export { Card, CardSet, Deck, Hand, LoadsCardSets, LoadDecks, randomCardFromSet, isSameSlug };