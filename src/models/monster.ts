import { Entity } from "@/models/entity";
import type { MonsterCard } from "./cards";
import type { Encounters } from "./slots";

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
  /** @private The evasion value from the monster card */
  private _evasion: number;
  
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
    this._card = card;
    this._evasion = card.evasion;
    this._encounters = encouters;
  }
  
  /**
   * Gets the monster card associated with this entity.
   * @returns The MonsterCard instance
   */
  get card(): MonsterCard {
    return this._card;
  }
  
  /**
   * Gets the effective evasion value for this monster.
   * This includes the base evasion plus any DC modifiers from the encounters manager.
   * @returns The total evasion value that must be rolled to successfully attack
   */
  get evasion(): number {
    return this._evasion + this._encounters.dcModifier;
  }
}
