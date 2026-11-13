import { Game } from "@/models/game";
import { GameError } from "@/models/GameError";
import { toSerializedTranslation } from "@/utils/translation";
import { type Deck, EffectData, MonsterCard, MonsterType } from "../cards";
import { Monster } from "../entities/monster";
import { Player } from "../entities/player";
import { EffectOnStack } from '../stackElement';
import { Slots } from "./slots";
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
    override fillEmptySpots(eventsBottom = false): void {
        for (let i = 0; i < this._slots.length; i++) {
            // An indomitable card goes to a new slot instead, so keep drawing until this slot is filled.
            while (this._slots[i]!.length == 0) {
                let card = this._deck.draw();
                if (eventsBottom) {
                    for (let i = 0; i < this._deck.length; i++) {
                        if (card!.encounterType === MonsterType.EVENT) {
                            this._deck.addBottomPosition(card!);
                            card = this._deck.draw();
                        }
                        else
                            break;
                        if (i === this._deck.length - 1) {
                            throw new GameError(`No valid monster card found in deck. The deck has ${this._deck.length} cards left.`,
                                toSerializedTranslation("error.behaviorError", { error: `No valid monster card found in deck. The deck has ${this._deck.length} cards left.` })
                            );
                        }
                    }
                    if (!(card instanceof MonsterCard)) {
                        throw new GameError("Non monster card in encounters deck",
                            toSerializedTranslation("error.behaviorError", { error: "Non monster card in encounters deck" })
                        );
                    }
                }
                this.placeInSlot(i, card!);
            }
        }
    }

    /**
     * Places a card on top of a slot and creates its monster.
     * An indomitable card is placed in a new slot instead.
     *
     * @returns Whether the card was placed in the given slot.
     */
    private placeInSlot(index: number, card: MonsterCard): boolean {
        if (card.indomitable) {
            this._slots.push([card]);
            this.createMonsterAtSlot(this._slots.length - 1);
            return false;
        }
        this._slots[index]!.push(card);
        this.createMonsterAtSlot(index);
        return true;
    }


    /**
     * Obtains a specific card from the encounter area by its slug.
     * Searches all slots, then the discard pile, then the deck.
     * The card is removed from wherever it's found.
     *
     * @param slug - The unique identifier of the card to obtain
     * @returns The card if found, undefined otherwise
     */
    override obtainCard(slug: string, globalId?: number): MonsterCard | undefined {
        for (let i = 0; i < this._slots.length; i++) {
            const indexInSlot = this._slots[i]!.findIndex(card => card.slug === slug && (globalId === undefined || card.globalId === globalId)
            );
            if (indexInSlot >= 0) {
                return this.removeAtIndices(i, indexInSlot);
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
     * An indomitable card is placed in a new slot instead, leaving the given slot unchanged.
     *
     * @param position - The slot index to draw to
     * @returns Whether the drawn card was placed in the given slot.
     */
    override draw(position: number): boolean {
        if (position < 0 || position >= this._slots.length)
            throw new GameError("Invalid slot position to draw to. Position: " + position + ", Slots length: " + this._slots.length,
                toSerializedTranslation("error.behaviorError", { error: "Invalid slot position to draw to. Position: " + position + ", Slots length: " + this._slots.length }));
        const card = this._deck.draw();
        if (card === undefined)
            throw new GameError(`Cannot draw card from deck for slot ${position}. The deck has ${this._deck.cards.length} cards left.`,
                toSerializedTranslation("error.behaviorError", { error: `Cannot draw card from deck for slot ${position}. The deck has ${this._deck.cards.length} cards left.` }));
        return this.placeInSlot(position, card);
    }

    /**
     * Removes the top card from a slot without sending it to discard.
     * Refills or reveals the next card in the slot as needed.
     *
     * @param index - The slot index to remove the top card from
     * @returns The removed card, if any
     */
    override removeTop(index: number): MonsterCard | undefined {
        if (index < 0) {
            return undefined;
        }
        const card = this._slots[index]!.pop();
        this.revealOrRefill(index);
        return card;
    }

    /**
     * Updates a slot whose top card just left: reveals the covered card, or refills the slot if it is empty.
     */
    private revealOrRefill(index: number): void {
        if (this._slots[index]!.length === 0) {
            this.fillEmptySpots(false);
        } else {
            this.createMonsterAtSlot(index);
        }
    }

    /**
     * Moves the top card of a slot to the bottom of the monster deck.
     *
     * @param index - The slot index to move from
     */
    override moveToBottom(index: number): void {
        if (index >= 0) {
            const card = this.removeTop(index);
            this.fillEmptySpots(false);
            this._deck.addBottomPosition(card!);
        }
    }

    /**
     * Discards all top cards from all slots and refills.
     * Used for effects that clear the encounter area.
     * EXCEPT IF THE MONSTER IS ENGAGED IN COMBAT, IN WHICH CASE IT IS LEFT IN PLACE AND NOT DISCARDED.
     */
    override flush(): void {
        for (let i = 0; i < this._slots.length; i++) {
            if (this.canFlushIndex(i))
                this.discardTop(i);
        }
        this.fillEmptySpots(false);
    }
    flushWithException(exceptions: MonsterCard[]): void {
        for (let i = 0; i < this._slots.length; i++) {
            if (this.canFlushIndex(i) && !exceptions.includes(this._slots[i]![this._slots[i]!.length - 1]!))
                this.discardTop(i);
        }
        this.fillEmptySpots(false);
    }

    /**
     * Moves all top cards from all slots to the bottom of the deck.
     * Different from flush as cards go to bottom instead of discard.
     * EXCEPT IF THE MONSTER IS ENGAGED IN COMBAT, IN WHICH CASE IT IS LEFT IN PLACE AND NOT DISCARDED.
     */
    override flushToBottom(): void {
        this.flushToBottomWithException([]);
    }
    flushToBottomWithException(exeptions: MonsterCard[]): void {
        for (let i = 0; i < this._slots.length; i++) {
            if (this.canFlushIndex(i) && !exeptions.includes(this._slots[i]![this._slots[i]!.length - 1]!)) {
                this.moveToBottom(i);
            }
        }
        this.fillEmptySpots();
    }

    /**
     * Puts each monster not being attacked into discard and replaces each with the top card of the monster deck.
     * The replacement is drawn directly on the slot, so a covered card under the discarded one stays covered.
     */
    override flushAndDraw(): void {
        // Slots can be added while drawing (indomitable monsters), only the existing ones are flushed.
        const nbSlots = this._slots.length;
        for (let i = 0; i < nbSlots; i++) {
            if (!this.canFlushIndex(i))
                continue;
            const card = this._slots[i]!.pop();
            if (card !== undefined)
                this._deck.addDiscardTop(card);
            // draw() cleans up the discarded monster before creating the new one.
            // An indomitable replacement goes to its own slot: this slot then reveals its covered card or is refilled.
            if (!this.draw(i))
                this.revealOrRefill(i);
        }
    }

    createEventEffect(event: MonsterCard): EffectOnStack {
        return new EffectOnStack(
            async (data: EffectData) => {
                const stackIds = this._game.stack.currentStackIds;
                if (!(data.issuer instanceof Player))
                    throw new GameError("Event encounter effect issuer is not a player",
                        toSerializedTranslation("error.eventEncounterIssuerNotPlayer"));
                if (event.isCurse) {
                    const selection = await data.selectAndRecord(this._game, this._game.currentPlayer, 1, 1, this._game.players, toSerializedTranslation("pending.playerToReceiveEvent", { card: event.nameKey }), data.serializedCardAndBox, true, true);
                    const owner = selection.selected[0];
                    if (!owner) return false;
                    await this._game.cardHandler.addCurse(owner, event);
                } else {
                    await event.onPlay(data.issuer, data.targets);
                }
                await this._game.executeWhenStackSubset(stackIds, () => {
                    if (event.afterEffect !== "handled") {
                        this.removeFromSlot(event);
                        if (event.afterEffect === "discard")
                            this._deck.addDiscardTop(event); // remove the card once the effect is resolved.
                    }
                }, false); // the event resolved: cancelling the stack (e.g. Broken Ankh, Pitfall!) must not leave it in its slot.
                return true;
            },
            new EffectData(event, () => this._game.currentPlayer, []),
            event.effectOutcomes.join('\n'), "event"
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
        const card = this._slots[index]![this._slots[index]!.length - 1]!;
        const toClean = this._monstersInPlay[index];
        if (toClean !== undefined) {
            toClean.card.cleanup();
            // this._game.stack.clearEffectsFromEntity(toClean);
        }
        if (card.encounterType !== MonsterType.EVENT) {
            const monster = new Monster(card, this);
            this._monstersInPlay[index] = monster;
            monster.addHealthPoints(this.healthModifier);
            card.onAddInPlay(() => monster);
        } else {
            this._monstersInPlay[index] = undefined!;
            const effect: EffectOnStack = this.createEventEffect(card);
            this._game.addToStack(effect);
        }
    }

    /**
     * Gets indices of all slots that are either empty or contain monsters not engaged in combat.
     * Used to determine valid attack targets or where new monsters can appear.
     *
     * @returns Array of slot indices that are not currently being attacked
     */
    get nonAttackedSlots(): MonsterCard[] {
        return this._slots.filter((slot, index) => slot.length === 0 || (!(this.monsterIn(index)?.isEngagedInCombat || this.visible[index]?.encounterType === MonsterType.EVENT))).map(slot => slot[slot.length - 1]!).filter(card => card !== undefined);
    }

    canFlushIndex(index: number): boolean {
        return this.monsterIn(index) !== undefined && this.monsterIn(index)!.isEngagedInCombat !== true && this.monsterIn(index)!.isDead !== true;
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

    get coverableSlots(): MonsterCard[] {
        return this.nonEngagedInCombat.filter(card => !card.indomitable);
    }

    /**
     * player selects a valid slot index to draw a card from the monster deck into.
     * Valid slots must not be: an event, a monster engaged in combat, a monster dead, or an indomitable monster.
     * @param game 
     * @param player 
     * @param data - EffectData containing the selection context
     * @returns The index of the slot the card was drawn into 
     */
    async selectValidIndexAndDraw(game: Game, player: Player, data: EffectData, youMay: boolean = false, forbiden: MonsterCard[] = []): Promise<number>
    {
        const selected = (await data.selectAndRecord(game, player, youMay ? 0 : 1, 1, this.coverableSlots.filter(c => !forbiden.includes(c)), toSerializedTranslation("pending.slot"), data.serializedCardAndBox, true, true)).selected;

        if(selected.length === 0)
            return -1;
        const selection = selected[0];
        if(selection === undefined)
            throw new GameError("No selection made for searchForBloatEffect.",
                toSerializedTranslation("error.behaviorError", { error: "No selection made for searchForBloatEffect." }));
        const index:number = this.visible.indexOf(selection as MonsterCard);
        this.draw(index);
        return index;
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
        // An indomitable card gets its own slot and does not replace anything.
        if (monsterCard.indomitable) {
            this.placeInSlot(index, monsterCard);
            return;
        }
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
     */
    flushMonster(monster: Monster, place: "discard" | "bottom"): boolean {
        const idx = this._slots.findIndex(slot => slot.includes(monster.card));
        if (idx >= 0) {
            if (place === "discard") {
                this.discardTop(idx);
            } else {
                this.moveToBottom(idx);
            }
            this.fillEmptySpots(false);
            return true;
        }
        return false
    }

    /**
     * Kills a specific monster entity.
     * The card is removed but not discarded - the game handles rewards and discard.
     *
     * @param monster - The Monster entity to kill
     */
    kill(monster: Monster): void {
        const slotIndex = this._monstersInPlay.indexOf(monster);
        const index = this._slots[slotIndex]?.indexOf(monster.card) ?? -1;
        if (index >= 0) {
            this.killTop(slotIndex);
        } else {
            this.removeCard(monster.card);
        }
    }

    /**
     * Kills the top monster in a specific slot.
     * Returns the card without discarding it - the game handles rewards and discard.
     *
     * @param index - The slot index to kill from
     * @returns The killed monster card, or undefined if slot is invalid
     */
    killTop(index: number): MonsterCard | undefined {
        if (index >= 0) {
            const card = this._slots[index]!.pop();
            if (this._slots[index]!.length > 0)
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
    monsterIn(index: number): Monster | undefined {
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
        return this.visible.map((monster, index) => (!this.canFlushIndex(index) ? -1 : monster)).filter(index => index !== -1);
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

