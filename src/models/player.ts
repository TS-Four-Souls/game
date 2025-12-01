import { Entity } from "@/models/entity";
import { Hand, type Card } from "./cards";

export class Player extends Entity {
  /** This is the token the player uses to issue commands to the game
   * The player receives this token when they join the game
   */
  readonly secret: string;
  private _score: number;
  private _coin: number;
  private _hand: Hand;
  private _inPlay: Card[];

  constructor(id: string, attackPoints: number, healthPoints: number, coins: number) {
    super(id, attackPoints, healthPoints);
    this._score = 0;
    this._coin = coins;
    this._hand = new Hand();
    this.secret = crypto.randomUUID();
    this._inPlay = [];
  }

  getCoins(): number {
    return this._coin;
  }

  hand(): Hand {
    return this._hand;
  }
  addInPlay(card: Card): void {
    this._inPlay.push(card);
  }
  getInPlay(): Card[] {
    return this._inPlay;
  }
  discardInPlay(cardId: number): boolean {
    const index = this._inPlay.findIndex((card) => card.getId() === cardId);
    if (index !== -1 && this._inPlay[index]?._json.type !== "eternal") {
      this._inPlay.splice(index, 1);
      return true;
    }
    return false;
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
