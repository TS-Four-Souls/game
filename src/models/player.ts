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
  
  addInPlay(card: Card): void {
    this._inPlay.push(card);
  }
  get inPlay(): Card[] {
    return this._inPlay;
  }
  discardInPlay(index: number): boolean {
    const type = this._inPlay[index]?.type;
    if (index >= 0 && type !== "eternal" && type !== "character"
    ) {
      this._inPlay.splice(index, 1);
      return true;
    }
    return false;
  }

  addSoul(card: Card){
    if(card.soul < 0)
    {
      throw new Error("Cannot add a card with no soul as a soul card.");
    }
    this._souls.push(card);
  }
  removeSoul(idx:number): Card{
    if(idx <= 0 || idx >= this._souls.length){
      throw new Error(`Incorrect soul card idx ${idx} while number of souls is ${this._souls.length}.`);
    }
    return this._souls.splice(idx, 1)[0]!;
  }
  addCoins(coins: number): void {
    this._coin += coins;
  }

  rollDice(): number {
    return Math.floor(Math.random() * 6) + 1;
  }

  /* This methods tries to remove n coins to the player and return true if it does.
  * if the player have less than n coins and asMany is true, all his coins are removed.
  * */
  loseCoins(coins: number, asMany: boolean): boolean {
    if (this._coin >= coins) {
      this._coin -= coins;
      return true;
    }
    else if(asMany) {
      this._coin = 0;
    }
    return false;
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
