import type { DeckConfig, DeckConfigCard, GameParametersJson, DeckConfigPatch, SetGameParameterRequest } from "@/shared/api";
import { CARD_SETS } from "./game";
import type { DeckType, Card } from "./cards";
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

    reset(emitChange: boolean = true) {
        this._value = this._initialValue;
        if (emitChange) {
            this.onChange();
        }
    }

    static clamp(value: number, min: number, max: number): number {
        return Math.max(min, Math.min(max, value));
    }
}

class DeckParameter {
    private _type: DeckType;
    private _currentCount: number = 0;
    private _cards: {card: Card, param: NumericGameParameter}[] = [];
    private _minCardInDeck: number;
    private _maxCardInDeck: number;
    private _filter: (card: Card) => boolean;
    private _deckMode: "standard" | "custom";

    constructor(type: DeckType, minCardInDeck: number = 100, maxCardInDeck: number = 1000, private readonly onChange: () => void, private F: (card: Card) => boolean, deckMode: "standard" | "custom" = "standard") {
        this._type = type;
        this._currentCount = -1;
        this._filter = F;
        this._deckMode = deckMode;
        this._minCardInDeck = minCardInDeck;
        this._maxCardInDeck = maxCardInDeck;
        this.createParamForUniqueCards();
        this.resetCardCounts(false);
    }
    get count(): number {
        return this._currentCount;
    }

    get cardsParam() {
        return this._cards;
    }
    set filter(F: (card: Card) => boolean) {
        this._filter = F;
    }
    resetCardCounts(emitChange: boolean = true) {
        this._currentCount = 0;
        for (const card of this._cards) {
            if(this._filter(card.card)) {
                card.param.reset(false);
                this._currentCount += card.param.value;
            } else {
                card.param.value = 0;
            }
        }
        if (emitChange) {
            this.onChange();
        }
    }
    createParamForUniqueCards(): void {
        const uniqueCards: {card: Card, count: number}[] = [];
        this._currentCount = 0;
        for(const card of CARD_SETS[this._type].cards) {
            let existing = uniqueCards.find(c => c.card.isSameCard(card));
            if (!existing) {
                uniqueCards.push({card, count: 0});
                existing = uniqueCards[uniqueCards.length - 1]!;
            }
            this._currentCount++;
            existing.count++;
        }
        uniqueCards.forEach(c => {
            let count = c.count;
            switch(c.card.name) {
                case "A Penny!":
                    count = 2;
                    break;
                case "2 Cents!":
                    count = 6;
                    break;
                case "3 Cents!":
                    count = 11;
                    break;
                case "4 Cents!":
                    count = 11;
                    break;
                case "A Nickel!":
                    count = 6;
                    break;
                default:
                    break;
            }
            this._cards.push({card: c.card, param: new NumericGameParameter(0, count, 100, () => {})});
        });
    }

    /** Apply a deck configuration: set counts for provided cards and recompute total */
    applyDeckConfig(cards: DeckConfigCard[]) {
        for (const c of cards) {
            this.setCardParameter(c.slug, c.count, false);
        }
        this.onChange();
    }

    setCardParameter(slug: string, value: number, callOnChange: boolean = true) {
        const card = this._cards.find(x => x.card.slug === slug);
        if (card) {
            // set without using setCardParameter to avoid per-card total checks while applying
            const previousCount = card.param.value;
            if( this._currentCount - previousCount + value > this._maxCardInDeck) {
                const newValue = card.param.value + (this._maxCardInDeck - this._currentCount);
                card.param.value = newValue;
            }
            else if( this._currentCount - previousCount + value < this._minCardInDeck) {
                const newValue = card.param.value - (this._currentCount - this._minCardInDeck);
                card.param.value = newValue;
            }
            else
                card.param.value = value;
            this._currentCount += card.param.value - previousCount;
        } else
        {            
            throw new Error(`Card with slug ${slug} not found in deck ${this._type}`);
        }
        if (callOnChange) {
            this.onChange();
        }
    }

    reset(emitChange: boolean = true) {
        for (const card of this._cards) {
            card.param.reset(emitChange);
        }
        this._currentCount = CARD_SETS[this._type].cards.length;
    }

    get total(): number {
        return this._currentCount;
    }
    
    get type(): DeckType {
        return this._type;
    }

    json() {
        const result: DeckConfigCard[] = [];
        for (const card of this._cards) {
            result.push({slug: card.card.slug, name: card.card.name, count: card.param.value});
        }
        return result;
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

    reset(emitChange: boolean = true) {
        this._value = this._initialValue;
        if (emitChange) {
            this.onChange();
        }
    }
}

export class GameParameters {
    readonly miniDraft: BooleanGameParameter;
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
    readonly allowCheatOptions: BooleanGameParameter;
    readonly monster: DeckParameter;
    readonly treasure: DeckParameter;
    readonly loot: DeckParameter;
    readonly bsoul: DeckParameter;
    readonly room: DeckParameter;

    readonly _onChange: () => void;
    private _currentNbPlayers: number;
    readonly _getCurrentNbPlayers = () => this._currentNbPlayers

    private _deckMode: "standard" | "custom" = "standard";
    private _filter: (card: Card) => boolean = (card: Card) => {
        // In custom mode, don't filter at all
        if (this._deckMode === "custom") return true;
        // In standard mode with restriction OFF, show all cards
        if (!this.nbPlayerCardRestriction.value) return true;
        // In standard mode with restriction ON, only show cards meeting player minimum
        return card.minimumPlayers <= this._getCurrentNbPlayers();
    };

    constructor(onChange: () => void) {
        this._onChange = onChange;
        this._currentNbPlayers = 1;
        this.miniDraft = new BooleanGameParameter(false, onChange);
        this.nbPlayerCardRestriction = new BooleanGameParameter(true, onChange);
        this.monster = new DeckParameter("monster", 100, 1000, onChange, this._filter, this._deckMode);
        this.treasure = new DeckParameter("treasure", 100, 1000, onChange, this._filter, this._deckMode);
        this.loot = new DeckParameter("loot", 100, 1000, onChange, this._filter, this._deckMode);
        this.bsoul = new DeckParameter("bsoul", 3, 100, onChange, this._filter, this._deckMode);
        this.room = new DeckParameter("room", 10, 100, onChange, this._filter, this._deckMode);
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
        this.allowCheatOptions = new BooleanGameParameter(true, onChange);
        this.playWithBonusSouls = new BooleanGameParameter(true, onChange);
        this.playWithRooms = new BooleanGameParameter(true, onChange);
    }

    toJson(): GameParametersJson {
        const decks: DeckConfig = {
            useBonusSouls: {text: "Use bonus souls?", value: this.playWithBonusSouls.value},
            useRooms: {text: "Use rooms?", value: this.playWithRooms.value},
            ...(this._deckMode === "standard" ? {nbPlayerCardRestriction: {text: "Number player card restriction", value: this.nbPlayerCardRestriction.value}} : {}),
            monster: {total: this.monster.count, cards: this.monster.json()},
            treasure: {total: this.treasure.count, cards: this.treasure.json()},
            loot: {total: this.loot.count, cards: this.loot.json()},
            ...(this.playWithBonusSouls.value ? {bsoul: {total: this.bsoul.count, cards: this.bsoul.json()}} : {}),
            ...(this.playWithRooms.value ? {room: {total: this.room.count, cards: this.room.json()}} : {}),
        }
        return {
            miniDraft: {text: "Mini-draft", value: this.miniDraft.value},//: At the start of the game, lay out (number of players + 1) treasure cards. Each player choose one of them and gain them, in turn order. Put the last card on the bottom of the treasure deck. Repeat this process with the order reversed.
            allowCheatOptions: {text: "Allow cheat options", value: this.allowCheatOptions.value},
            nbItemsInShop: {text: "Number of items in the shop", value: this.nbItemsInShop.value},
            nbEncounters: {text: "Number of encounters", value: this.nbEncounters.value},
            // nbRooms: {text: "Number of rooms", value: this.nbRooms.value},
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
            decksConfig: decks,
        };
    }

    loadFromJson(json: SetGameParameterRequest | GameParametersJson) {
        for (const key in json) {
            if (!json.hasOwnProperty(key)) continue;
            if (key === "decksConfig") {
                const decks = (json as any).decksConfig as DeckConfig;
                // Apply deck card counts first, then update top-level flags that may trigger
                // card removals/restore (nbPlayerCardRestriction). This prevents a config
                // that contains both the flags and the full card list from re-adding
                // cards immediately after they were removed by the restriction handler.
                if (decks.monster) {
                    this.monster.applyDeckConfig(decks.monster.cards);
                }
                if (decks.treasure) {
                    this.treasure.applyDeckConfig(decks.treasure.cards);
                }
                if (decks.loot) {
                    this.loot.applyDeckConfig(decks.loot.cards);
                }
                if (decks.bsoul) {
                    this.bsoul.applyDeckConfig(decks.bsoul.cards);
                }
                if (decks.room) {
                    this.room.applyDeckConfig(decks.room.cards);
                }

                if (decks.useBonusSouls) {
                    this.playWithBonusSouls.value = decks.useBonusSouls.value;
                }
                if (decks.useRooms) {
                    this.playWithRooms.value = decks.useRooms.value;
                }
                if (decks.nbPlayerCardRestriction) {
                    this.nbPlayerCardRestriction.value = decks.nbPlayerCardRestriction.value;
                }
                continue;
            }
            if (this.hasOwnProperty(key)) {
                const param = (this as any)[key] as NumericGameParameter | BooleanGameParameter;
                if (param && typeof (json as any)[key].value !== "undefined") {
                    param.value = (json as any)[key].value;
                }
            }
        }
    }

    /** Set a single parameter by key without full serialization/deserialization cycle
     * Avoids the overhead of serializing all parameters when only changing one */
    setParameterByKey(key: string, value: any) {
        if (key === "decksConfig") {
            // Special handling for complex deck configuration
            const decks = value as DeckConfigPatch;
            
            // Apply provided deck card counts first so that top-level flags (like
            // nbPlayerCardRestriction) that may remove/restore cards are applied
            // afterwards and take precedence.
            if(decks.monster || decks.treasure || decks.loot || decks.bsoul || decks.room) {
                // If specific cards were provided, we assume the config is custom and switch to custom mode to avoid overwriting counts with standard config when toggling flags.
                this._deckMode = "custom";
            }
            if (decks.monster) this.monster.applyDeckConfig([decks.monster]);
            if (decks.treasure) this.treasure.applyDeckConfig([decks.treasure]);
            if (decks.loot) this.loot.applyDeckConfig([decks.loot]);
            if (decks.bsoul) this.bsoul.applyDeckConfig([decks.bsoul]);
            if (decks.room) this.room.applyDeckConfig([decks.room]);
            if (decks.useBonusSouls?.value !== undefined) {
                this.playWithBonusSouls.value = decks.useBonusSouls.value;
            }
            if (decks.useRooms?.value !== undefined) {
                this.playWithRooms.value = decks.useRooms.value;
            }
            if (decks.nbPlayerCardRestriction?.value !== undefined) {
                this.nbPlayerCardRestriction.value = decks.nbPlayerCardRestriction.value;
                this._deckMode = "standard"; // Switch back to standard mode when player card restriction is toggled, as it's the only flag that affects card counts in standard mode
                for (const deck of [this.monster, this.treasure, this.loot, this.bsoul, this.room]) {
                    deck.filter = this._filter;
                    deck.resetCardCounts(false);
                }
                this._onChange();
            }
            return;
        }

        // Handle scalar parameters (numeric or boolean)
        if (this.hasOwnProperty(key)) {
            const param = (this as any)[key] as NumericGameParameter | BooleanGameParameter;
            if (param && param instanceof NumericGameParameter) {
                param.value = value;
            } else if (param && param instanceof BooleanGameParameter) {
                param.value = value;
            }
        }
    }

    reset(emitChange: boolean = true) {
        for (const key in this) {
            if (!this.hasOwnProperty(key)) continue;
            const val = (this as any)[key];
            if (val instanceof NumericGameParameter || val instanceof BooleanGameParameter || val instanceof DeckParameter) {
                val.reset(false);
            }
        }
        this._deckMode = "standard";
        if(emitChange) 
            this._onChange();
    }

    playerJoined() {
        this._currentNbPlayers++;
        if (this.nbPlayerCardRestriction.value && this._deckMode === "standard") {
            for (const deck of [this.monster, this.treasure, this.loot, this.bsoul, this.room]) {
                deck.filter = this._filter;
                deck.resetCardCounts(false);
            }
            this._onChange();
        }
    }
    playerLeft() {
        this._currentNbPlayers = Math.max(1, this._currentNbPlayers - 1);
        if (this.nbPlayerCardRestriction.value && this._deckMode === "standard") {
            for (const deck of [this.monster, this.treasure, this.loot, this.bsoul, this.room]) {
                deck.filter = this._filter;
                deck.resetCardCounts(false);
            }
            this._onChange();
        }
    }
}