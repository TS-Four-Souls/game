import { toSerializedTranslation } from "@/utils/translation";
import type { Entity } from "../entities/entity";
import { Player } from "../entities/player";
import { Game } from "../game";
import { GameError } from "@/models/GameError";
import { assertCardMatchesDeck, Card, type DeckType } from "@/models/cards";

export class AssertHandler {
    private _game: Game;
    private _lastTimedAction: number = 0;

    constructor(game: Game) {
        this._game = game;
    }

    get game(): Game {
        return this._game;
    }


  currentTurnIsPlayerTurn(player: Player): void {
    if (this.game.currentPlayer !== player) {
      throw new GameError("Not your turn", toSerializedTranslation("error.notYourTurn"));
    }
  }

  currentPlayerIsNotEngagedInCombat(): void {
    this.game.entityHandler.endCombatIfInvalid(this.game.currentPlayer);
    if (this.game.currentPlayer!.isEngagedInCombat) {
      throw new GameError("You are currently engaged in combat", toSerializedTranslation("error.alreadyEngagedInCombat"));
    }
  }

  currentPlayerIsEngagedInCombat(): void {
    if (!this.game.currentPlayer!.isEngagedInCombat) {
      throw new GameError("You are not currently engaged in combat", toSerializedTranslation("error.notEngagedInCombat"));
    }
  }

  noEntityIsEngagedInCombat(): void {
    if (this.game.entitiesInCombat.length > 0) {
      throw new GameError("An entity is currently engaged in combat", toSerializedTranslation("error.entityEngagedInCombat"));
    }
  }

  currentPlayerIsEngagedInPurchase(): void {
    if (!this.game.currentPlayer!.isEngagedInPurchase) {
      throw new GameError("You are not currently engaged in purchase", toSerializedTranslation("error.notEngagedInPurchase"));
    }
  }

  currentPlayerIsNotEngagedInPurchase(): void {
    if (this.game.currentPlayer!.isEngagedInPurchase) {
      throw new GameError("You are currently engaged in purchase", toSerializedTranslation("error.alreadyEngagedInPurchase"));
    }
  }
  playerIdAvailable(id: string): void {
    if (this.game.players.some((p) => p.id === id)) {
      throw new GameError(`Player ${id} already exists`, toSerializedTranslation("error.playerAlreadyExists", { player: id }));
    }
  }

  emptyStack(): void {
    if (!this.game.stack.isEmpty()) throw new GameError(`Stack is not empty.`, toSerializedTranslation("error.stackIsNotEmpty"));
  }
  
  /**
   * Check is the game is started and not finished.
   * @throws if the game is not started, or if the game is over.
   * @returns the current number of rounds.
   */
  gameOngoing(): number {
    if (!this.game.turnHandler.isInitialized) {
      throw new GameError("Game not started", toSerializedTranslation("error.gameNotStarted"));
    }
    if(this.game.isGameOver)
    {
      throw new GameError("Game is over. You must leave.", toSerializedTranslation("error.gameOver"))
    }
    return this.game.turnHandler.round;
  }

  gameNotStarted(): void {
    if (this.game.turnHandler.isInitialized) {
      throw new GameError("Game already started", toSerializedTranslation("error.gameAlreadyStarted"));
    }
  }

  stackNotEmpty(): void {
    if (this.game.stack.size === 0) {
      throw new GameError("The stack is empty", toSerializedTranslation("error.stackIsEmpty"));
    }
  }
  entityIsInPlay(entity: Entity): void {
    if (!this.game.entities.includes(entity))
      throw new GameError("Entity is not currently in play.", toSerializedTranslation("error.entityNotInPlay"));
  }

  minimumPlayerCount(): void {
    if (this.game.players.length < 2) {
      throw new GameError("At least 2 players are required to start the game", toSerializedTranslation("error.atLeast2PlayersRequired"));
    }
  }

  isAlive(ent: Entity): void {
    if (ent.isDead) {
      throw new GameError(`${ent.id} is already dead`, toSerializedTranslation("error.entityAlreadyDead", { entityId: ent.id }));
    }
  }

  positiveNumber(nb: number): void {
    if (nb < 0) {
      throw new GameError("Number is negative.", toSerializedTranslation("error.numberIsNegative"));
    }
  }

  noOngoingAttack(): void {
    if(this.game.entitiesInCombat.length > 1)
      throw new GameError("An attack is ongoing", toSerializedTranslation("error.attackIsOngoing"));
    
  }

  noPendingSelection(): void {
    if (this.game.hasPendingSelections)
      throw new GameError("Pending selection need to be resolved", toSerializedTranslation("error.pendingSelectionNeedsResolution"));
  }

  cardMatchesDeck<T extends DeckType>(
      deckName: T,
      card: Card
  ): void {
      assertCardMatchesDeck(deckName, card);
  }


  /**
   * 
   * @param time as returned by new Date().getTime().
   */
  set lastTimedAction(time: number) {
    this._lastTimedAction = time;
  }
  
  get lastTimedAction(): number {
    return this._lastTimedAction;
  }

  canResolveNow(): void {
    if(new Date().getTime() - this.lastTimedAction < 1000 * this.game.gameParameters.resolveCooldown.value)
      throw new GameError(`You must wait ${this.game.gameParameters.resolveCooldown.value} seconds between actions.`,
        toSerializedTranslation("error.waitBetweenActions", { seconds: this.game.gameParameters.resolveCooldown.value })
      );
  }
  updateLastTimedAction(): void {
    this.lastTimedAction = new Date().getTime();
  }
}