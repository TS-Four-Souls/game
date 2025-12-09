export abstract class Entity {
  private _currentHealthPoints: number;
  // Either attacking or being attacked.
  private _engagedInCombat: number;

  constructor(
    readonly id: string,
    readonly attackPoints: number,
    readonly healthPoints: number
  ) {
    this.id = id;
    this._currentHealthPoints = healthPoints;
    this._engagedInCombat = 0;
  }

  receiveDamage(damage: number): void {
    this._currentHealthPoints -= damage;
    if (this._currentHealthPoints <= 0) {
      this._currentHealthPoints = 0;
    }
  }

  get isEngagedInCombat(): boolean {
    return this._engagedInCombat > 0;
  }

  engageInCombat(): void {
    this._engagedInCombat += 1;
  }

  heal(): void {
    this._currentHealthPoints = this.healthPoints;
  }

  die(): void {
    this._currentHealthPoints = 0;
  }
  
  get isDead(): boolean {
    return this._currentHealthPoints <= 0;
  }

  get currentHealthPoints(): number {
    return this._currentHealthPoints;
  }
}
