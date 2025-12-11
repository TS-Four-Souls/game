export abstract class Entity {
  private _currentHealthPoints: number;
  // Either attacking or being attacked.
  private _engagedInCombat: number;
  private _attackDiceModifier: number = 0;

  constructor(
    readonly id: string,
    private _attackPoints: number,
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

  addHealthPoints(amount: number): void {
    this._currentHealthPoints += amount;
  if (amount < 0 && this._currentHealthPoints < this.healthPoints) {
      this._currentHealthPoints = this.healthPoints;
    }
  }
  
  addAttackPoints(amount: number): void {
    // Attack points cannot be negative.
    if (this._attackPoints + amount < 1) {
      throw new Error("Attack points cannot be negative.");
    }
    this._attackPoints += amount;
  }

  addDiceModifier(amount: number): void {
    this._attackDiceModifier += amount;
  }

  get attackPoints(): number {
    return this._attackPoints;
  }

  get attackDiceModifier(): number {
    return this._attackDiceModifier;
  }
}
