import type { Player } from '../player';
import type { Entity } from '../entity';
import type { Card, LootCard, TreasureCard, EternalCard, CharacterCard, MonsterCard, BsoulCard, RoomCard } from '../cards';
import type { Game } from '../game';

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
    min: number;
    max: number;
};

/**
 * Data passed to effect functions during execution
 */
export class EffectData {
    it: Card;
    private _issuerProvider: () => Entity;
    private _targets: any[];
    private _selectedOnResolve: any[] = [];
    private _nextIndex: number = 0;

    constructor(it: Card, issuerProvider: () => Entity, targets: any[]) {
        this.it = it;
        this._issuerProvider = issuerProvider;
        this._targets = targets;
    }

    get issuer(): Entity {
        return this._issuerProvider();
    }

    set issuerProvider(issuerProvider: () => Entity) {
        this._issuerProvider = issuerProvider;
    }

    get issuerProvider(): () => Entity {
        return this._issuerProvider;
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

    get selectedOnResolve(): any[] {
        return [...this._selectedOnResolve];
    }

    recordSelection(selection: any[]): void {
        this._selectedOnResolve.push(...selection);
    }

    clearSelectionRecord(): void {
        this._selectedOnResolve = [];
    }

    async selectAndRecord<T>(
        game: Game,
        player: Player,
        min: number,
        max: number,
        options: T[],
        description: string = "UNDEFINED SHOULD NOT HAPPEN",
        skippable: boolean = true,
        record: boolean = true,
        canUseOnBoardSelection: boolean = true
    ): Promise<{ selected: T[]; remaining: T[] }> {
        const selection = await game.select(player, min, max, options, description, skippable, canUseOnBoardSelection);
        if (record) {
            this.recordSelection(selection.selected as any[]);
        }
        return selection;
    }

    async selectMultipleAndRecord<T>(
        game: Game,
        selections: Array<{
            player: Player;
            min: number;
            max: number;
            options: T[];
            description: string;
            canUseOnBoardSelection: boolean;
        }>
    ): Promise<Array<{ playerId: string; selected: T[]; remaining: T[] }>> {
        const results = await game.selectMultiple(selections);
        for (const result of results) {
            this.recordSelection(result.selected as any[]);
        }
        return results;
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
    room: import('../cards').CardSet<RoomCard>;
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
    room: import('../cards').Deck<RoomCard>;
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
    room: RoomCard;
};
