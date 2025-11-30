import { Entity } from "@/models/entity";

export class Player extends Entity {
  /** This is the token the player uses to issue commands to the game
   * The player receives this token when they join the game
   */
  readonly secret: string;
  private _score: number;

  constructor(id: string, attackPoints: number, healthPoints: number) {
    super(id, attackPoints, healthPoints);
    this._score = 0;
    this.secret = crypto.randomUUID();
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
