import { Entity } from "@/models/entity";
import { CharacterCard, Hand, InplayType, ItemCard, treasureCard, type Card, type EffectFunction, EffectOnStack, EffectData } from "./cards";
import type { Game } from "./game";
import type { Monster } from "./monster";

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
  /** 
   * Authentication token for this player.
   * This is the token the player uses to issue commands to the game.
   * The player receives this token when they join the game.
   */
  readonly secret: string;
  
  /** @private Number of souls collected. Temporary. Will be replaced by list of soul cards. */
  private _score: number;
  
  /** @private Current number of coins the player has */
  private _coin: number;
  
  /** @private The player's hand of loot cards */
  private _hand: Hand;
  
  /** @private Cards currently in play for this player (items, trinkets, etc.) */
  private _inPlay: Card[];
  
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
  
  /** @private Monsters or deck that this player must attack */
  private _mustAttackMonster: (Monster | "topDeck")[] = [];

  private _diceModifier: number = 0;

  get diceModifier(): number {
    return this._diceModifier;
  }

  addDiceModifier(value: number): void {
    this._diceModifier += value;
  }

  /**
   * Creates a new Player instance.
   * 
   * @param id - Unique identifier for the player (username)
   * @param attackPoints - Base attack power (default: 1)
   * @param healthPoints - Maximum and starting health (default: 2)
   * @param coins - Starting number of coins (default: 0)
   * @param secret - Authentication token (auto-generated if not provided)
   */
  constructor(
    id: string, 
    attackPoints: number=1, 
    healthPoints: number=2, 
    coins: number=0,
    secret: string = crypto.randomUUID()
  ) {
    super(id, attackPoints, healthPoints);
    this._score = 0;
    this._coin = coins;
    this._hand = new Hand();
    this.secret = secret;
    this._inPlay = [];
    this._souls = [];
    this._remainingLootPlay = 0;
  }

  /**
   * Gets the list of monsters or deck positions this player must attack.
   * @returns Array of required attack targets
   */
  get mustAttackMonster(): (Monster | "topDeck")[] {
    return this._mustAttackMonster;
  }
  
  /**
   * Adds a monster or deck position to the list of required attack targets.
   * @param value - The monster or "topDeck" that must be attacked
   */
  mustAttack(value: Monster | "topDeck") {
    this._mustAttackMonster.push(value);
  }
  
  /**
   * Returns true if the player has any attack requirement (must attack)
   */
  hasAttackRequirement(): boolean {
    return this._mustAttackMonster.length > 0;
  }
  
  /**
   * Returns true if player must attack the top of the monster deck
   */
  mustAttackTopDeck(): boolean {
    return this._mustAttackMonster.includes("topDeck");
  }
  
  /**
   * Returns true if attacking this element satisfies the requirement
   */
  canAttackThisMonster(elem: (Monster | "topDeck")): boolean {
    if (this._mustAttackMonster.length === 0) return true; // No requirement
    return this._mustAttackMonster.includes(elem); // Must be in the list
  }
  
  /**
   * Remove a monster from the must-attack list (call after attacking it)
   */
  clearAttackRequirement(elem?: Monster | "topDeck"): void {
    
    if (!elem) {
      // Clear all requirements
      this._mustAttackMonster = [];
      return;
    }

    // Otherwise, remove the specific monster from the list
    const index = this._mustAttackMonster.indexOf(elem);
    if (index !== -1) {
      this._mustAttackMonster.splice(index, 1);
    }
  }

  /**
   * Checks if the player can see the top card of the treasure deck.
   * @returns true if the player has this ability active
   */
  get canSeeTopOfTreasureDeck(): boolean {
    return this._canSeeTopOfTreasureDeck > 0;
  }
  
  /**
   * Modifies the player's ability to see the top of the treasure deck.
   * @param value - Modifier to add (+1 to enable, -1 to disable)
   * @throws {Error} If the resulting value is not 0 or 1
   */
  addCanSeeTopOfTreasureDeck(value: number) {
    const sum = this._canSeeTopOfTreasureDeck + value;
    if(sum !== 0 && sum !== 1) {
      throw new Error("canSeeTopOfTreasureDeck can only be set to 0 or 1");
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
   * Gets the player's character card.
   * @returns The character card in play
   * @throws {Error} If no character card is in play
   */
  get character(): CharacterCard {
    for (const card of this._inPlay) {
      if (card.type === "character") {
        return card as CharacterCard;
      }
    }
    throw new Error("No character card in play for this player.");
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
  addInPlay(card: Card): void {
    this._inPlay.push(card);
  }
  
  /**
   * Gets all cards currently in the player's play area.
   * @returns Array of cards in play
   */
  get inPlay(): Card[] {
    return this._inPlay;
  }
  
  /**
   * Removes a card from the player's in-play area.
   * @param card - The card to remove
   * @returns True if the card was successfully removed
   * @throws {Error} If the card is eternal and cannot be removed
   */
  removeInPlay(card: Card): boolean {
    const index = this._inPlay.indexOf(card);
    if(card.eternal)
      throw new Error("Cannot remove eternal card from in play.");
    return this.removeInPlayByIndex(index);
  }
  
  /**
   * Plays a loot card from the player's hand to their in-play area.
   * Decrements the remaining loot plays for this turn.
   * @param index - Index of the card in the hand
   * @returns The played card, or null if invalid
   * @throws {Error} If index is out of bounds or card is not a loot card
   */
  playLootCard(index: number): Card | null {
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
    this._mustAttackMonster = [];
    this.resetEntityFlags();
  }
  /**
   * Adds a soul card to the player's collection.
   * @param card - The card to add as a soul
   * @throws {Error} If the card has no soul value (soul < 1)
   */
  addSoul(card: Card){
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

    return await item.tryActivateEffect(targets, effectId);
  }
  gainCoins(coins: number): void {
    this._coin += coins;
  }

  rollDice(attackRoll: boolean = false): DiceRoll {
    if(attackRoll)
      this._attackRollThisTurn += 1;
    return new DiceRoll(this, attackRoll);
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

  verifySecret(secret: string): boolean {
    return this.secret === secret;
  }

 
  addScore(score: number): void {
    this._score += score;
  }

  get score(): number {
    return this._score;
  }
}

type DiceRollJSON = {
  diceRoll: number;
  issuer: string;
};
export class DiceRoll {
  private _value: number;
  private _issuer: Player;
  private _attackRoll;
  private _effect: EffectFunction[] | null = null;
  private _card: Card | null = null;
  private _targets: any[] = [];

  constructor(issuer: Player, attackRoll: boolean = false) {
    this._value = Math.floor(Math.random() * 6) + 1;
    this._issuer = issuer;
    this._attackRoll = attackRoll;
  }
  
  set targets(targets: any[]) {
    this._targets = targets;
  }

  get attackRoll(): boolean {
    return this._attackRoll;
  }
  get issuer(): Player {
    return this._issuer;
  }
  get value(): number {
    return this._value;
  }

  add(modifier: number): void {
    if(modifier < 0){
      throw new Error("Modifier must be positive");
    }
    this.value = this.value + modifier;
  }
  subtract(modifier: number): void {
    if (modifier < 0) {
      throw new Error("Modifier must be positive");
    }
    this.value = this.value - modifier;
  }
  get json(): DiceRollJSON {
    return { diceRoll: this.value, issuer: this.issuer.id };
  }
  set value(v: number) {
    this._value = Math.max(1, Math.min(6, v));
  }
  roll(): number {
    this._value = Math.floor(Math.random() * 6) + 1;
    return this._value;
  }
  attachEffect(effect: EffectFunction[], card: Card, targets: any[]=[]): void {
    if(effect.length != 6)
      throw new Error("Effect must have 6 outcomes, one for each dice face.");
    this._effect = effect;
    this._card = card;
    this._targets = targets;
  }
  async onResolve(): Promise<void> {
    this.value += (this._attackRoll ? this._issuer.attackDiceModifier : 0) + this._issuer.diceModifier;
    if (this._effect?.length === 6) {
      await this._effect[this._value - 1]!(new EffectData(this._card!, this._issuer, this._targets));
    }
  }
}

export class DamageOnStack {

  from: Entity;
  receiver: Entity;
  damage: number[];
  _card: Card;
  _targets: any[] = [];
  _effect: EffectFunction | null = null;
  game: Game;

  constructor(
    from: Entity,
    receiver: Entity,
    damage: number[],
    usingAbilityFrom: Card,
    game: Game
  ) {
    this.receiver = receiver;
    this.from = from;
    this.damage = damage;
    this._card = usingAbilityFrom;
    this.game = game;
  }

  attachEffect(effect: EffectFunction, card: Card, targets: any[] = []): void {
    this._effect = effect;
    this._card = card;
    this._targets = targets;
  }

  async onResolve(): Promise<void> {
    this.game.resolveDamage(this.from, this.receiver, this._card, this.damage[0]!);
    if(this._effect) {
      await this._effect(new EffectData(this._card, this.from as Player, [this, this._targets]));
    }
  }
  get json(): string {
    return JSON.stringify({from: this.from.id, receiver: this.receiver.id, damage: this.damage, card: this._card.name});
  }
};

export class DeathOnStack {

  receiver: Entity;
  from: Entity;
  usingAbilityFrom: Card; 
  game: Game;

  constructor(
    receiver: Entity,
    from: Entity,
    usingAbilityFrom: Card,
    game: Game
  ) {
    this.receiver = receiver;
    this.from = from;
    this.usingAbilityFrom = usingAbilityFrom;
    this.game = game;
  }

  async onResolve(): Promise<void> {
    await this.game.resolveDeath(this.receiver, this.from, this.usingAbilityFrom);
  }

  get json(): string {
    return JSON.stringify({receiver: this.receiver.id, from: this.from.id, card: this.usingAbilityFrom.name});
  }
};