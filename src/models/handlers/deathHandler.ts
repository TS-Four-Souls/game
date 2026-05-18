import { GameParameters } from "../gameParameters";

export class DeathPenaltyValues
{ 
    public nbCoinsToLose: number;
    public nbItemsToLose: number;
    public nbLootCardsToLose: number;

    constructor(params: GameParameters) {
        this.nbCoinsToLose = params.deathPenaltyCoins.value;
        this.nbItemsToLose = params.deathPenaltyItem.value;
        this.nbLootCardsToLose = params.deathPenaltyLoot.value;
    }
}