import { GameParameters } from "../gameParameters";

export class DeathPenaltyValues
{ 
    public nbCoinsToLose: number;
    public nbItemsToLose: number;
    public nbLootCardsToLose: number;
    /** False when an effect replaces the whole death penalty (e.g. Ball of Tumors): nothing is lost and nothing is deactivated. */
    public paysPenalty: boolean = true;

    constructor(params: GameParameters) {
        this.nbCoinsToLose = params.deathPenaltyCoins.value;
        this.nbItemsToLose = params.deathPenaltyItem.value;
        this.nbLootCardsToLose = params.deathPenaltyLoot.value;
    }
}