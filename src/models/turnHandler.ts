import { Player } from "./player";

export class TurnHandler {
    private _isInitialized: boolean = false;
    private _roundIndex: number = 0;
    private _remainingTurnsInRound: Player[] = [];
    private _baseOrder: Player[] = [];

    constructor() { }
    initialize(baseOrder: Player[]) : void {
        this._isInitialized = true;
        this._roundIndex = 1;
        this._baseOrder = baseOrder;
        this._remainingTurnsInRound = [...baseOrder];
    }

    endTurn() : void {
        const finishedPlayer = this._remainingTurnsInRound.shift();
        if (this._remainingTurnsInRound.length === 0) {
            this._roundIndex += 1;
            this._remainingTurnsInRound = [...this._baseOrder];
        }
    }

    get isInitialized(): boolean {
        return this._isInitialized;
    }

    get current(): Player {
        return this._remainingTurnsInRound[0]!;
    }

    get round(): number {
        return this._roundIndex;
    }

    InsertPlayerAtNextTurn(player: Player) : void {
        this._remainingTurnsInRound.splice(1, 0, player);
    }

    reset() : void {
        this._isInitialized = false;
        this._roundIndex = 0;
        this._remainingTurnsInRound = [];
        this._baseOrder = [];
    }

}