import { type Deck, RoomCard } from "../cards";
import type { Game } from "../game";
import { Slots } from "./slots";


/**
 * Manages the rooms slots in the Four Souls game.
 */
export class Rooms extends Slots<RoomCard> {
    /** @private Reference to the game instance */
    _game: Game; // Game type


    constructor(nbRooms: number, deck: Deck<RoomCard>, game: Game) {
        super(nbRooms, deck);
        this._game = game;
        this.fillEmptySpots();
    }

    /**
     * Draws a card from the monster deck and places it on top of a specific slot.
     * Creates a new Monster entity for the drawn card.
     *
     * @param position - The slot index to draw to
     */
    override draw(position: number): void {
        const card = this._deck.draw();
        if (card === undefined)
            throw new Error(`Cannot draw card from deck for slot ${position}.`);
        this._slots[position]!.push(card);
        card.onAddInPlay(() => this._game.currentPlayer);
    }

    get activeRooms(): RoomCard[] {
        return this._slots.map(slot => slot[slot.length - 1]!).filter(card => card !== undefined);
    }

    /**
     * Removes the top card from a slot without sending it to discard.
     * Refills or reveals the next card in the slot as needed.
     *
     * @param index - The slot index to remove the top card from
     * @returns The removed card, if any
     */
    override removeTop(index: number): RoomCard | undefined {
        if (index < 0) {
            return undefined;
        }
        const card = this._slots[index]!.pop();
        card?.cleanup();
        if (this._slots[index]!.length === 0) {
            this.fillEmptySpots();
        }
        return card;
    }

    roomIn(index: number): RoomCard | undefined {
        if (index < 0 || index >= this._slots.length)
            return undefined;
        const card = this._slots[index]![this._slots[index]!.length - 1];
        return card;
    }
    override removeAtIndices(i: number, j: number): RoomCard | undefined {
        if (i < 0 || i >= this._slots.length || j < 0 || j >= this._slots[i]!.length) {
            return undefined;
        }
        const card = this._slots[i]![j]!;
        this._slots[i]!.splice(j, 1);
        card.cleanup();
        this.fillEmptySpots();
        return card;
    }

    forceRoomAtSlot(index: number, roomCard: RoomCard): void {
        this._deck.addTopPosition(roomCard);
        const previousCard = this.removeTop(index);
        if (previousCard) {
            this._deck.addBottomPosition(previousCard);
        }
    }
}

