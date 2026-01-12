import type { Card } from "./cards";
import type { DamageOnStack, DiceRoll } from "./player";

type DamageObj = {
  dealer: Entity | null;
  with: Card | DiceRoll | null;
  damage: number;
};

export abstract class Entity {
  private _currentHealthPoints: number;
  // Either attacking or being attacked.
  private _engagedInCombat: number;
  private _attackDiceModifier: number = 0;
  private _damageTakenThisTurn: DamageObj[] = [];
  private _died: boolean = false;

  constructor(
    readonly id: string,
    private _attackPoints: number,
    readonly healthPoints: number
  ) {
    this.id = id;
    this._currentHealthPoints = healthPoints;
    this._engagedInCombat = 0;
  }

  receiveDamage(damage: number, dealer: Entity | null = null, abilityCard: Card | DiceRoll | null = null): boolean {
    if(damage <= 0) return true;
    this._damageTakenThisTurn.push({dealer: dealer!, with: abilityCard!, damage: damage});
    this._currentHealthPoints -= damage;
    if (this._currentHealthPoints < 0) {
      this._currentHealthPoints = 0;
      this._died = true;
      return false;
    }
    return true;
  }

  resetEntityFlags(): void {
    this._engagedInCombat = 0;
    this._damageTakenThisTurn = [];
    this._died = false;

  }

  get damageTakenThisTurn(): DamageObj[] {
    return this._damageTakenThisTurn;
  }

  get isEngagedInCombat(): boolean {
    return this._engagedInCombat > 0;
  }

  combatEnded(){
    this._engagedInCombat -= 1;
  }

  engageInCombat(): void {
    this._engagedInCombat += 1;
  }

  heal(amount:number|"full" = "full"): void {
    if(amount === "full")
      this._currentHealthPoints = this.healthPoints;
    else
      this._currentHealthPoints = Math.min(this._currentHealthPoints + amount, this.healthPoints);
  }

  die(): void {
    this._currentHealthPoints = 0;
    this._died = true;
  }
  
  get isDead(): boolean {
    if( this._currentHealthPoints <= 0 )
      this.die();
    return this._died;
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

  addAttackDiceModifier(amount: number): void {
    this._attackDiceModifier += amount;
  }

  get attackPoints(): number {
    return this._attackPoints;
  }

  get attackDiceModifier(): number {
    return this._attackDiceModifier;
  }
}
