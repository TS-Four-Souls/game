import { Entity } from "@/models/entity";

export class Player extends Entity {
  /** This is the token the player uses to issue commands to the game
   * The player receives this token when they join the game
   */
  readonly secret: string;
  private _score: number;
  private _coin: number;

  constructor(id: string, attackPoints: number, healthPoints: number, coins: number) {
    super(id, attackPoints, healthPoints);
    this._score = 0;
    this._coin = coins;
    this.secret = crypto.randomUUID();
  }

  getCoins(): number {
    return this._coin;
  }
  addCoins(coins: number): void {
    this._coin += coins;
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
