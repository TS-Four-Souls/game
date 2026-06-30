import type { EntityType } from "@/shared/api";
import type { CardRewards } from "@/types/cardTypes";
import type { Card } from "../cards";
import { Entity } from "./entity";
import { translationKeyFromCardSlug } from "@/utils/translation";

/**
 * Animated entities are entities are entities that are neither players nor monsters.
 * They are cards that have entities, such as the revenant (eternal item), the puching ball (treasure card), or gus (room card).
 */
export class Animated extends Entity {
  private _card: Card;
  private _reward: CardRewards | undefined = undefined;
  constructor(card: Card, id: string, attackPoints: number, healthPoints: number, evasion: number) {
    super(id, attackPoints, healthPoints);
    super.evasion = evasion;
    this._card = card;
    this._reward = card.json.rewards;
  }

  get rewards(): CardRewards | undefined {
    return this._reward;
  }

  override get json(): EntityType {
    return {
      nameKey: this._card.nameKey,
      slug: this._card.slug,
      globalId: this._card.globalId,
      color: this.color,
      type: "animated",
    };
  }
    
  override get card(): Card {
    return this._card;
  }
    
}

export class AnimatedList {
    private _animated: Animated[] = [];

    add(animated: Animated): void {
        this._animated.push(animated);
    }
    remove(animated: Animated): void {
        const index = this._animated.indexOf(animated);
        if (index >= 0) {
            this._animated.splice(index, 1);
        }
    }
    get all(): Animated[] {
        return this._animated;
    }

    reset(): void {
        this._animated.forEach(animated => animated.card.cleanup());
        this._animated = [];
    }
}
