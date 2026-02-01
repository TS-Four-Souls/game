import type { GameParametersJson } from "@/shared/api";

class NumericGameParameter {
    private _value: number;
    private _min: number;
    private _max: number;
    private _initialValue: number;

    constructor(min: number, value: number, max: number, private readonly onChange: () => void) {
        this._value = value;
        this._min = min;
        this._max = max;
        this._initialValue = value;
    }

    get value(): number {
        return this._value;
    }

    get min(): number {
        return this._min;
    }

    get max(): number {
        return this._max;
    }

    set value(value: number) {
        this._value = NumericGameParameter.clamp(value, this._min, this._max);
        this.onChange();
    }

    reset() {
        this.value = this._initialValue;
    }

    static clamp(value: number, min: number, max: number): number {
        return Math.max(min, Math.min(max, value));
    }
}

class BooleanGameParameter {
    private _value: boolean;
    private _initialValue: boolean;

    constructor(value: boolean, private readonly onChange: () => void) {
        this._value = value;
        this._initialValue = value;
    }

    set value(value: boolean) {
        this._value = value;
        this.onChange();
    }

    get value(): boolean {
        return this._value;
    }

    reset() {
        this.value = this._initialValue;
    }
}

export class GameParameters {
    readonly nbItemsInShop: NumericGameParameter;
    readonly nbEncounters: NumericGameParameter;
    readonly deathPenaltyCoins: NumericGameParameter;
    readonly deathPenaltyItem: NumericGameParameter;
    readonly deathPenaltyLoot: NumericGameParameter;
    readonly treasuresOnStart: NumericGameParameter;
    readonly lootOnStart: NumericGameParameter;
    readonly coinsOnStart: NumericGameParameter;
    readonly shopPrice: NumericGameParameter;
    readonly lootPlayPerTurn: NumericGameParameter;
    readonly maxHandSize: NumericGameParameter;
    readonly allowCoinDonation: BooleanGameParameter;
    /** only cards with minimum player requirement satisfied in decks. */
    readonly nbPlayerCardRestriction: BooleanGameParameter;

    constructor(onChange: () => void) {
        this.nbItemsInShop = new NumericGameParameter(0, 2, 6, onChange);
        this.nbEncounters = new NumericGameParameter(1, 2, 6, onChange);
        this.deathPenaltyCoins = new NumericGameParameter(0, 2, 20, onChange);
        this.deathPenaltyItem = new NumericGameParameter(0, 1, 10, onChange);
        this.deathPenaltyLoot = new NumericGameParameter(0, 1, 10, onChange);
        this.treasuresOnStart = new NumericGameParameter(0, 0, 10, onChange);
        this.lootOnStart = new NumericGameParameter(0, 3, 10, onChange);
        this.coinsOnStart = new NumericGameParameter(0, 3, 20, onChange);
        this.shopPrice = new NumericGameParameter(1, 10, 20, onChange);
        this.maxHandSize = new NumericGameParameter(1, 10, 100, onChange);
        this.allowCoinDonation = new BooleanGameParameter(false, onChange);
        this.lootPlayPerTurn = new NumericGameParameter(1, 1, 10, onChange);
        this.nbPlayerCardRestriction = new BooleanGameParameter(true, onChange);
    }

    toJson(): GameParametersJson {
        return {
            nbItemsInShop: this.nbItemsInShop.value,
            nbEncounters: this.nbEncounters.value,
            deathPenaltyCoins: this.deathPenaltyCoins.value,
            deathPenaltyItem: this.deathPenaltyItem.value,
            deathPenaltyLoot: this.deathPenaltyLoot.value,
            treasuresOnStart: this.treasuresOnStart.value,
            lootOnStart: this.lootOnStart.value,
            coinsOnStart: this.coinsOnStart.value,
            shopPrice: this.shopPrice.value,
            maxHandSize: this.maxHandSize.value,
            allowCoinDonation: this.allowCoinDonation.value,
            lootPlayPerTurn: this.lootPlayPerTurn.value,
            nbPlayerCardRestriction: this.nbPlayerCardRestriction.value,
        };
    }

    reset() {
        this.nbItemsInShop.reset();
        this.nbEncounters.reset();
        this.deathPenaltyCoins.reset();
        this.deathPenaltyItem.reset();
        this.deathPenaltyLoot.reset();
        this.treasuresOnStart.reset();
        this.lootOnStart.reset();
        this.coinsOnStart.reset();
        this.shopPrice.reset();
        this.nbPlayerCardRestriction.reset();
    }
}