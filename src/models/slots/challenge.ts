import type { Deck, MonsterCard } from "../cards";
import type { Game } from "../game";
import { Encounters } from "./encounters";

export class Challenge extends Encounters {

    private _nbFinalBossSlots: number = 1;
    private _nbMinionsSlots: number = 0;
    // Here, every cards in a slot is accessible.
    constructor(deck: Deck<MonsterCard>, game: Game) {
        super(2, deck, game);
    }
    /**
     * fill empty slot does nothing by default.
     */
    override fillEmptySpots(eventsBottom?: boolean): void {
    }
}