import type { GameParametersJson } from "@/shared/api";

class NumericGameParameter {
    private _value: number;
    private _min: number;
    private _max: number;
    private _initialValue: number;

    constructor(min: number, value: number, max: number) {
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
    }

    reset() {
        this._value = this._initialValue;
    }

    static clamp(value: number, min: number, max: number): number {
        return Math.max(min, Math.min(max, value));
    }
}

class BooleanGameParameter {
    value: boolean;
    private _initialValue: boolean;

    constructor(value: boolean) {
        this.value = value;
        this._initialValue = value;
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
  /** only cards with minimum player requirement satisfied in decks. */
  readonly nbPlayerCardRestriction: BooleanGameParameter;

  constructor() {
    this.nbItemsInShop = new NumericGameParameter(0, 2, 6);
    this.nbEncounters = new NumericGameParameter(1, 2, 6);
    this.deathPenaltyCoins = new NumericGameParameter(0, 2, 20);
    this.deathPenaltyItem = new NumericGameParameter(0, 1, 10);
    this.deathPenaltyLoot = new NumericGameParameter(0, 1, 10);
    this.treasuresOnStart = new NumericGameParameter(0, 0, 10);
    this.lootOnStart = new NumericGameParameter(0, 3, 10);
    this.coinsOnStart = new NumericGameParameter(0, 3, 20);
    this.shopPrice = new NumericGameParameter(1, 10, 20);
    this.nbPlayerCardRestriction = new BooleanGameParameter(true);
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