import { type Card, type LootCard, type eternalCard, type treasureCard, MonsterCard, type CharacterCard, MonsterType, type Deck, EffectOnStack, EffectData } from "./cards";
import type { Game } from "./game";
import { Monster } from "./monster";
import type { Player } from "./player";
import type { Entity } from "./entity"

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
class Shop {
    /** @private Array of cards currently available in shop slots (undefined = empty slot) */
    _slots: (undefined | Card)[];
    
    /** @private The treasure deck to draw cards from */
    _deck: Deck;

    /**
     * Creates a new Shop instance.
     * 
     * @param nbItemsInShop - Number of slots in the shop
     * @param deck - The treasure deck to draw cards from
     */
    constructor(nbItemsInShop: number, deck: Deck) {
        this._slots = new Array(nbItemsInShop);
        this._deck = deck;
        this.fillEmptySpots();
    }

    /**
     * Fills all empty shop slots by drawing cards from the deck.
     * Automatically called when slots become empty.
     */
    fillEmptySpots() : void {
        for (let i = 0; i < this._slots.length; i++) {
            if (this._slots[i] == undefined)
                this._slots[i] = this._deck.draw();
        }
    }

    /**
     * Reduces the shop size by removing the last slot.
     * The removed card is discarded to the deck.
     */
    reduce() : void{
        const card = this._slots.pop();
        this._deck.addDiscardTop(card!);
    }
    
    /**
     * Expands the shop by adding n new slots.
     * New slots are immediately filled with cards from the deck.
     * @param n - Number of slots to add
     */
    expand(n:number) : void {
        for (let i = 0; i < n; i++)
            this._slots.push(undefined);
        this.fillEmptySpots();
    }
    /**
     * Obtains a specific card from the shop by its slug.
     * First searches shop slots, then falls back to searching the deck directly.
     * The slot is emptied and refilled after obtaining the card.
     * @param slug - The unique identifier of the card to obtain
     * @returns The card if found, undefined otherwise
     */
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

    /**
     * Removes a specific card from the shop.
     * Used when a card needs to be removed without purchasing (e.g., by card effects).
     * @param target - The card to remove
     * @returns True if the card was found and removed
     */
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
    /**
     * Purchases the top card of the treasure deck without seeing it.
     * The player pays the specified price and the card goes directly to their in-play area.
     * @param player - The player making the purchase
     * @param price - Cost in coins
     * @param game - The game instance
     * @returns True if purchase was successful (player had enough coins)
     */
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
        if(index === "top")
            return this.purchaseTopDeck(player, price, game);
        if (game.loseCoins(player, price, false) === price) {
            game.addInPlay(player, this._slots[index]!);
            this._slots[index] = undefined;
            this.fillEmptySpots();
            return true;
        }
        return false;
    }
    /**
     * Discards the card at the specified shop slot index.
     * The slot is refilled after discarding.
     * @param index - The slot index to discard from
     */
    discard(index: number) : void {
        if (index >= 0) {
            this._deck.addDiscardTop(this._slots[index]!);
            this._slots[index] = undefined;
            this.fillEmptySpots();
        }
    }
    
    /**
     * Discards all cards currently in the shop and refills all slots.
     * Used for shop refresh effects.
     */
    flush(): void {
        for (let i = 0; i < this._slots.length; i++) {
            this.discard(i);
        }
        this.fillEmptySpots();
    }
    
    /**
     * Moves the card at the specified slot to the bottom of the deck.
     * @param index - The slot index to move from
     */
    moveToBottom(index: number) : void {
        if (index >= 0) {
            this._deck.addBottomPosition(this._slots[index]!);
            this._slots[index] = undefined;
            this.fillEmptySpots();
        }
    }
    
    /**
     * Moves all shop cards to the bottom of the deck.
     * Different from flush as cards go to bottom instead of discard pile.
     */
    flushToBottom(): void {
        for (let i = 0; i < this._slots.length; i++) {
            this.moveToBottom(i);
        }
    }
}

/**
 * Manages the monster encounter slots in the Four Souls game.
 * 
 * The Encounters class maintains multiple slots where monster cards can be placed.
 * Each slot can contain a stack of monster cards, with only the top card being active
 * as a Monster entity. Empty slots are automatically filled from the monster deck.
 * 
 * Key features:
 * - Automatically creates Monster entities from MonsterCards
 * - Handles event-type encounters by putting them on the stack
 * - Filters out events during initial setup
 * - Manages a DC (difficulty class) modifier that affects all monsters' evasion
 * 
 * @example
 * ```typescript
 * const encounters = new Encounters(2, monsterDeck, game);
 * encounters.addDcModifier(1); // All monsters become harder to hit
 * const monster = encounters.monsterIn(0); // Get monster in first slot
 * encounters.killTop(0); // Kill and reward for top monster
 * ```
 */
class Encounters {
    /** @private 2D array of cards in each encounter slot (stacks of monsters) */
    _slots: Card[][];
    
    /** @private Array of active Monster entities (one per slot, undefined if event or empty) */
    _monstersInPlay: (Monster | undefined)[];
    
    /** @private The monster deck to draw cards from */
    _deck: Deck;
    
    /** @private Reference to the game instance */
    _game: any; // Game type
    
    /** Global modifier to all monster evasion values (DC = difficulty class) */
    dcModifier: number = 0;

    /** Global modifier to all monster attack values (DC = difficulty class) */
    attackModifier: number = 0;
    
    /**
     * Creates a new Encounters manager.
     * Initializes all slots and fills them with monsters (filtering out events during setup).
     * 
     * @param nbEncounterSlots - Number of monster slots to create
     * @param deck - The monster deck to draw from
     * @param game - The game instance
     */
    constructor(nbEncounterSlots: number, deck: Deck, game: any) {
        this._slots = new Array(nbEncounterSlots);
        this._monstersInPlay = new Array(nbEncounterSlots);
        for (let i = 0; i < nbEncounterSlots; i++) {
            this._slots[i] = [];
        }
        this._deck = deck;
        this._game = game;
    }

    /**
     * Fills all empty encounter slots by drawing from the monster deck.
     * Creates Monster entities for each drawn card.
     * 
     * @param eventsBottom - If true, filters out EVENT type encounters during filling.
     *                       This is used during initial setup to ensure only monsters appear.
     *                       If false, events are added to the stack and resolved.
     */
    fillEmptySpots(eventsBottom = false) : void {
        for (let i = 0; i < this._slots.length; i++) {
            if (this._slots[i]!.length == 0) {
                let card = this._deck.draw() as MonsterCard;
                if (eventsBottom) {
                    while (card!.encounterType === MonsterType.EVENT) {
                        this._deck.addBottomPosition(card!);
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

    /**
     * Creates a Monster entity from the top card of an encounter slot.
     * If the card is an EVENT, it's added to the stack instead and the slot is cleared.
     * Cleans up the previous monster in the slot if one exists.
     * 
     * @param index - The slot index to create a monster at
     */
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
                    this._game.executeWhenStackEmpty(() => {
                        this.discardTop(index); // remove the card once the effect is resolved.
                    });
                    return true;
                }, 
                new EffectData(card, this._game.currentPlayer, []), 
                card.effectOutcomes.join('\n')
            );
            this._game.addToStack(effect);
        }
    }

    /**
     * Obtains a specific card from the encounter area by its slug.
     * Searches all slots, then the discard pile, then the deck.
     * The card is removed from wherever it's found.
     * 
     * @param slug - The unique identifier of the card to obtain
     * @returns The card if found, undefined otherwise
     */
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

    /**
     * Gets indices of all slots that are either empty or contain monsters not engaged in combat.
     * Used to determine valid attack targets or where new monsters can appear.
     * 
     * @returns Array of slot indices that are not currently being attacked
     */
    get nonAttackedSlots() : number[] {
        return this._slots.map((slot, index) => slot.length === 0 || (!this.monsterIn(index)?.isEngagedInCombat) ? index : -1).filter(index => index !== -1);
    }

    /**
     * Adds to the global DC (dice) modifier.
     * This modifier affects the evasion value of all monsters.
     * Positive values make monsters harder to hit, negative values make them easier.
     * 
     * @param value - Amount to add to the DC modifier
     */
    addDCModifier(value: number): void {
        this.dcModifier += value;
    }

    /**
     * Adds to the global attack modifier.
     * This modifier affects the attack value of all monsters.
     * 
     * @param value - Amount to add to the attack modifier
     */
    addAttackModifier(value: number): void {
        this.attackModifier += value;
    }

    /**
     * Draws a card from the monster deck and places it on top of a specific slot.
     * Creates a new Monster entity for the drawn card.
     * 
     * @param position - The slot index to draw to
     */
    draw(position: number) : void {
        const card = this._deck.draw();
        this._slots[position]!.push(card!);
        this.createMonsterAtSlot(position);
    }

    /**
     * Discards the top monster card from a slot and refills the slot.
     * The card goes to the discard pile of the monster deck.
     * 
     * @param index - The slot index to discard from
     */
    discardTop(index: number) : void {
        if (index >= 0) {
            const card = this._slots[index]!.pop();
            if(this._slots[index]!.length === 0) {
                this.fillEmptySpots(false);
            }else{
                this.createMonsterAtSlot(index);
            }
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
            const card = this._slots[index]!.pop();
            this.fillEmptySpots(false);
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
        this.fillEmptySpots(false);
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
    
    /**
     * Forces a specific monster card into a slot, replacing the current top card.
     * The replaced card is moved back into the deck at the bottom position.
     * Used for debugging and testing.
     * 
     * @param index - The slot index to set
     * @param monsterCard - The monster card to place in the slot
     */
    forceSetMonsterAtSlot(index: number, monsterCard: MonsterCard): void {
        const previousCard = this._slots[index]![0]!;
        this._slots[index] = [monsterCard];
        this.createMonsterAtSlot(index);
        this._deck.addBottomPosition(previousCard);
    }

    /**
     * Removes a specific monster from play by discarding its card.
     * Finds the slot containing the monster and discards it.
     * 
     * @param monster - The Monster entity to flush
     * @throws {Error} If the monster is not found in any slot
     */
    flushMonster(monster: Monster): void {
        const idx = this._slots.findIndex(slot => slot.includes(monster.card));
        if (idx >= 0) {
            this.discardTop(idx);
            this.fillEmptySpots(false);
        }
        else
            throw new Error("Monster not found in encounters");
    }

    /**
     * Moves all top cards from all slots to the bottom of the deck.
     * Different from flush as cards go to bottom instead of discard.
     */
    flushToBottom(): void {
        for (let i = 0; i < this._slots.length; i++) {
            this.moveToBottom(i);
        }
        this.fillEmptySpots(false);
    }
    
    /**
     * Kills a specific monster entity.
     * The card is removed but not discarded - the game handles rewards and discard.
     * 
     * @param monster - The Monster entity to kill
     */
    kill(monster: Monster) : void {
        const index = this._monstersInPlay.indexOf(monster);
        if (index >= 0) {
            this.killTop(index);
        }
    }
    
    /**
     * Kills the top monster in a specific slot.
     * Returns the card without discarding it - the game handles rewards and discard.
     * 
     * @param index - The slot index to kill from
     * @returns The killed monster card, or undefined if slot is invalid
     */
    killTop(index: number) : Card | undefined {
        if (index >= 0) {
            const card = this._slots[index]!.pop();
            if(this._slots[index]!.length > 0)
                this.createMonsterAtSlot(index);
            this.fillEmptySpots(false);
            return card;
        }
    }

    /**
     * Gets the Monster entity in a specific slot.
     * 
     * @param index - The slot index to check
     * @returns The Monster in the slot, or undefined if empty or out of bounds
     */
    monsterIn(index: number) : Monster | undefined {
        if (index >= 0 && index < this._monstersInPlay.length) {
            return this._monstersInPlay[index];
        }
        return undefined;
    }

    /**
     * Gets all card stacks in all encounter slots.
     * Each inner array represents a slot with potentially multiple stacked cards.
     * 
     * @returns 2D array of cards in slots
     */
    get slots(): Card[][] {
        return this._slots;
    }

    get visible(): MonsterCard[] {
        return this.slots.map(slot => slot[slot.length - 1] as MonsterCard);
    }

    get nonEngagedInCombat(): MonsterCard[] {
        return this.visible.map((monster, index) => ((this.monsterIn(index) === undefined || this.monsterIn(index)?.isEngagedInCombat) ? -1 : monster)).filter(index => index !== -1);
    }

    /**
     * Gets all active Monster entities currently in play.
     * Filters out undefined values (empty slots or event slots).
     * 
     * @returns Array of active Monster entities
     */
    get monsters(): Monster[] {
        return this._monstersInPlay.filter((m): m is Monster => m !== undefined);
    }
}
export { Shop, Encounters };