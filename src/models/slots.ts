import type { Card, Deck } from "./cards";
import type { Player } from "./player";

class Shop {
    _slots: (undefined | Card)[];
    _deck: Deck;
    constructor(nbItemsInShop: number, deck: Deck) {
        this._slots = new Array(nbItemsInShop);
        this._deck = deck;
        this.fillEmptySpots();
    }

    fillEmptySpots() : void {
        for (let i = 0; i < this._slots.length; i++) {
            if (this._slots[i] == undefined) { }
            this._slots[i] = this._deck.draw();
        }
    }
    reduce() : void{
        const card = this._slots.pop();
        this._deck.addDiscardTop(card!);
    }
    expand() : void {
        this._slots.push(undefined);
        this.fillEmptySpots();
    }
    computePriceTopDeck(player: Player) : number {
        return 10;
    }
    computePrice(player: Player, card: Card) : number {
        return 10;
    }
    purchaseTopDeck(player: Player) : boolean {
        const price = this.computePriceTopDeck(player);
        if (player.loseCoins(price, false)) {
            const card = this._deck.draw();
            if (card)
                {
                    player.addInPlay(card);
                    return true;
                }
        }
        return false;
    }
    purchase(player: Player, index: number): boolean {
        if(index === 0)
        {
            return this.purchaseTopDeck(player);
        }
        if (index > 0) {
            index -= 1;
            const price = this.computePrice(player, this._slots[index]!);
            if (player.loseCoins(price, false)) {
                player.addInPlay(this._slots[index]!);
                this._slots[index] = undefined;
                this.fillEmptySpots();
                return true;
            }
        }
        return false;
    }
    discard(index: number) : void {
        if (index > 0) {
            index -= 1;
            this._deck.addDiscardTop(this._slots[index]!);
            this._slots[index] = undefined;
            this.fillEmptySpots();
        }
    }
    flush() : void {
        for (let i = 0; i < this._slots.length; i++) {
            this.discard(i + 1);
        }
        this.fillEmptySpots();
    }
}

class Encounters {
    _slots: Card[][];
    _deck: Deck;
    constructor(nbEncounterSlots: number, deck: Deck) {
        this._slots = new Array(nbEncounterSlots);
        for (let i = 0; i < nbEncounterSlots; i++) {
            this._slots[i] = [];
        }
        this._deck = deck;
        this.fillEmptySpots(true);
    }
    fillEmptySpots(discardEvent = false) : void {
        for (let i = 0; i < this._slots.length; i++) {
            if (this._slots[i]!.length == 0) {
                let card = this._deck.draw();
                if (discardEvent) {
                    while (card!._json.stats == undefined) {
                        this._deck.addDiscardTop(card!);
                        card = this._deck.draw();
                    }
                }
                this._slots[i]!.push(card!);
            }
        }
    }

    draw(position: number) : void {
        const card = this._deck.draw();
        this._slots[position]!.push(card!);
    }

    discardTop(index: number) : void {
        if (index >= 0) {
            const card = this._slots[index]!.pop();
            this.fillEmptySpots(false);
            this._deck.addDiscardTop(card!);
        }
    }

    killTop(index: number) : Card | undefined {
        if (index >= 0) {
            const card = this._slots[index]!.pop();
            this.fillEmptySpots(false);
            // Call game to know what to do (give rewards,soul, discard card or not...)
            return card;
        }
    }
}
export { Shop, Encounters };