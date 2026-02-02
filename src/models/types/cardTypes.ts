import type { Player } from '../player';
import type { Entity } from '../entity';
import type { Card, LootCard, TreasureCard, EternalCard, CharacterCard, MonsterCard, BsoulCard } from '../cards';

/**
 * Type of effect execution - how the effect is triggered
 */
export type EffectType =
    | "passive"
    | "active"
    | "paid";

/**
 * Target selector for effects - specifies how to select targets for an effect
 */
export type TargetsSelector = {
    description: string;
    selector: (player: Player) => any[];
    count: number;
    asMany: boolean;
};

/**
 * Data passed to effect functions during execution
 */
export class EffectData {
    it: Card;
    issuer: Entity;
    private _targets: any[];
    private _nextIndex: number = 0;

    constructor(it: Card, issuer: Entity, targets: any[]) {
        this.it = it;
        this.issuer = issuer;
        this._targets = targets;
    }

    get targets(): any[] {
        return this._targets;
    }

    set targets(targets: any[]) {
        this._targets = targets;
        this._nextIndex = 0;
    }

    get next(): any {
        if (this._nextIndex >= this._targets.length) {
            return undefined;
        }
        return this._targets[this._nextIndex++];
    }
    
    peek(index: number = -1): any {
        if (index === -1)
            index = this._nextIndex;
        return this._targets[index];
    }
    
    get remaining(): any[] {
        return this._targets.slice(this._nextIndex);
    }

    addTarget(target: any): void {
        this._targets.push(target);
    }
}

/**
 * Function signature for effect execution
 */
export type EffectFunction = (data: EffectData) => boolean | Promise<boolean>;

/**
 * Collection of card sets indexed by card type
 */
export type CardSetsCollection = {
    loot: import('../cards').CardSet<LootCard>;
    treasure: import('../cards').CardSet<TreasureCard>;
    eternal: import('../cards').CardSet<EternalCard>;
    character: import('../cards').CardSet<CharacterCard>;
    monster: import('../cards').CardSet<MonsterCard>;
    bsoul: import('../cards').CardSet<BsoulCard>;
};

/**
 * Collection of decks indexed by card type
 */
export type DecksCollection = {
    loot: import('../cards').Deck<LootCard>;
    treasure: import('../cards').Deck<TreasureCard>;
    eternal: import('../cards').Deck<EternalCard>;
    character: import('../cards').Deck<CharacterCard>;
    monster: import('../cards').Deck<MonsterCard>;
    bsoul: import('../cards').Deck<BsoulCard>;
};

/**
 * Union type of all valid deck names
 */
export type DeckType = keyof DecksCollection;

/**
 * Maps deck types to their corresponding card types
 */
export type DeckTypeToCardType = {
    loot: LootCard;
    treasure: TreasureCard;
    eternal: EternalCard;
    character: CharacterCard;
    monster: MonsterCard;
    bsoul: BsoulCard;
};
