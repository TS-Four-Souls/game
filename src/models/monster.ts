import { Entity } from "@/models/entity";

export class Monster extends Entity {
  constructor(
    id: string,
    attackPoints: number,
    healthPoints: number,
    readonly evasionPoints: number,
    readonly rewardPoints: number
  ) {
    super(id, attackPoints, healthPoints);
  }
}
