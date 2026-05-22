import { type Deck, type TreasureCard } from "../cards";
import { Player } from "../entities/player";
import type { Game } from "../game";
import { Slots } from "./slots";

/**
 * Manages the shop where players can purchase treasure cards.
 *
 * The Shop maintains a fixed number of slots that display cards from the treasure deck.
 * Empty slots are automatically filled from the deck. Players can purchase cards
 * from these slots or directly from the top of the deck.
 *
 * @example
 * ```typescript
 * const shop = new Shop(2, treasureDeck);
 * shop.purchase(player, 1, 10, game); // Purchase from slot 1 for 10 coins
 * shop.flush(); // Discard all current shop cards and refill
 * ```
 */
export class Shop extends Slots<TreasureCard> {
    /**
     * Creates a new Shop instance.
     *
     * @param nbItemsInShop - Number of slots in the shop
     * @param deck - The treasure deck to draw cards from
     */
    constructor(nbItemsInShop: number, deck: Deck<TreasureCard>) {
        super(nbItemsInShop, deck);
        this.fillEmptySpots();
    }

    get itemsInShop(): (TreasureCard | undefined)[] {
        return this.cardsOnTop;
    }

    /**
     * Purchases the top card of the treasure deck without seeing it.
     * The player pays the specified price and the card goes directly to their in-play area.
     * @param player - The player making the purchase
     * @param price - Cost in coins
     * @param game - The game instance
     * @returns True if purchase was successful (player had enough coins)
     */
    purchaseTopDeck(player: Player, price: number, game: Game): boolean {
        if (game.loseCoins(player, price, false, "paiement") === price) {
            const card = this._deck.draw();
            if (card) {
                game.addInPlay(player, card);
                return true;
            }
        }
        return false;
    }

    /**
     * Purchases a card from the shop.
     * Index 0 purchases from top of deck, index > 0 purchases from shop slots.
     * @param player - The player making the purchase
     * @param index - 0 for top deck, 1+ for shop slot (1-indexed)
     * @param price - Cost in coins
     * @param game - The game instance
     * @returns True if purchase was successful
     */
    purchase(player: Player, index: number | "top", price: number, game: Game): boolean {
        if (index === "top")
            return this.purchaseTopDeck(player, price, game);
        if (game.loseCoins(player, price, false, "paiement") === price) {
            if (this.itemsInShop[index] === undefined)
                throw new Error(`Cannot purchase from shop slot ${index}, it is empty. The deck has ${this._deck.cards.length} cards left.`);
            game.addInPlay(player, this.itemsInShop[index]);
            this._slots[index]?.pop();
            this.fillEmptySpots();
            return true;
        }
        return false;
    }
}

