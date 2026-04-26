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
    readonly edenVariant: BooleanGameParameter;
    readonly miniDraft: BooleanGameParameter;
    readonly nbPennies: NumericGameParameter;
    readonly nb2Cents: NumericGameParameter;
    readonly nb3Cents: NumericGameParameter;
    readonly nb4Cents: NumericGameParameter;
    readonly nbNickels: NumericGameParameter;
    readonly nbItemsInShop: NumericGameParameter;
    readonly nbRooms: NumericGameParameter;
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
    readonly playWithBonusSouls: BooleanGameParameter;
    readonly playWithRooms: BooleanGameParameter;
    /** only cards with minimum player requirement satisfied in decks. */
    readonly nbPlayerCardRestriction: BooleanGameParameter;

    constructor(onChange: () => void) {
        this.edenVariant = new BooleanGameParameter(false, onChange);
        this.miniDraft = new BooleanGameParameter(false, onChange);
        this.nbPennies = new NumericGameParameter(0, 2, 9, onChange);
        this.nb2Cents = new NumericGameParameter(0, 6, 15, onChange);
        this.nb3Cents = new NumericGameParameter(0, 11, 19, onChange);
        this.nb4Cents = new NumericGameParameter(0, 11, 11, onChange);
        this.nbNickels = new NumericGameParameter(0, 6, 6, onChange);
        this.nbItemsInShop = new NumericGameParameter(0, 2, 6, onChange);
        this.nbRooms = new NumericGameParameter(1, 1, 1, onChange);
        this.nbEncounters = new NumericGameParameter(1, 2, 6, onChange);
        this.deathPenaltyCoins = new NumericGameParameter(0, 2, 20, onChange);
        this.deathPenaltyItem = new NumericGameParameter(0, 1, 10, onChange);
        this.deathPenaltyLoot = new NumericGameParameter(0, 1, 10, onChange);
        this.treasuresOnStart = new NumericGameParameter(0, 0, 10, onChange);
        this.lootOnStart = new NumericGameParameter(0, 3, 10, onChange);
        this.coinsOnStart = new NumericGameParameter(0, 3, 20, onChange);
        this.shopPrice = new NumericGameParameter(1, 10, 20, onChange);
        this.maxHandSize = new NumericGameParameter(1, 10, 100, onChange);
        this.allowCoinDonation = new BooleanGameParameter(true, onChange);
        this.lootPlayPerTurn = new NumericGameParameter(1, 1, 10, onChange);
        this.nbPlayerCardRestriction = new BooleanGameParameter(true, onChange);
        this.playWithBonusSouls = new BooleanGameParameter(true, onChange);
        this.playWithRooms = new BooleanGameParameter(true, onChange);
    }

    toJson(): GameParametersJson {
        return {
            edenVariant: {text: "Eden Variant", value: this.edenVariant.value},
            miniDraft: {text: "Mini-draft", value: this.miniDraft.value},//: At the start of the game, lay out (number of players + 1) treasure cards. Each player choose one of them and gain them, in turn order. Put the last card on the bottom of the treasure deck. Repeat this process with the order reversed.
            playWithBonusSouls: {text: "Play with bonus souls?", value: this.playWithBonusSouls.value}, // If player card restriction is on, there are 3 bonus souls in the pool at the start of the game, otherwise there are none.
            playWithRooms: {text: "Play with rooms?", value: this.playWithRooms?.value}, // If true, rooms are added to the game. Each player starts with 1 room in play, and one room is added to the shop. Players can play a card on a room to add it to the room, and gain its effect as long as it's in the room. When the room is removed from play, all cards in it are discarded.
            nbPennies: {text: "Number of pennies", value: this.nbPennies.value},
            nb2Cents: {text: "Number of 2-cents", value: this.nb2Cents.value},
            nb3Cents: {text: "Number of 3-cents", value: this.nb3Cents.value},
            nb4Cents: {text: "Number of 4-cents", value: this.nb4Cents.value},
            nbNickels: {text: "Number of nickels", value: this.nbNickels.value},
            nbItemsInShop: {text: "Number of items in the shop", value: this.nbItemsInShop.value},
            nbEncounters: {text: "Number of encounters", value: this.nbEncounters.value},
            nbRooms: {text: "Number of rooms", value: this.nbRooms.value},
            deathPenaltyCoins: {text: "Death penalty coins", value: this.deathPenaltyCoins.value},
            deathPenaltyItem: {text: "Death penalty item", value: this.deathPenaltyItem.value},
            deathPenaltyLoot: {text: "Death penalty loot", value: this.deathPenaltyLoot.value},
            treasuresOnStart: {text: "Treasures on start", value: this.treasuresOnStart.value},
            lootOnStart: {text: "Loot on start", value: this.lootOnStart.value},
            coinsOnStart: {text: "Coins on start", value: this.coinsOnStart.value},
            shopPrice: {text: "Shop price", value: this.shopPrice.value},
            maxHandSize: {text: "Max hand size", value: this.maxHandSize.value},
            allowCoinDonation: {text: "Allow coin donation", value: this.allowCoinDonation.value},
            lootPlayPerTurn: {text: "Loot play per turn", value: this.lootPlayPerTurn.value},
            nbPlayerCardRestriction: {text: "Number player card restriction", value: this.nbPlayerCardRestriction.value},
        };
    }

    reset() {
        this.edenVariant.reset();
        this.miniDraft.reset();
        this.nbPennies.reset();
        this.nb2Cents.reset();
        this.nb3Cents.reset();
        this.nb4Cents.reset();
        this.nbNickels.reset();
        this.nbItemsInShop.reset();
        this.nbEncounters.reset();
        this.nbRooms.reset();
        this.deathPenaltyCoins.reset();
        this.deathPenaltyItem.reset();
        this.deathPenaltyLoot.reset();
        this.treasuresOnStart.reset();
        this.lootOnStart.reset();
        this.coinsOnStart.reset();
        this.shopPrice.reset();
        this.playWithBonusSouls.reset();
        this.playWithRooms.reset();
        this.maxHandSize.reset();
        this.allowCoinDonation.reset();
        this.lootPlayPerTurn.reset();
        this.nbPlayerCardRestriction.reset();
    }
}