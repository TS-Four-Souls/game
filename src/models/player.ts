import { Entity } from "@/models/entity";
import { CharacterCard, Hand, InplayType, ItemCard, treasureCard, type Card, type EffectFunction } from "./cards";
import type { Game } from "./game";

export class Player extends Entity {
  /** This is the token the player uses to issue commands to the game
   * The player receives this token when they join the game
   */
  readonly secret: string;
  private _score: number; // Number of souls collected. Temporary. Will be replaeced by list of soul cards.
  private _coin: number;
  private _hand: Hand;
  private _inPlay: Card[];
  private _souls: Card[];
  private _remainingLootPlay: number;
  private _attackThisTurn: number = 0;
  private _attackRollThisTurn: number = 0;

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

  get coins(): number {
    return this._coin;
  }

  get hand(): Hand {
    return this._hand;
  }

  get souls(): Card[] {
    return this._souls;
  }

  get totalSouls(): number {
    let total = 0;
    for (const soul of this._souls) {
      total += soul.soul;
    }
    return total;
  }

  get remainingLootPlay(): number {
    return this._remainingLootPlay;
  }

  set remainingLootPlay(value: number) {
    this._remainingLootPlay = value;
  }

  get attackThisTurn(): number {
    return this._attackThisTurn;
  }
  
  set attackThisTurn(value: number) {
    this._attackThisTurn = value;
  }

  get attackRollThisTurn(): number {
    return this._attackRollThisTurn;
  }  
  set attackRollThisTurn(value: number) {
    this._attackRollThisTurn = value;
  }

  addAttackThisTurn(value: number): void {
    this._attackThisTurn += value;
  }

  addLootPlay(value: number): void {
    this._remainingLootPlay += value;
  }
////////// In play Methods /////////
  addInPlay(card: Card): void {
    this._inPlay.push(card);
  }
  get inPlay(): Card[] {
    return this._inPlay;
  }
  removeInPlay(card: Card): boolean {
    const index = this._inPlay.indexOf(card);
    return this.removeInPlayByIndex(index);
  }
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
  removeInPlayByIndex(index: number): boolean {
    const type = this._inPlay[index]?.type;
    if (index >= 0 && type !== "eternal" && type !== "character") {
      this._inPlay.splice(index, 1);
      return true;
    }
    return false;
  }

  setHand(hand: Hand): Hand {
    const previousHand = this._hand;
    this._hand = hand;
    return previousHand;
  }

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
  resetTurnFlags() : void {
    this._attackThisTurn = 0;
    this._attackRollThisTurn = 0;
  }
  addSoul(card: Card){
    if(card.soul < 1)
    {
      throw new Error("Cannot add a card with no soul as a soul card.");
    }
    this._souls.push(card);
  }
  removeSoul(card: Card): boolean {
    const idx = this._souls.indexOf(card);
    if (idx < 0 || idx >= this._souls.length) {
      return false;
    }
    this._souls.splice(idx, 1);
    return true;
  }
  activateItem(item: ItemCard, targets: any[] = []): boolean {
    const index = this._inPlay.indexOf(item);
    console.log("Activating item:", item.name, "at index", index);
    if (index === -1) {
      throw new Error("Item not in play.");
    }
    // if (item.inPlayType !== InplayType.CHARGED) {
    //   return false;
    // }
    if(item instanceof CharacterCard)
      (item as CharacterCard).onTapChara(targets);
    return true;
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
  substract(modifier: number): void {
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
  onResolve(): void {
    if (this._effect?.length === 6) {
      this._effect[this._value - 1]!({it: this._card!, issuer: this._issuer, targets: this._targets});
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

  onResolve(): void {
    this.game.resolveDamage(this.from, this.receiver, this._card, this.damage[0]!);
    if(this._effect) {
      this._effect({it: this._card, issuer: this.from as Player, targets: [this, this._targets]});
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

  onResolve(): void {
    this.game.resolveDeath(this.receiver, this.from, this.usingAbilityFrom);
  }

  get json(): string {
    return JSON.stringify({receiver: this.receiver.id, from: this.from.id, card: this.usingAbilityFrom.name});
  }
};