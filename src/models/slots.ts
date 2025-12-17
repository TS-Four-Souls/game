import { type Card, type LootCard, type eternalCard, type treasureCard, MonsterCard, type CharacterCard, MonsterType, type Deck } from "./cards";
import { Monster } from "./monster";
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
            if (this._slots[i] == undefined)
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
    obtainCard(slug: string): Card | undefined{
        const index = this._slots.findIndex(card => card?.slug === slug);
        if (index >= 0) {
            const card = this._slots[index];
            this._slots[index] = undefined;
            this.fillEmptySpots();
            return card;
        }
        return this._deck.getCardFromSlug(slug);
    }
    computePriceTopDeck(player: Player) : number {
        return 10;
    }
    computePrice(player: Player, card: Card) : number {
        return 10;
    }

    removeCard(target: Card): boolean{
        for (let i = 0; i < this._slots.length; i++) {
            if (this._slots[i] === target) {
                this._slots[i] = undefined;
                this.fillEmptySpots();
                return true;
          }
        }
        return false;
      }
    purchaseTopDeck(player: Player) : boolean {
        const price = this.computePriceTopDeck(player);
        if (player.loseCoins(price, false) === price) {
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
            if (player.loseCoins(price, false) === price) {
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
    flush(): void {
        for (let i = 0; i < this._slots.length; i++) {
            this.discard(i + 1);
        }
        this.fillEmptySpots();
    }
    moveToBottom(index: number) : void {
        if (index > 0) {
            index -= 1;
            this._deck.addBottomPosition(this._slots[index]!);
            this._slots[index] = undefined;
            this.fillEmptySpots();
        }
    }
    flushToBottom(): void {
        for (let i = 0; i < this._slots.length; i++) {
            this.moveToBottom(i);
        }
        this.fillEmptySpots();
    }
}

class Encounters {
    _slots: Card[][];
    _monstersInPlay: (Monster | undefined)[];
    _deck: Deck;
    constructor(nbEncounterSlots: number, deck: Deck) {
        this._slots = new Array(nbEncounterSlots);
        this._monstersInPlay = new Array(nbEncounterSlots);
        for (let i = 0; i < nbEncounterSlots; i++) {
            this._slots[i] = [];
        }
        this._deck = deck;
        this.fillEmptySpots(true);
    }
    fillEmptySpots(discardEvent = false) : void {
        for (let i = 0; i < this._slots.length; i++) {
            if (this._slots[i]!.length == 0) {
                let card = this._deck.draw() as MonsterCard;
                if (discardEvent) {
                    while (card!.encounterType === MonsterType.EVENT) {
                        this._deck.addDiscardTop(card!);
                        card = this._deck.draw() as MonsterCard;
                    }
                    if(!(card instanceof MonsterCard))
                    {
                        throw new Error("Non monster card in encounters deck");
                    }
                }
                this._slots[i]!.push(card!);
                if (card.encounterType !== MonsterType.EVENT) {
                    const monster = new Monster(card);
                    this._monstersInPlay[i] = monster;
                }else {
                    this._monstersInPlay[i] = undefined!;
                }
            }
        }
    }

    get nonAttackedSlots() : number[] {
        return this._slots.map((slot, index) => slot.length === 0 || (!this.monsterIn(index)?.isEngagedInCombat) ? index : -1).filter(index => index !== -1);
    }

    draw(position: number) : void {
        const card = this._deck.draw();
        this._slots[position]!.push(card!);
        if ((card as MonsterCard).encounterType !== MonsterType.EVENT) {
            const monster = new Monster((card as MonsterCard));
            this._monstersInPlay[position] = monster;
        } else {
            this._monstersInPlay[position] = undefined!;
        }
    }

    discardTop(index: number) : void {
        if (index >= 0) {
            const card = this._slots[index]!.pop();
            this.fillEmptySpots(false);
            this._deck.addDiscardTop(card!);
        }
    }
    moveToBottom(index: number) : void {
        if (index >= 0) {
            const card = this._slots[index]!.pop();
            this.fillEmptySpots(false);
            this._deck.addBottomPosition(card!);
        }
    }
    flush() : void {
        for (let i = 0; i < this._slots.length; i++) {
            this.discardTop(i);
        }
        this.fillEmptySpots(false);
    }
    flushMonster(monster: Monster): void {
        const idx = this._slots.findIndex(slot => slot.includes(monster.card));
        if (idx >= 0) {
            this.discardTop(idx);
            this.fillEmptySpots(false);
        }
        else
            throw new Error("Monster not found in encounters");
    }

    flushToBottom(): void {
        for (let i = 0; i < this._slots.length; i++) {
            this.moveToBottom(i);
        }
        this.fillEmptySpots(false);
    }
    kill(monster: Monster) : void {
        const index = this._monstersInPlay.indexOf(monster);
        if (index >= 0) {
            this.killTop(index);
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

    monsterIn(index: number) : Monster | undefined {
        if (index >= 0 && index < this._monstersInPlay.length) {
            return this._monstersInPlay[index];
        }
        return undefined;
    }

    get slots(): Card[][] {
        return this._slots;
    }

    get monsters(): Monster[] {
        return this._monstersInPlay.filter((m): m is Monster => m !== undefined);
    }
}
export { Shop, Encounters };