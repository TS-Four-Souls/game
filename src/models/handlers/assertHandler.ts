import type { Entity } from "../entities/entity";
import { Player } from "../entities/player";
import { Game } from "../game";
import { assertCardMatchesDeck, Card, type DeckType } from "@/models/cards";

export class AssertHandler {
    private _game: Game;

    constructor(game: Game) {
        this._game = game;
    }

    get game() {
        return this._game;
    }


  currentTurnIsPlayerTurn(player: Player): void {
    if (this.game.currentPlayer !== player) {
      throw new Error("Not your turn");
    }
  }

  currentPlayerIsNotEngagedInCombat(): void {
    this.game.endCombatIfInvalid(this.game.currentPlayer);
    if (this.game.currentPlayer!.isEngagedInCombat) {
      throw new Error("You are currently engaged in combat");
    }
  }

  currentPlayerIsEngagedInCombat(): void {
    if (!this.game.currentPlayer!.isEngagedInCombat) {
      throw new Error("You are not currently engaged in combat");
    }
  }

  noEntityIsEngagedInCombat(): void {
    if (this.game.entitiesInCombat.length > 0) {
      throw new Error("An entity is currently engaged in combat");
    }
  }

  currentPlayerIsEngagedInPurchase(): void {
    if (!this.game.currentPlayer!.isEngagedInPurchase) {
      throw new Error("You are not currently engaged in purchase");
    }
  }

  currentPlayerIsNotEngagedInPurchase(): void {
    if (this.game.currentPlayer!.isEngagedInPurchase) {
      throw new Error("You are currently engaged in purchase");
    }
  }
  playerIdAvailable(id: string): void {
    if (this.game.players.some((p) => p.id === id)) {
      throw new Error(`Player ${id} already exists`);
    }
  }

  emptyStack(): void {
    if (!this.game.stack.isEmpty()) throw new Error(`Stack is not empty.`);
  }

  gameNotStarted(): void {
    if (this.game.turnHandler.isInitialized) {
      throw new Error("Game already started");
    }
  }

  stackNotEmpty(): void {
    if (this.game.stack.size === 0) {
      throw new Error("The stack is empty");
    }
  }

  gameStarted(): number {
    if (!this.game.turnHandler.isInitialized) {
      throw new Error("Game not started");
    }
    return this.game.turnHandler.round;
  }
  entityIsInPlay(entity: Entity) {
    if (!this.game.EntitiesAndAnimated.includes(entity))
      throw new Error("Entity is not currently in play.");
  }

  minimumPlayerCount(): void {
    if (this.game.players.length < 2) {
      throw new Error("At least 2 players are required to start the game");
    }
  }

  isAlive(ent: Entity): void {
    if (ent.isDead) {
      throw new Error(`${ent.id} is already dead`);
    }
  }

  positiveNumber(nb: number): void {
    if (nb < 0) {
      throw new Error("Number is negative.");
    }
  }

  noOngoingAttack(): void {
    if(this.game.entitiesInCombat.length > 1)
      throw new Error("An attack is ongoing");
    
  }

  noPendingSelection(): void {
    if (this.game.hasPendingSelections)
      throw new Error("Pending selection need to be resolved");
  }

  cardMatchesDeck<T extends DeckType>(
      deckName: T,
      card: Card
  ) {
      assertCardMatchesDeck(deckName, card);
  }
  
  
  forcedAttackSatisfied(player: Player): void {
    this.game.canDeclareAttack(player, false);
    // Check if there's a forced attack constraint
    if (!player.hasAttackRequirement) {
      return; // No constraint, all good
    }

    // Check if player is dead - constraint doesn't apply
    if (player.isDead) {
      player.clearAttackRequirement();
      return;
    }

    const requirement = player.mustAttackMonster!;

    // Filter monsters that are still in play
    const validMonsters = requirement.filter(
      (req) => req.target === "topDeck" || req.target === "any" || req.target.some(target => this.game.monsters.includes(target))
    );

    if (validMonsters.length === 0) {
      player.clearAttackRequirement(); // All monsters gone, constraint lifted
      return;
    }

    // At least one monster constraint remains - must be satisfied
    throw new Error(
      "You must attack the required monster(s) before ending your turn"
    );
  }

}