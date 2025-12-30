import { type Card, type LootCard, type eternalCard, type treasureCard, MonsterCard, type CharacterCard, MonsterType, type Deck, EffectOnStack, EffectData } from "./cards";
import type { Game } from "./game";
import { Monster } from "./monster";
import type { Player } from "./player";
import type { Entity } from "./entity"
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
    expand(n:number) : void {
        for (let i = 0; i < n; i++)
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
    purchaseTopDeck(player: Player, price: number, game: Game) : boolean {
        if (game.loseCoins(player, price, false) === price) {
            const card = this._deck.draw();
            if (card)
                {
                    game.addInPlay(player, card);
                    return true;
                }
        }
        return false;
    }
    purchase(player: Player, index: number, price: number, game: Game): boolean {
        if(index === 0)
        {
            return this.purchaseTopDeck(player, price, game);
        }
        if (index > 0) {
            index -= 1;
            if (game.loseCoins(player, price, false) === price) {
                game.addInPlay(player, this._slots[index]!);
                this._slots[index] = undefined;
                this.fillEmptySpots();
                return true;
            }
        }
        return false;
    }
    discard(index: number) : void {
        if (index >= 0) {
            this._deck.addDiscardTop(this._slots[index]!);
            this._slots[index] = undefined;
            this.fillEmptySpots();
        }
    }
    flush(): void {
        for (let i = 0; i < this._slots.length; i++) {
            this.discard(i);
        }
        this.fillEmptySpots();
    }
    moveToBottom(index: number) : void {
        if (index >= 0) {
            this._deck.addBottomPosition(this._slots[index]!);
            this._slots[index] = undefined;
            this.fillEmptySpots();
        }
    }
    flushToBottom(): void {
        for (let i = 0; i < this._slots.length; i++) {
            this.moveToBottom(i);
        }
    }
}

class Encounters {
    _slots: Card[][];
    _monstersInPlay: (Monster | undefined)[];
    _deck: Deck;
    _game: any; // Game type
    dcModifier: number = 0;
    constructor(nbEncounterSlots: number, deck: Deck, game: any) {
        this._slots = new Array(nbEncounterSlots);
        this._monstersInPlay = new Array(nbEncounterSlots);
        for (let i = 0; i < nbEncounterSlots; i++) {
            this._slots[i] = [];
        }
        this._deck = deck;
        this._game = game;
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
                this.createMonsterAtSlot(i);
            }
        }
    }

    createMonsterAtSlot(index: number): void {
        const toClean   = this._monstersInPlay[index];
        if (toClean !== undefined) {
            toClean.card.cleanup();
        }
        const card = this._slots[index]![this._slots[index]!.length - 1] as MonsterCard;
        if (card.encounterType !== MonsterType.EVENT) {
            const monster = new Monster(card, this);
            card.onAddInPlay(monster);
            this._monstersInPlay[index] = monster;
        } else {
            this._monstersInPlay[index] = undefined!;
            const effect: EffectOnStack = new EffectOnStack(
                (data:EffectData) => {
                    card.onPlay(data.issuer as Player, data.targets);
                    // card.onAddInPlay(data.issuer);
                    this.discardTop(index); // remove the card once the effect is resolved.
                    return true;
                }, 
                new EffectData(card, this._game.currentPlayer, []), 
                card.effectOutcomes.join('\n')
            );
            this._game.addToStack(effect);
        }
    }

    obtainCard(slug: string): Card | undefined{
        for (let i = 0; i < this._slots.length; i++) {
            const indexInSlot = this._slots[i]!.findIndex(card => card.slug === slug);
            if (indexInSlot >= 0) {
                const card = this._slots[i]![indexInSlot];
                this._slots[i]!.splice(indexInSlot, 1);
                this.fillEmptySpots(true);
                return card;
            }
        }
        const card = this._deck.discard.find(card => card.slug === slug);
        if (card) {
            this._deck.remove(card);
            return card;
        }
        return this._deck.getCardFromSlug(slug);
    }

    get nonAttackedSlots() : number[] {
        return this._slots.map((slot, index) => slot.length === 0 || (!this.monsterIn(index)?.isEngagedInCombat) ? index : -1).filter(index => index !== -1);
    }

    addDcModifier(value: number): void {
        this.dcModifier += value;
    }

    draw(position: number) : void {
        const card = this._deck.draw();
        this._slots[position]!.push(card!);
        this.createMonsterAtSlot(position);
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
    expand(n: number): void {
        for (let i = 0; i < n; i++)
            this._slots.push([]);
        this.fillEmptySpots();
    }
    forceSetMonsterAtSlot(index: number, monsterCard: MonsterCard): void {
        const previousCard = this._slots[index]![0]!;
        this._slots[index] = [monsterCard];
        this.createMonsterAtSlot(index);
        this._deck.addRandomPosition(previousCard);
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