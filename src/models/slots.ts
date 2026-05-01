    import { type Card, type Deck, type TreasureCard, EffectData, EffectOnStack, MonsterCard, MonsterType, RoomCard } from "./cards";
import type { Animated } from "./entity";
import type { Game } from "./game";
import { Monster } from "./monster";
import { Player } from "./player";

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

    removeAtIndices(i: number, j: number): T | undefined {
        if (i < 0 || i >= this._slots.length || j < 0 || j >= this._slots[i]!.length) {
            return undefined;
        }
        const card = this._slots[i]![j];
        this._slots[i]!.splice(j, 1);
        this.fillEmptySpots();
        return card;
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
        this._slots[position]!.push(card!);
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
        return this._slots.map(slot => slot[slot.length - 1]);
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
            game.addInPlay(player, this.itemsInShop[index]!);
            this._slots[index]?.pop();
            this.fillEmptySpots();
            return true;
        }
        return false;
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
export class Encounters extends Slots<MonsterCard> {
    /** @private Array of active Monster entities (one per slot, undefined if event or empty) */
    _monstersInPlay: (Monster | undefined)[];
    
    /** @private Reference to the game instance */
    _game: Game; // Game type
    
    /** Global modifier to all monster evasion values */
    dcModifier: number = 0;

    /** Global modifier to all monster attack values */
    attackModifier: number = 0;
    
    /** Health modifier for all monsters */
    healthModifier: number = 0;

    /**
     * Creates a new Encounters manager.
     * Initializes all slots and fills them with monsters (filtering out events during setup).
     * 
     * @param nbEncounterSlots - Number of monster slots to create
     * @param deck - The monster deck to draw from
     * @param game - The game instance
     */
    constructor(nbEncounterSlots: number, deck: Deck<MonsterCard>, game: Game) {
        super(nbEncounterSlots, deck);
        this._monstersInPlay = new Array(nbEncounterSlots);
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
    override fillEmptySpots(eventsBottom = false) : void {
        for (let i = 0; i < this._slots.length; i++) {
            if (this._slots[i]!.length == 0) {
                let card = this._deck.draw();
                if (eventsBottom) {
                    while (card!.encounterType === MonsterType.EVENT) {
                        this._deck.addBottomPosition(card!);
                        card = this._deck.draw();
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
     * Obtains a specific card from the encounter area by its slug.
     * Searches all slots, then the discard pile, then the deck.
     * The card is removed from wherever it's found.
     * 
     * @param slug - The unique identifier of the card to obtain
     * @returns The card if found, undefined otherwise
     */
    override obtainCard(slug: string, globalId?: number): MonsterCard | undefined{
        for (let i = 0; i < this._slots.length; i++) {
            const indexInSlot = this._slots[i]!.findIndex(card =>
                card.slug === slug && (globalId === undefined || card.globalId === globalId)
            );
            if (indexInSlot >= 0) {
                const card = this._slots[i]![indexInSlot];
                this._slots[i]!.splice(indexInSlot, 1);
                this.fillEmptySpots(true);
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
    override draw(position: number) : void {
        if(position < 0 || position >= this._slots.length)
            throw new Error("Invalid slot position to draw to.");
        const card = this._deck.draw();
        this._slots[position]!.push(card!);
        this.createMonsterAtSlot(position);
    }

    /**
     * Removes the top card from a slot without sending it to discard.
     * Refills or reveals the next card in the slot as needed.
     *
     * @param index - The slot index to remove the top card from
     * @returns The removed card, if any
     */
    override removeTop(index: number) : MonsterCard | undefined {
        if (index < 0) {
            return undefined;
        }
        const card = this._slots[index]!.pop();
        if(this._slots[index]!.length === 0) {
            this.fillEmptySpots(false);
        }else{
            this.createMonsterAtSlot(index);
        }
        return card;
    }

    /**
     * Moves the top card of a slot to the bottom of the monster deck.
     * 
     * @param index - The slot index to move from
     */
    override moveToBottom(index: number) : void {
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
    override flush() : void {
        for (let i = 0; i < this._slots.length; i++) {
            if(this.monsterIn(i) !== undefined && !this.monsterIn(i)?.isEngagedInCombat)
                this.discardTop(i);
        }
        this.fillEmptySpots(false);
    }

    createEventEffect(event: MonsterCard): EffectOnStack{
        return new EffectOnStack(
                async (data:EffectData) => {
                    const stackIds = this._game.stack.elements.map(e => e.stackId);
                    if(!(data.issuer instanceof Player))
                        throw new Error("Event encounter effect issuer is not a player");
                    if (event.isCurse) {
                        const selection = await data.selectAndRecord(this._game, this._game.currentPlayer, 1, 1, this._game.players, `Select a player to receive ${event.name}.`, true, true);
                        const owner = selection.selected[0];
                        if (!owner) return false;
                        this._game.addCurse(owner, event);
                    } else {
                        await event.onPlay(data.issuer, data.targets);
                    }
                    await this._game.executeWhenStackSubset(stackIds, () => {
                        if(event.afterEffect !== "handled")
                        {
                            this.removeFromSlot(event);
                            if(event.afterEffect === "discard")
                                this._deck.addDiscardTop(event); // remove the card once the effect is resolved.
                        }
                    });
                    return true;
                }, 
                new EffectData(event, () => this._game.currentPlayer, []), 
                event.effectOutcomes.join('\n')
            );
    }

    /**
     * Creates a Monster entity from the top card of an encounter slot.
     * If the card is an EVENT, it's added to the stack instead and the slot is cleared.
     * Cleans up the previous monster in the slot if one exists.
     * 
     * @param index - The slot index to create a monster at
     */
    createMonsterAtSlot(index: number): void {
        const toClean = this._monstersInPlay[index];
        if (toClean !== undefined) {
            toClean.card.cleanup();
        }
        const card = this._slots[index]![this._slots[index]!.length - 1]!;
        if (card.encounterType !== MonsterType.EVENT) {
            const monster = new Monster(card, this);
            monster.addHealthPoints(this.healthModifier);
            card.onAddInPlay(() => monster);
            this._monstersInPlay[index] = monster;
        } else {
            this._monstersInPlay[index] = undefined!;
            const effect: EffectOnStack = this.createEventEffect(card);
            this._game.executeWhenStackEmpty(() => {
                this._game.addToStack(effect);
            });
        }
    }

    /**
     * Gets indices of all slots that are either empty or contain monsters not engaged in combat.
     * Used to determine valid attack targets or where new monsters can appear.
     * 
     * @returns Array of slot indices that are not currently being attacked
     */
    get nonAttackedSlots() : MonsterCard[] {
       return this._slots.filter((slot, index) => slot.length === 0 || (!(this.monsterIn(index)?.isEngagedInCombat || this.visible[index]?.encounterType === MonsterType.EVENT))).map(slot => slot[slot.length - 1]!).filter(card => card !== undefined);
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

    addHealthModifier(value: number): void {
        this.healthModifier += value;
        for (let i = 0; i < this._monstersInPlay.length; i++) {
            const monster = this._monstersInPlay[i];
            if (monster) {
                monster.addHealthPoints(value);
            }
        }
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
    killTop(index: number) : MonsterCard | undefined {
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
    get slots(): MonsterCard[][] {
        return this._slots;
    }

    get visible(): MonsterCard[] {
        return this.slots.map(slot => slot[slot.length - 1]!);
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
    override draw(position: number) : void {
        const card = this._deck.draw();
        this._slots[position]!.push(card!);
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
    override removeTop(index: number) : RoomCard | undefined {
        if (index < 0) {
            return undefined;
        }
        const card = this._slots[index]!.pop();
        card?.cleanup();
        if(this._slots[index]!.length === 0) {
            this.fillEmptySpots();
        }
        return card;
    }
    
    roomIn(index: number): RoomCard | undefined {
        if(index < 0 || index >= this._slots.length)
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
export class AnimatedList {
    private _animated: Animated[] = [];
    
    constructor() {}
    
    add(animated: Animated): void {
        this._animated.push(animated);
    }
    remove(animated: Animated): void {
        const index = this._animated.indexOf(animated);
        if (index >= 0) {
            this._animated.splice(index, 1);
        }
    }
    get all(): Animated[] {
        return this._animated;
    }

    reset(): void {
        this._animated.forEach(animated => animated.card.cleanup());
        this._animated = [];
    }
}