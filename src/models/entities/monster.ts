import { Entity } from "@/models/entities/entity";
import type { EntityType } from "@/shared/api";
import type { MonsterCard } from "../cards";
import type { Encounters } from "../slots/encounters";

/**
 * Represents a monster entity in the Four Souls game.
 * 
 * A Monster is an Entity created from a MonsterCard when it enters play.
 * Monsters have evasion values that determine the dice roll needed to successfully attack them.
 * The evasion value can be modified by the Encounters manager (e.g., for curses affecting all monsters).
 * 
 * @extends Entity
 * 
 * @example
 * ```typescript
 * const monsterCard = game.obtainCard("b2-fly") as MonsterCard;
 * const monster = new Monster(monsterCard, encounters);
 * console.log(monster.evasion); // Base evasion + encounter DC modifier
 * ```
 */
export class Monster extends Entity {
  
  /** @private The monster card this entity represents */
  private _card: MonsterCard;
  
  /** @private Reference to the encounters manager for DC modifiers */
  private _encounters: Encounters;
  
  /**
   * Creates a new Monster entity from a monster card.
   * 
   * @param card - The monster card this entity represents
   * @param encouters - The encounters manager (provides DC modifiers)
   */
  constructor(card: MonsterCard, encouters: Encounters) {
    super(
      card.slug,
      card.attackPoints,
      card.healthPoints
    );
    // Note: owner is not always its entity.
    card.owner = this;
    card.entity = this; // Link the entity to the card 
    this._card = card;
    super.evasion = card.evasion;
    this._encounters = encouters;
  }
  
  /**
   * Gets the monster card associated with this entity.
   * @returns The MonsterCard instance
   */
  override get card(): MonsterCard {
    return this._card;
  }

  override get attackPoints(): number {
    return super.attackPoints + this._encounters.attackModifier;
  }
  
  get name(): string {
    return this._card.name;
  }

  get rewards() {
    return this._card.rewards;
  }

  /**
   * Gets the effective evasion value for this monster.
   * This includes the base evasion plus any DC modifiers from the encounters manager.
   * @returns The total evasion value that must be rolled to successfully attack
   */
  override get evasion(): number {
    return Math.max(0, Math.min(super.evasion + this._encounters.dcModifier, 6)); // Evasion must be between 0 and 6
  }

  addEvasion(amount: number): void {
    super.evasion += amount;
  }

  get json(): EntityType {
    return {
      type: "monster",
      name: this.name,
      color: this.color,
      slug: this.card.slug,
      globalId: this.card.globalId,
    }
  }
}
