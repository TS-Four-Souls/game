export abstract class Entity {
  private _currentHealthPoints: number;

  constructor(
    readonly id: string,
    readonly attackPoints: number,
    readonly healthPoints: number
  ) {
    this.id = id;
    this._currentHealthPoints = healthPoints;
  }

  receiveDamage(damage: number): void {
    this._currentHealthPoints -= damage;
    if (this._currentHealthPoints <= 0) {
      this._currentHealthPoints = 0;
    }
  }

  heal(): void {
    this._currentHealthPoints = this.healthPoints;
  }

  get isDead(): boolean {
    return this._currentHealthPoints <= 0;
  }

  get currentHealthPoints(): number {
    return this._currentHealthPoints;
  }
}
