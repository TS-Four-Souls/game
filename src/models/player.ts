import { Entity } from "@/models/entity";
import type { DamageOnStackJson, DeathOnStackJson, DiceRollJson, EntityType, IdentifierType } from "@/shared/api";
import { Card, CharacterCard, EffectData, type EffectFunction, EffectOnStack, Hand, ItemCard, LootCard, MonsterCard } from "./cards";
import type { Game } from "./game";
import { Monster } from "./monster";
import { StackElement } from "./stackElement";
import { TargetBuilder } from "./targetBuilder";

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
  
  /** @private Monsters or deck that this player must attack, with the card that gave the requirement */
  private _mustAttackMonster: { target: Monster[] | "topDeck" | "any", source: Card }[] = [];

  /** @private List of monsters or deck positions the player may attack additionally. Note that non-free attacks are consumed first.*/
  private _mayAttackForFree: { target: Monster | "topDeck", nb: number }[] = [];

  private _diceModifier: number = 0;

  private _canIUseLootOrActivateThisTurn: number = 0;

  private _engagedInPurchase: number = 0;

  private _attackedIdsThisTurn: (string | "topDeck")[] = [];

  private _curses: MonsterCard[] = [];

  private _priceModifier: number = 0;

  /**
   * Creates a new Player instance.
   * 
   * @param id - Unique identifier for the player (username)
   * @param secret - Authentication token (auto-generated if not provided)
   */
  constructor(
    id: string,
    secret: string = crypto.randomUUID()
  ) {
    super(id, 0, 0);
    this._hand = new Hand();
    this.secret = secret;
    this._inPlay = [];
    this._souls = [];
    this._remainingLootPlay = 0;
    this.attackable = false;
  }

  get slug(): string {
    return this.inPlay.find(c => c instanceof CharacterCard) ? this.inPlay.find(c => c instanceof CharacterCard)!.slug : "";
  }

  get globalId(): number {
    const character = this.inPlay.find((c) => c instanceof CharacterCard) as CharacterCard | undefined;
    return character?.globalId ?? -1;
  }
  /**
   * Gets the list of monsters or deck positions this player must attack, with source cards.
   * @returns Array of required attack targets with their source cards
   */
  get mustAttackMonster(): { target: Monster[] | "topDeck" | "any", source: Card }[] {
    return this._mustAttackMonster;
  }

  requirementListJSON(game: Game): {target: IdentifierType | "topDeck", source: IdentifierType}[] {
    if(this.mustAttackMonster.length === 0) return [];
    const list: {target: IdentifierType | "topDeck", source: IdentifierType}[] = [];
    let sourceAny = undefined;
    for(const req of this.mustAttackMonster)
    {
      if(req.target === "topDeck")
        list.push({ target: "topDeck", source: req.source.jsonAPI });
      else if(req.target === "any")
        sourceAny = req.source.jsonAPI;
      else 
        for(const monster of req.target as Monster[])
          list.push({ target: monster.card.jsonAPI, source: req.source.jsonAPI });
    }
    if(list.length === 0 && sourceAny !== undefined)
    {
      list.push({ target: "topDeck", source: sourceAny });
      for(const monster of game.monsters)
        list.push({ target: monster.card.jsonAPI, source: sourceAny });
    }
    return list;
  }

  get mayAttackForFree(): { target: Monster | "topDeck", nb: number }[] {
    return this._mayAttackForFree;
  }

  mayAttackForFreeThis(target: Monster | "topDeck", nb: number): void {
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
   * Adds a monster or deck position to the list of required attack targets.
   * @param value - The monster or "topDeck" that must be attacked
   * @param source - The card that gave this requirement
   */
  mustAttack(value: Monster[] | "topDeck" | "any", source: Card) {
    this._mustAttackMonster.push({ target: value, source });
    this.attackThisTurn = Math.max(this.attackThisTurn, this._mustAttackMonster.length); // Ensure at least 1 attack this turn
  }
  
  /**
   * Returns true if the player has any attack requirement (must attack)
   */
  get hasAttackRequirement(): boolean {
    return this._mustAttackMonster.length > 0;
  }
  
  /**
   * Returns true if player must attack the top of the monster deck
   */
  mustAttackTopDeck(): boolean {
    return this._mustAttackMonster.some(req => req.target === "topDeck");
  }
  
  /**
   * Returns true if attacking this element satisfies the requirement
   */
  canAttackThisEntity(elem: (Entity | "topDeck")): boolean {
    if(elem !== "topDeck" && !elem.attackable) return false;
    if (this._mustAttackMonster.length > 0)
    {
      // console.log("Attack requirements:", this._mustAttackMonster.map(req => req.target === "topDeck" ? req.target : req.target.card.slug));
      return this._mustAttackMonster.some(req => req.target === elem || (Array.isArray(req.target) && elem instanceof Monster && req.target.includes(elem))) || this._mustAttackMonster.every(req => req.target === "any"); // Must be in the list
    }
    if (this.attackThisTurn > 0)
    {
      // console.log("No attack requirements, any attack is valid.");
      return true; // If no requirement, any attack is valid as long as player has attacks left
    }
    // console.log("May attack only:" , this._mayAttackForFree.map(f => f.target === "topDeck" ? f.target : f.target.card.slug));
    return this.mayAttackForFree.some(free => free.target === elem && free.nb > 0); // Check if it's a free attack
  }
  
  /**
   * Remove a monster from the must-attack list (call after attacking it)
   */
  clearAttackRequirement(elem?: Entity | "topDeck" | "any"): void {
    
    if (!elem) {
      // Clear all requirements
      this._mustAttackMonster = [];
      return;
    }

    // Otherwise, remove the specific monster from the list
    const index = this._mustAttackMonster.findIndex(req => req.target === elem || (Array.isArray(req.target) && elem instanceof Monster && req.target.includes(elem)));
    if (index !== -1) {
      this._mustAttackMonster.splice(index, 1);
    }
  }

  /**
   * Remove must-attack requirements registered by a specific source card.
   * If `elem` is provided, only requirements matching that target are removed.
   */
  clearAttackRequirementsFromSource(source: Card, elem?: Entity | "topDeck" | "any"): void {
    this._mustAttackMonster = this._mustAttackMonster.filter((req) => {
      if (req.source !== source) {
        return true;
      }

      if (elem === undefined) {
        return false;
      }

      if (req.target === elem) {
        return false;
      }

      if (Array.isArray(req.target) && elem instanceof Monster && req.target.includes(elem)) {
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
  

  get canIUseLootOrActivateThisTurn(): boolean {
    return this._canIUseLootOrActivateThisTurn === 0;
  }

  addToCanIUseLootOrActivateThisTurn(valueToAdd: number) {
    this._canIUseLootOrActivateThisTurn += valueToAdd;
    if(this._canIUseLootOrActivateThisTurn < 0) {
      this._canIUseLootOrActivateThisTurn = 0;
    }
  }

  resetCanIUseLootOrActivateThisTurn() {
    this._canIUseLootOrActivateThisTurn = 0;
  }


  get isEngagedInPurchase(): boolean {
    return this._engagedInPurchase > 0;
  }

  purchaseEnded(){
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
    this.resetCanIUseLootOrActivateThisTurn();
    this._attackedIdsThisTurn = [];
    this._mustAttackMonster = [];
    this._mayAttackForFree = [];
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

  verifySecret(secret: string): boolean {
    return this.secret === secret;
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

export class DiceRoll extends StackElement {
  private _value: number;
  private _issuer: Player;
  private _effectIssuer: Entity | null = null;
  private _attackRoll;
  private _effect: EffectFunction[] | null = null;
  private _card: Card | null = null;
  private _targets: any[] = [];
  private _random: () => number;
  private _readyToResolve: boolean = false;

  constructor(random: () => number, issuer: Player, attackRoll: boolean = false, card: Card | null = null) {
    super();
    if(!attackRoll && !card) {
      throw new Error("Non-attack dice rolls must be associated with a card.");
    }
    this._random = random;
    this._issuer = issuer;
    this._attackRoll = attackRoll;
    this._card = card;
    this._value = this.roll();
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

  get card(): Card | null {
    return this._card;
  }

  get readyToResolve(): boolean {
    return this._readyToResolve;
  }

  set readyToResolve(value: boolean) {
    this._readyToResolve = value;
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
  override get json(): DiceRollJson {
    return { 
      type: "diceRoll",
      diceRoll: this.value, 
      issuer: this.issuer.json, 
      card: !this._attackRoll ? this._card!.jsonAPI : undefined, 
      targets: !this._attackRoll ? TargetBuilder.convertToSelectionItems(this._targets) : undefined,
      ...super.baseJson,
      modifier: (this._attackRoll ? this._issuer.attackDiceModifier : 0) + this._issuer.diceModifier,
    }
  }
  set value(v: number) {
    const prev = this._value;
    this._value = Math.max(1, Math.min(6, v));
    if (prev !== this._value)
      this.readyToResolve = false;
  }
  roll(): number {
    const old = this._value;
    this.value = Math.floor(this._random() * 6) + 1;
    return this._value;
  }
  /**
   * Modify the random function used for this dice roll (for testing purposes only)
   */
  _TEST_setRandom(random: () => number): void {
    this._random = random;
  }
  attachEffect(effect: EffectFunction[], card: Card, targets: any[]=[], effectIssuer: Entity | null = null): void {
    if(effect.length != 6)
      throw new Error("Effect must have 6 outcomes, one for each dice face.");
    this._effect = effect;
    this._card = card;
    this._targets = targets;
    this._effectIssuer = effectIssuer;
  }
  async onResolve(): Promise<void> {
    if(this.attackRoll)
      if(this._issuer.isDead || this._targets.length === 0 || this._targets[0].isDead)
        return; // No effect if attacker or target is dead
    this.value += (this._attackRoll ? this._issuer.attackDiceModifier : 0) + this._issuer.diceModifier;
    if (this._effect?.length === 6) {
      const effectIssuer = this._effectIssuer ?? this._issuer;
      // For attack rolls, prepend the dice roll itself to targets so effects can use it as the damage source
      const targetsWithDiceRoll = this._attackRoll ? [this, ...this._targets] : this._targets;
      await this._effect[this._value - 1]!(new EffectData(this._card!, effectIssuer, targetsWithDiceRoll));
    }
  }
}

export class DamageOnStack extends StackElement {

  from: Entity;
  receiver: Entity;
  damage: number[];
  _source: Card | DiceRoll;
  _targets: any[] = [];
  _effect: EffectFunction | null = null;
  game: Game;

  constructor(
    from: Entity,
    receiver: Entity,
    damage: number[],
    source: Card | DiceRoll,
    game: Game
  ) {
    super();
    this.receiver = receiver;
    this.from = from;
    this.damage = damage;
    this._source = source;
    this.game = game;
  }
  attachEffect(effect: EffectFunction, source: Card | DiceRoll, targets: any[] = []): void {
    this._effect = effect;
    this._source = source;
    this._targets = targets;
  }

  async onResolve(): Promise<void> {
    this.game.resolveDamage(this.from, this.receiver, this._source, this.damage[0]!);
    if(this._effect) {
      const card = this._source instanceof DiceRoll ? this._source.card! : this._source;
      if(this.from instanceof Player === false)
        throw new Error("Damage effect issuer is not a player");
      await this._effect(new EffectData(card, this.from, [this, this._targets]));
    }
  }
  override get json(): DamageOnStackJson {
    const sourceName = this._source instanceof DiceRoll ? this._source.json : this._source.jsonAPI;
    return {
      type: "damage",
      from: this.from.json, 
      receiver: this.receiver.json, 
      damage: this.damage[0]!, 
      source: sourceName,
      ...super.baseJson,
    };
  }
};

export class DeathOnStack extends StackElement {

  receiver: Entity;
  from: Entity;
  source: Card | DiceRoll; 
  game: Game;

  constructor(
    receiver: Entity,
    from: Entity,
    source: Card | DiceRoll,
    game: Game
  ) {
    super();
    this.receiver = receiver;
    this.from = from;
    this.source = source;
    this.game = game;
  }
  async onResolve(): Promise<void> {
    await this.game.resolveDeath(this.receiver, this.from, this.source);
  }

  override get json(): DeathOnStackJson {
    const sourceName = this.source instanceof DiceRoll ? this.source.json : this.source.jsonAPI;
    this.receiver.json;
    return {
      type: "death",
      receiver: this.receiver.json,
      from: this.from.json,
      source: sourceName,
      ...super.baseJson,
    };
  }
};