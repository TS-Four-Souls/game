import type { entityType, temporaryEffect } from "@/shared/api";
import type { Card } from "./cards";
import { Player, type DamageOnStack, type DiceRoll } from "./player";
import { Monster } from "./monster";

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
  private _attackable: boolean = true;
  private _temporaryEffects: temporaryEffect[] = [];

  get attackable(): boolean {
    return this._attackable;
  }

  set attackable(value: boolean) {
    this._attackable = value;
  }

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
    this._engagedInCombat = Math.max(0, this._engagedInCombat - 1);
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
  /** An entity if it has been marked as dead. 
   * Note that an entity may have 0 health points but not be dead if their death has not been resolved.
  */
  get isDead(): boolean {
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
    if (this._attackPoints + amount < 0) {
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

  addTemporaryEffect(effect: temporaryEffect): void {
    // Add temporary effect to the list
    this._temporaryEffects.push(effect) ;
  }

  removeTemporaryEffect(effect: temporaryEffect): void {
    const index = this._temporaryEffects.indexOf(effect);
    if (index !== -1) {
      this._temporaryEffects.splice(index, 1);
    }
  }

  get temporaryEffects(): temporaryEffect[] {
    return this._temporaryEffects;
  }
  entityTypeFromEntity(): entityType {
    if(this instanceof Player) {
      return {
        type: "player",
        name: this.id,
        slug: this.inPlay[0]!.slug
      }
    }
    if(this instanceof Monster){
      return {
        type: "monster",
        name: this.name,
        slug: this.card.slug
      }
    }
    throw new Error("Unknown entity type");
  }
}