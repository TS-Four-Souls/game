import { Entity } from "@/models/entity";
import { Hand, type Card } from "./cards";

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

  constructor(id: string, attackPoints: number, healthPoints: number, coins: number) {
    super(id, attackPoints, healthPoints);
    this._score = 0;
    this._coin = coins;
    this._hand = new Hand();
    this.secret = crypto.randomUUID();
    this._inPlay = [];
    this._souls = [];
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
  removeInPlayByIndex(index: number): boolean {
    const type = this._inPlay[index]?.type;
    if (index >= 0 && type !== "eternal" && type !== "character"
    ) {
      this._inPlay.splice(index, 1);
      return true;
    }
    return false;
  }

  removeCard(target: Card): boolean {
    this._inPlay.forEach((card, index) => {
      if (card === target) {
        this._inPlay.splice(index, 1);
        return true;
      }
    });
    this._hand.cards.forEach((card, index) => {
      if (card === target) {
        this._hand.cards.splice(index, 1);
        return true;
      }
    });
    return false;
  }

  addSoul(card: Card){
    if(card.soul < 0)
    {
      throw new Error("Cannot add a card with no soul as a soul card.");
    }
    this._souls.push(card);
  }
  removeSoul(card: Card): boolean{
    const idx = this._souls.indexOf(card);
    if(idx < 0 || idx >= this._souls.length){
      return false;
    }
    return true;
  }
  gainCoins(coins: number): void {
    this._coin += coins;
  }

  rollDice(): DiceRoll {
    return new DiceRoll(this);
  }

  
  die(): void { }
  /* This methods tries to remove n coins to the player and return true if it does.
  * if the player have less than n coins and asMany is true, all his coins are removed.
  * */
  loseCoins(coins: number, asMany: boolean): number {
    if (this._coin >= coins) {
      this._coin -= coins;
      return coins;
    }
    else if(asMany) {
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

  constructor(issuer: Player) {
    this._value = Math.floor(Math.random() * 6) + 1;
    this._issuer = issuer;
  }
  get issuer(): Player {
    return this._issuer;
  }
  get value(): number {
    return this._value;
  }
  get json(): DiceRollJSON {
    return {"diceRoll" : this.value, "issuer": this.issuer.id};
  }
  set value(v: number) {
    if (v < 1 || v > 6) {
      throw new Error("Dice value must be between 1 and 6.");
    }
    this._value = v;
  }
  roll(): number {
    this._value = Math.floor(Math.random() * 6) + 1;
    return this._value;
  }
  onResolve(): number {
    return this.value;
  }
}
