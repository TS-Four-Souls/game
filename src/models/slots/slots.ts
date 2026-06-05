import { type Card, type Deck } from "../cards";

/**
 * Abstract class that generalize handling of slots of cards, such as shop, encounters and rooms.
 * Each slot can hold a stack of cards, with only the top card being active.
 * Cards can be drawn from a deck into slots, removed from slots, or flushed to discard.
 * The Slots class provides common functionality for managing these card stacks and interactions with the deck.
 * Specific slot types (Shop, Encounters, Rooms) extend this base class with additional behaviors.
 */
export abstract class Slots<T extends Card> {
    /** @private 2D array of cards in each slot (stacks of cards) */
    _slots: T[][];
    /** @private The deck to draw cards from */
    _deck: Deck<T>;

    constructor(nbSlots: number, deck: Deck<T>) {
        this._slots = new Array(nbSlots);
        for (let i = 0; i < nbSlots; i++) {
            this._slots[i] = [];
        }
        this._deck = deck;
    }


    /**
     * Fills all empty slots by drawing from the deck.
     */
    fillEmptySpots() : void {
        for (let i = 0; i < this._slots.length; i++) {
            if (this._slots[i]!.length == 0) {
                this.draw(i);
            }
        }
    }

    /**
     * Gets the top card of each slot, or undefined if the slot is empty.
     * This represents the active card in each slot.
     * @returns An array of the top cards for each slot
     */
    get cardsOnTop(): (T | undefined)[] {
        return this._slots.map(slot => slot[slot.length - 1]);
    }

    /**
     * Removes a specific card from the slots, regardless of its position.
     * It does not check the deck. It uses removeTop and removeAtIndices to remove the card from the slot it is in.
     * Used when a card needs to be removed without purchasing (e.g., by card effects).
     * @param card - The card to remove
     * @returns True if the card was found and removed
     */
    removeFromSlot(card: T): boolean {
        for (let i = 0; i < this._slots.length; i++) {
            for (let j = this._slots[i]!.length - 1; j >= 0; j--) {
                if (this._slots[i]![j] === card) {
                    if(j === this._slots[i]!.length - 1)
                        this.removeTop(i);
                    else
                    {
                        this.removeAtIndices(i, j);
                    }
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Removes a card from a specific index in a slot.
     * @param i - The slot index
     * @param j - The position within the slot
     * @returns The removed card, if any
     */
    removeAtIndices(i: number, j: number): T | undefined {
        if (i < 0 || i >= this._slots.length || j < 0 || j >= this._slots[i]!.length) {
            return undefined;
        }
        // if removing the top card, delegate to removeTop so subclasses can override behavior
        if (j === this._slots[i]!.length - 1)
            return this.removeTop(i);
        const card = this._slots[i]![j];
        this._slots[i]!.splice(j, 1);
        this.fillEmptySpots();
        return card;
    }

    obtainCardFromDiscard(slug: string, globalId?: number): T | undefined {
        const card = globalId === undefined
            ? this._deck.discard.find(card => card.slug === slug)
            : this._deck.discard.find(card => card.slug === slug && card.globalId === globalId);
        if (card) {
            this._deck.remove(card);
            return card;
        }
        return undefined;
    }

    /**
     * Obtains a specific card from the slot by its slug.
     * Searches all slots, then the discard pile, then the deck.
     * The card is removed from wherever it's found.
     * 
     * @param slug - The unique identifier of the card to obtain
     * @returns The card if found, undefined otherwise
     */
    obtainCard(slug: string, globalId?: number): T | undefined{
        for (let i = 0; i < this._slots.length; i++) {
            const indexInSlot = this._slots[i]!.findIndex(card =>
                card.slug === slug && (globalId === undefined || card.globalId === globalId)
            );
            if (indexInSlot >= 0) {
                const card = this.removeAtIndices(i, indexInSlot);
                return card;
            }
        }
        const card = globalId === undefined
            ? this._deck.discard.find(card => card.slug === slug)
            : this._deck.discard.find(card => card.slug === slug && card.globalId === globalId);
        if (card) {
            this._deck.remove(card);
            return card;
        }
        return this._deck.getCardFromSlug(slug, globalId);
    }

    /**
     * Draws a card from the monster deck and places it on top of a specific slot.
     * Creates a new Monster entity for the drawn card.
     * 
     * @param position - The slot index to draw to
     */
    draw(position: number) : void {
        const card = this._deck.draw();
        if(card === undefined)
            throw new Error(`Cannot draw card from deck for slot ${position}.`);
        this._slots[position]!.push(card);
    }

    /**
     * Removes the top card from a slot without sending it to discard.
     * Refills or reveals the next card in the slot as needed.
     *
     * @param index - The slot index to remove the top card from
     * @returns The removed card, if any
     */
    removeTop(index: number) : T | undefined {
        if (index < 0) {
            return undefined;
        }
        const card = this._slots[index]!.pop();
        if(this._slots[index]!.length === 0) {
            this.fillEmptySpots();
        }
        return card;
    }

    /**
     * Removes a specific card from the slots.
     * Used when a card needs to be removed without purchasing (e.g., by card effects).
     * @param target - The card to remove
     * @returns True if the card was found and removed
     */
    removeCard(target: T): boolean{
        for (let i = 0; i < this._slots.length; i++) {
            const index = this._slots[i]!.findIndex(card => card === target);
            if (index !== -1) {
                this.removeAtIndices(i, index);
                return true;
            }
        }
        return false;
    }
    /**
     * Discards the top monster card from a slot and refills the slot.
     * The card goes to the discard pile of the monster deck.
     * 
     * @param index - The slot index to discard from
     */
    discardTop(index: number) : void {
        if (index >= 0) {
            const card = this.removeTop(index);
            this._deck.addDiscardTop(card!);
        }
    }
    
    /**
     * Moves the top card of a slot to the bottom of the monster deck.
     * 
     * @param index - The slot index to move from
     */
    moveToBottom(index: number) : void {
        if (index >= 0) {
            const card = this.removeTop(index);
            this._deck.addBottomPosition(card!);
        }
    }
    
    /**
     * Discards all top cards from all slots and refills.
     * Used for effects that clear the encounter area.
     */
    flush() : void {
        for (let i = 0; i < this._slots.length; i++) {
            this.discardTop(i);
        }
        this.fillEmptySpots();
    }
    /**
     * Flushes all top cards from all slots and refills, then draws a new card on top of each non refilled slot.
     */
    flushAndDraw(): void {
        this.flush();
        for (let i = 0; i < this._slots.length; i++) {
            if(this._slots[i]!.length > 1)
                this.draw(i);
        }
    }

    /**
     * Moves all top cards from all slots to the bottom of the deck.
     * Different from flush as cards go to bottom instead of discard.
     */
    flushToBottom(): void {
        for (let i = 0; i < this._slots.length; i++) {
            this.moveToBottom(i);
        }
        this.fillEmptySpots();
    }
    /**
     * Expands the encounter area by adding n new slots.
     * New slots are immediately filled with monsters.
     * 
     * @param n - Number of new slots to add
     */
    expand(n: number): void {
        for (let i = 0; i < n; i++)
            this._slots.push([]);
        this.fillEmptySpots();
    }
}


