import { Entity } from "@/models/entities/entity";
import type { Animation, Capability, EntityType, IdentifierType, Team } from "@/shared/api";
import { Card, CharacterCard, Hand, ItemCard, LootCard, MonsterCard } from "../cards";
import { EffectOnStack } from '../stackElement';
import type { Game } from "../game";
import { DiceRoll } from "../stackElement";

/**
 * Represents a player in the Four Souls game.
 * 
 * A Player is an Entity with additional game-specific properties including coins, hand, souls,
 * and various turn-based restrictions. Each player has a unique secret token used for authentication
 * when issuing commands to the game.
 * 
 * @extends Entity
 * 
 * @example
 * ```typescript
 * const player = new Player("DrMint", 1, 2, 3);
 * player.addInPlay(treasureCard);
 * player.addSoul(monsterCard);
 * ```
 */
export class Player extends Entity {
  readonly user: string;

  /** @private Current number of coins the player has */
  private _coin: number = 0;
  
  /** @private Whether the player play with their hand revealed */
  private _handRevealed: number = 0;

  /** @private The player's hand of loot cards */
  private _hand: Hand;
  
  /** @private Cards currently in play for this player (items, trinkets, etc.) */
  private _inPlay: ItemCard[];
  
  /** @private Soul cards collected by the player */
  private _souls: Card[];
  
  /** @private Number of loot cards the player can play this turn */
  private _remainingLootPlay: number;
  
  /** @private Number of times the player has attacked this turn */
  private _attackThisTurn: number = 0;
  
  /** @private Number of times the player has rolled for attack this turn */
  private _attackRollThisTurn: number = 0;
  
  /** @private Number of purchases remaining this turn */
  private _remainingPurchaseThisTurn: number = 0;
  
  /** @private Counter for effects that let player see top of treasure deck (0 or 1) */
  private _canSeeTopOfTreasureDeck: number = 0;
  
  /** @private Entities or deck that this player must attack, with the card that gave the requirement */
  private _mustAttackEntity: { target: Entity[] | "topDeck" | "any", source: Card }[] = [];

  /** @private List of entities or deck positions the player may attack additionally. Note that non-free attacks are consumed first.*/
  private _mayAttackForFree: { target: Entity | "topDeck", nb: number }[] = [];

  private _diceModifier: number = 0;

  private _canIUseLootThisTurn: number = 0;
  private _canIActivateThisTurn: number = 0;

  private _engagedInPurchase: number = 0;

  private _attackedIdsThisTurn: (string | "topDeck")[] = [];

  private _curses: MonsterCard[] = [];

  private _priceModifier: number = 0;

  private _animations: Animation[] = [];

  private _team: Team;
  /**
   * Creates a new Player instance.
   * 
   * @param id - Unique identifier for the player (username)
   */
  constructor(
    id: string,
    team: Team,
    user: string = crypto.randomUUID(),
  ) {
    super(id, 0, 0);
    this._team = team;
    this._hand = new Hand();
    this._inPlay = [];
    this._souls = [];
    this._remainingLootPlay = 0;
    this.attackable = false;
    this.user = user;
  }

  get team(): Team {
    return this._team;
  }

  get slug(): string {
    return this.inPlay.find(c => c instanceof CharacterCard) ? this.inPlay.find(c => c instanceof CharacterCard)!.slug : "";
  }

  get globalId(): number {
    const character = this.inPlay.find((c) => c instanceof CharacterCard) as CharacterCard | undefined;
    return character?.globalId ?? -1;
  }
  /**
   * Gets the list of entities or deck positions this player must attack, with source cards.
   * @returns Array of required attack targets with their source cards
   */
  get mustAttackEntity(): { target: Entity[] | "topDeck" | "any", source: Card }[] {
    return this._mustAttackEntity;
  }

  requirementListPRINT(): void {
    if(this.mustAttackEntity.length === 0) return;
    for(const req of this.mustAttackEntity)
    {
      if(req.target === "topDeck")
        console.log(`Must attack top of deck, source: ${req.source.name}`);
      else if(req.target === "any")
        console.log(`Must attack any, source: ${req.source.name}`);
      else 
        for(const entity of req.target as Entity[])
          console.log(`Must attack entity: ${entity.id}, source: ${req.source.name}`);
    }
    return;
  }

  requirementListJSON(game: Game): {target: IdentifierType | "topDeck", source: IdentifierType}[] {
    this.clearOutdatedAttackRequirements(game.attackableEntities);
    if(this.mustAttackEntity.length === 0) return [];
    const list: {target: IdentifierType | "topDeck", source: IdentifierType}[] = [];
    let sourceAny = undefined;
    for(const req of this.mustAttackEntity)
    {
      if(req.target === "topDeck")
        list.push({ target: "topDeck", source: req.source.jsonAPI });
      else if(req.target === "any")
        sourceAny = req.source.jsonAPI;
      else 
        for(const entity of req.target as Entity[])
      {
        if(entity instanceof Entity === false)
          continue;
        list.push({ target: entity.card.jsonAPI, source: req.source.jsonAPI });
      }
    }
    if(list.length === 0 && sourceAny !== undefined)
    {
      list.push({ target: "topDeck", source: sourceAny });
      for(const entity of game.attackableEntities)
        list.push({ target: entity.card.jsonAPI, source: sourceAny });
    }
    return list;
  }

  get mayAttackForFree(): { target: Entity | "topDeck", nb: number }[] {
    return this._mayAttackForFree;
  }

  mayAttackForFreeThis(target: Entity | "topDeck", nb: number): void {
    this._mayAttackForFree.push({ target, nb });
  }

  attackForFree(target: Entity | "topDeck"): boolean {
    const freeAttack = this._mayAttackForFree.find(free => free.target === target && free.nb > 0);
    if (freeAttack) {
      freeAttack.nb -= 1;
      return true;
    }
    return false;
  }
  
  get hasFreeAttackRemaining(): boolean {
    return this._mayAttackForFree.some(free => free.nb > 0);
  }
  /**
   * Adds a entity or deck position to the list of required attack targets.
   * @param value - The entity or "topDeck" that must be attacked
   * @param source - The card that gave this requirement
   */
  mustAttack(value: Entity[] | "topDeck" | "any", source: Card): void {
    this._mustAttackEntity.push({ target: value, source });
    this.attackThisTurn = Math.max(this.attackThisTurn, this._mustAttackEntity.length); // Ensure at least 1 attack this turn
  }
  
  /**
   * Returns true if the player has any attack requirement (must attack)
   */
  get hasAttackRequirement(): boolean {
    return this._mustAttackEntity.length > 0;
  }
  
  /**
   * Returns true if player must attack the top of the monster deck
   */
  mustAttackTopDeck(): boolean {
    return this._mustAttackEntity.some(req => req.target === "topDeck");
  }
  
  /**
   * Returns true if attacking this element satisfies the requirement
   */
  canAttackThisEntity(elem: (Entity | "topDeck")): Capability {
    if(elem === this)
      return "You cannot attack yourself.";
    if(elem !== "topDeck" && !elem.attackable) return "This target is unattackable";
    if (this._mustAttackEntity.length > 0)
    {
      const requirements = this._mustAttackEntity.some(
          req => req.target === elem 
          || (Array.isArray(req.target) && elem instanceof Entity && req.target.includes(elem))) 
          || this._mustAttackEntity.every(req => req.target === "any"); // Must be in the list
      if(requirements !== true){
        return "You have attack requirements."
        + ` You must attack ${this._mustAttackEntity.map(req => req.target instanceof Array ? req.target[0]!.card.name : req.target).join(", ")}.`;
      }
      return true;
    }
    if (this.attackThisTurn > 0)
    {
      return true; // If no requirement, any attack is valid as long as player has attacks left
    }
    const freeAttack = this.mayAttackForFree.some(free => free.target === elem && free.nb > 0); // Check if it's a free attack
    if (freeAttack === false)
    {
      if(this.mayAttackForFree.length > 0)
        return "You can only attack for free " 
        + this.mayAttackForFree.map(e => e instanceof Entity ? e.id : e).join(", ") + ".";
      return "No attacks remaining for this player this turn.";
    }
    return true;
  }
  /**
   * Entities can be flushed, or forced removed leading to outdated attack requirements. 
   * This function clears any requirements that can no longer be fulfilled.
   * @param elems 
   * @return true if the player has no more attack requirements, attacks remaining and free attacks, and is currently engaged in combat (used to check if combat should end after clearing requirements)
   */
  clearOutdatedAttackRequirements(elems: Entity[]): boolean {
    this._mustAttackEntity = this._mustAttackEntity.filter(req => {
      return !(req.target instanceof Array && req.target.every(t => !elems.includes(t)));
    });
    return (!this.hasAttackRequirement && !this.hasFreeAttackRemaining && this.attackThisTurn <= 0 && this.isEngagedInCombat)
  }

  /**
   * Remove an entity from the must-attack list (call after attacking it)
   */
  clearAttackRequirement(elem?: Entity | "topDeck" | "any"): void {
    
    if (!elem) {
      // Clear all requirements
      this._mustAttackEntity = [];
      return;
    }

    // Otherwise, remove the specific entity from the list
    const index = this._mustAttackEntity.findIndex(req => req.target === elem || (Array.isArray(req.target) && elem instanceof Entity && req.target.includes(elem)));
    if (index !== -1) {
      this._mustAttackEntity.splice(index, 1);
    }
  }

  /**
   * Remove must-attack requirements registered by a specific source card.
   * If `elem` is provided, only requirements matching that target are removed.
   */
  clearAttackRequirementsFromSource(source: Card, elem?: Entity | "topDeck" | "any"): void {
    this._mustAttackEntity = this._mustAttackEntity.filter((req) => {
      if (req.source !== source) {
        return true;
      }

      if (elem === undefined) {
        return false;
      }

      if (req.target === elem) {
        return false;
      }

      if (Array.isArray(req.target) && elem instanceof Entity && req.target.includes(elem)) {
        return false;
      }

      return true;
    });
  }

  attackThisId(id: string | "topDeck"): void {
    this._attackedIdsThisTurn.push(id);
  }
  
  get attackedIdsThisTurn(): (string | "topDeck")[] {
    return this._attackedIdsThisTurn;
  }

  /**
   * Gets the number of attacks the player has made this turn.
   * @returns Number of attacks this turn
   */
  get attackThisTurn(): number {
    return this._attackThisTurn;
  }
  
  /**
   * Sets the number of attacks made this turn.
   * @param value - New attack count
   */
  set attackThisTurn(value: number) {
    this._attackThisTurn = value;
  }

  /**
   * Gets the number of attack rolls made this turn.
   * @returns Number of attack rolls this turn
   */
  get attackRollThisTurn(): number {
    return this._attackRollThisTurn;
  }  
   
  /**
   * Sets the number of attack rolls made this turn.
   * @param value - New attack roll count
   */
  set attackRollThisTurn(value: number) {
    this._attackRollThisTurn = value;
  }
/**
   * Increments the number of attacks made this turn.
   * @param value - Amount to add to attack count
   */
  addAttackThisTurn(value: number): void {
    this._attackThisTurn += value;
  }

  /**
   * Records that this player completed attack declaration on a target.
   */
  registerAttackDeclaration(targetRequirement: Entity | "topDeck"): void {
    const targetKind = targetRequirement === "topDeck" ? "topDeck" : targetRequirement.id;
    if(this.attackThisTurn <= 0 && !this.hasAttackRequirement)
      if(!this.attackForFree(targetRequirement))
        throw new Error("No attacks remaining for this player this turn.");
    if (targetRequirement !== undefined) {
      this.clearAttackRequirement(targetRequirement);
    }
    this.attackThisId(targetKind);
    this.attackThisTurn = Math.max(0, this._attackThisTurn - 1);
  }


  /**
   * Checks if the player can see the top card of the treasure deck.
   * @returns true if the player has this ability active
   */
  get canSeeTopOfTreasureDeck(): boolean {
    return this._canSeeTopOfTreasureDeck > 0;
  }
  
  addAnimation(animation: Animation): void {
    this._animations.push(animation);
  }

  animations(remove: boolean): Animation[] {
    if (remove) {
      const animations = this._animations;
      this._animations = [];
      return animations;
    }
    return this._animations;
  }

  get canIUseLootThisTurn(): boolean {
    return this._canIUseLootThisTurn === 0;
  }

  addToCanIUseLootThisTurn(valueToAdd: number): void {
    this._canIUseLootThisTurn += valueToAdd;
    if(this._canIUseLootThisTurn < 0) {
      this._canIUseLootThisTurn = 0;
    }
  }

  resetCanIUseLootThisTurn(): void {
    this._canIUseLootThisTurn = 0;
  }

  get canIActivateThisTurn(): boolean {
    return this._canIActivateThisTurn === 0;
  }

  addToCanIActivateThisTurn(valueToAdd: number): void {
    this._canIActivateThisTurn += valueToAdd;
    if(this._canIActivateThisTurn < 0) {
      this._canIActivateThisTurn = 0;
    }
  }

  resetCanIActivateThisTurn(): void {
    this._canIActivateThisTurn = 0;
  }

  get isEngagedInPurchase(): boolean {
    return this._engagedInPurchase > 0;
  }

  purchaseEnded(): void {
    this._engagedInPurchase = Math.max(0, this._engagedInPurchase - 1);

  }

  engageInPurchase(): void {
    this._engagedInPurchase += 1;
  }
  get diceModifier(): number {
    return this._diceModifier;
  }

  addDiceModifier(value: number): void {
    this._diceModifier += value;
  }

  get handRevealed(): boolean {
    return this._handRevealed > 0;
  }
  
  set handRevealed(reveal: boolean) {
    this._handRevealed += reveal ? 1 : -1;
  }

  /**
   * Modifies the player's ability to see the top of the treasure deck.
   * @param value - Modifier to add (+1 to enable, -1 to disable)
   * @throws {Error} If the resulting value is not 0 or 1
   */
  addCanSeeTopOfTreasureDeck(value: number): void {
    const sum = this._canSeeTopOfTreasureDeck + value;
    if(sum < 0) { // can be set to more than 1 with modelling clay.
      throw new Error("canSeeTopOfTreasureDeck can not be set to a value less than 0");
    }
    this._canSeeTopOfTreasureDeck = sum;
  }

  /**
   * Gets the player's current coin count.
   * @returns Number of coins the player has
   */
  get coins(): number {
      return this._coin;
  }

  /**
   * Gets the player's hand of loot cards.
   * @returns The Hand object containing the player's loot cards
   */
  get hand(): Hand {
    return this._hand;
  }

  /**
   * Gets the player's collected soul cards.
   * @returns Array of cards that count as souls
   */
  get souls(): Card[] {
    return this._souls;
  }

  soulsInCommonWith(player: Player): void{
    this._souls = player.souls;
  }

  /**
   * Calculates the total number of souls the player has collected.
   * Each soul card may be worth more than 1 soul.
   * @returns Total soul count from all soul cards
   */
  get totalSouls(): number {
    let total = 0;
    for (const soul of this._souls) {
      total += soul.soul;
    }
    return total;
  }

  /**
   * Gets the number of loot cards the player can still play this turn.
   * @returns Number of remaining loot plays
   */
  get remainingLootPlay(): number {
    return this._remainingLootPlay;
  }

  /**
   * Sets the number of loot cards the player can play this turn.
   * @param value - New loot play limit
   */
  set remainingLootPlay(value: number) {
    this._remainingLootPlay = value;
  }

  /**
   * Gets the player's character card.
   * @returns The character card in play
   * @throws {Error} If no character card is in play
   */
  get character(): CharacterCard {
    for (const card of this._inPlay) {
      if (card instanceof CharacterCard) {
        return card;
      }
    }
    throw new Error("No character card in play for this player.");
  }

  override get card(): CharacterCard{
    return this.character;
  }
 
  get curses(): MonsterCard[] {
    return this._curses;
  }

  addCurse(curse: MonsterCard): void {
    this._curses.push(curse);
  }

  removeCurse(curse: MonsterCard): boolean {
    const index = this._curses.indexOf(curse);
    if (index !== -1) {
      this._curses.splice(index, 1);
      return true;
    }
    return false;
  }
  
  /**
   * Initializes per-turn action counters for this player.
   */
  initializeTurnCounters(isCurrentPlayer: boolean, lootPlayPerTurn: number): void {
    this._remainingLootPlay = isCurrentPlayer ? lootPlayPerTurn : 0;
    this._attackThisTurn = isCurrentPlayer ? 1 : 0;
    this._remainingPurchaseThisTurn = isCurrentPlayer ? 1 : 0;
  }

  /**
   * Adds to the number of loot cards the player can play this turn.
   * @param value - Amount to add to loot play limit
   */
  addLootPlay(value: number): void {
    this._remainingLootPlay += value;
  }
////////// In play Methods /////////
  /**
   * Adds a card to the player's in-play area.
   * @param card - The card to add to play
   */
  addInPlay(card: ItemCard): void {
    this._inPlay.push(card);
  }
  
  /**
   * Gets all cards currently in the player's play area.
   * @returns Array of cards in play
   */
  get inPlay(): ItemCard[] {
    return this._inPlay;
  }
  
  /**
   * Removes a card from the player's in-play area.
   * @param card - The card to remove
   * @returns True if the card was successfully removed
   * Note that eternal cards cannot be removed from play by this method and will return false.
   */
  removeInPlay(card: ItemCard): boolean {
    const index = this._inPlay.indexOf(card);
    if(index === -1) return false;
    if(card.eternal)
      return false;
    return this.removeInPlayByIndex(index);
  }
  
  /**
   * Plays a loot card from the player's hand to their in-play area.
   * Decrements the remaining loot plays for this turn.
   * @param index - Index of the card in the hand
   * @returns The played card, or null if invalid
   * @throws {Error} If index is out of bounds or card is not a loot card
   */
  playLootCard(index: number): LootCard | null {
    if (index < 0 || index >= this._hand.cards.length) {
      throw new Error("Index out of bounds");
    }
    const card = this._hand.cards[index]!;
    if (card.type !== "loot") {
      throw new Error("Card at index is not a loot card");
    }
    this._hand.cards.splice(index, 1);
    this._remainingLootPlay -= 1;
    this._inPlay.push(card);
    return card;
  }
  
  /**
   * Removes a card from the in-play area by its index.
   * @param index - Index of the card to remove
   * @returns True if successfully removed, false if index invalid or card is eternal
   */
  removeInPlayByIndex(index: number): boolean {
    const canBeRemoved = this._inPlay[index]?.eternal !== true;
    if (index >= 0 && canBeRemoved) {
      this._inPlay.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Replaces the player's current hand with a new one.
   * @param hand - The new Hand object
   * @returns The previous Hand that was replaced
   */
  setHand(hand: Hand): Hand {
    const previousHand = this._hand;
    this._hand = hand;
    return previousHand;
  }

  /**
   * Removes a specific card from either the player's in-play area or hand.
   * Searches in-play first, then hand.
   * @param target - The card to remove
   * @returns True if the card was found and removed
   */
  removeCard(target: Card): boolean {
    for (let i = 0; i < this.inPlay.length; i++) {
      const card = this.inPlay[i];
      if (card === target) {
        this._inPlay.splice(i, 1);
        return true;
      }
    }
    for (let i = 0; i < this._hand.cards.length; i++) {
      const card = this._hand.cards[i];
      if (card === target) {
        this._hand.cards.splice(i, 1);
        return true;
      }
    }
    return false;
  }

  get unchargedItems(): ItemCard[] {
    return this.inPlay.filter(card => card instanceof ItemCard && !card.charged) as ItemCard[];
  }
  /**
   * Gets the number of purchases the player can make this turn.
   * @returns Number of remaining purchases
   */
  get remainingPurchaseThisTurn(): number {
    return this._remainingPurchaseThisTurn;
  }
  
  /**
   * Sets the number of purchases allowed this turn.
   * @param value - New purchase limit
   */
  set remainingPurchaseThisTurn(value: number) {
    this._remainingPurchaseThisTurn = value;
  }

  /**
   * Resets all turn-based flags and counters.
   * Called at the start of each player's turn.
   * Resets: attacks, attack rolls, purchases, attack requirements, and entity flags.
   */
  resetTurnFlags() : void {
    this._attackThisTurn = 0;
    this._attackRollThisTurn = 0;
    this._remainingPurchaseThisTurn = 0;
    this.resetCanIActivateThisTurn();
    this.resetCanIUseLootThisTurn();
    this._attackedIdsThisTurn = [];
    this._mustAttackEntity = [];
    this._mayAttackForFree = [];
    this.resetEntityFlags();
  }
  /**
   * Adds a soul card to the player's collection.
   * @param card - The card to add as a soul
   * @throws {Error} If the card has no soul value (soul < 1)
   */
  addSoul(card: Card): void {
    if(card.soul < 1)
    {
      throw new Error("Cannot add a card with no soul as a soul card.");
    }
    this._souls.push(card);
  }
  
  /**
   * Removes a soul card from the player's collection.
   * @param card - The soul card to remove
   * @returns True if the card was found and removed, false otherwise
   */
  removeSoul(card: Card): boolean {
    const idx = this._souls.indexOf(card);
    if (idx < 0 || idx >= this._souls.length) {
      return false;
    }
    this._souls.splice(idx, 1);
    return true;
  }
  async activateItem(item: ItemCard, targets: any[] = [], effectId: number | "tap" = "tap"): Promise<EffectOnStack> {
    const index = this._inPlay.indexOf(item);
    if (index === -1) {
      throw new Error("Item not in play.");
    }
    if (!item.targetStillValid(this, effectId, targets))
      throw new Error("Targets are not valid for this effect.");

    return item.tryActivateEffect(targets, effectId);
  }
  gainCoins(coins: number): void {
    this._coin += coins;
  }

  rollDice(random: () => number, attackRoll: boolean = false, card: Card | null = null): DiceRoll {
    if(attackRoll)
      this._attackRollThisTurn += 1;
    return new DiceRoll(random, this, attackRoll, card);
  }

  /**
   * A positive price modifier increases the cost.
   */
  set priceModifier(value: number) {
    this._priceModifier = value;
  }

  get priceModifier(): number {
    return this._priceModifier;
  }

  /* This methods tries to remove n coins to the player and return true if it does.
   * if the player have less than n coins and asMany is true, all his coins are removed.
   * */
  loseCoins(coins: number, asMany: boolean): number {
    if (this._coin >= coins) {
      this._coin -= coins;
      return coins;
    } else if (asMany) {
      const allCoins = this._coin;
      this._coin = 0;
      return allCoins;
    }
    return 0;
  }

  get json(): EntityType {
    return {
        type: "player",
        color: this.color,
        name: this.id,
        slug: this.inPlay.length > 0 ? this.inPlay[0]!.slug : "",
        globalId: this.globalId,
      }
    }
}