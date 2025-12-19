import { Entity } from "@/models/entity";
import type { MonsterCard } from "./cards";
import type { Encounters } from "./slots";

// export class Monster extends Entity {
//   constructor(
//     id: string,
//     attackPoints: number,
//     healthPoints: number,
//     readonly evasionPoints: numb er,
//     readonly rewardPoints: number
//   ) {
//     super(id, attackPoints, healthPoints);
//   }
// }

export class Monster extends Entity {
  private _evasion: number;
  private _card: MonsterCard;
  private _encounters: Encounters;
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
  get card(): MonsterCard {
    return this._card;
  }
  get evasion(): number {
    return this._evasion + this._encounters.dcModifier;
  }
}
