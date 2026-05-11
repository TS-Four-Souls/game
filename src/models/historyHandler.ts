import { generateHistoryId } from "@/utils/random";
import fs from "fs";
import {
  type DetailedState,
  type Issuer,
  type Requests,
  type StackElementJson,
} from "../shared/api";
import type { Game } from "./game";
import type { GameParameters } from "./gameParameters";
import { StackElement } from "./stackElement";

/* This class is responsible for handling historic data.
 * Historic data is divided into two categories:
 * 1. History that is available for the user to check.
 *    History contains stack information
 * 2. Log that is used for record-keeping and auditing purposes.
 *    Log solely contains user actions and random seed
 */
export type UserRequest =
  | { type: "Join"; payload: Requests.SetName }
  | { type: "Rejoin" }
  | { type: "SetGameParameter"; payload: Requests.SetGameParameter }
  | { type: "Start"; characters: string[] }
  | { type: "Reset" }
  | { type: "Rollback"; issuer: Issuer }
  | { type: "DeclareAttack"; issuer: Issuer }
  | { type: "DeclarePurchase"; issuer: Issuer }
  | { type: "CancelPurchase"; issuer: Issuer }
  | { type: "Resolve"; issuer: Issuer }
  | {
      type: "SubmitSelection";
      payload: Requests.SubmitSelection;
      issuer: Issuer;
    }
  | {
      type: "InsertStackElementBefore";
      payload: Requests.InsertStackElementBefore;
      issuer: Issuer;
    }
  | { type: "PlayCard"; payload: Requests.PlayCard; issuer: Issuer }
  | { type: "EndTurn"; issuer: Issuer }
  | { type: "Activate"; payload: Requests.Activate; issuer: Issuer }
  | { type: "ActivateRoom"; payload: Requests.ActivateRoom; issuer: Issuer }
  | { type: "Purchase"; payload: Requests.Purchase; issuer: Issuer }
  | { type: "GiveCoins"; payload: Requests.GiveCoins; issuer: Issuer }
  | { type: "AttackMonster"; payload: Requests.AttackMonster; issuer: Issuer }
  | { type: "AttackRoll"; issuer: Issuer }
  | { type: "DebugLoot"; payload: Requests.DebugLoot; issuer: Issuer }
  | { type: "DebugListLoot"; issuer: Issuer }
  | { type: "DebugListMonsterDeck"; issuer: Issuer }
  | { type: "DebugListCardsICanRemove"; issuer: Issuer }
  | {
      type: "DebugRemoveCards";
      payload: Requests.DebugRemoveCards;
      issuer: Issuer;
    }
  | { type: "DebugListTreasure"; issuer: Issuer }
  | {
      type: "DebugPutMonsterCardInSlot";
      payload: Requests.DebugPutMonsterCardInSlot;
      issuer: Issuer;
    }
  | {
      type: "DebugGainTreasure";
      payload: Requests.DebugGainTreasure;
      issuer: Issuer;
    }
  | { type: "DebugGainCoins"; payload: Requests.DebugGainCoins; issuer: Issuer }
  | { type: "ReportBug"; payload: Requests.ReportBug; issuer: Issuer }
  | { type: "IsGameOngoing" }
  | { type: "CreateRoom" }
  | { type: "JoinRoom" }
  | { type: "LeaveRoom" }
  | { type: "LoadGame"; payload: Requests.LoadGame };

/**
 *
 * @param request
 * @returns True if and only if the request is a non-revertable (i.e. not a rollback or InsertStackElementBefore) user action that should be recorded in the history and log.
 */
function isGameAction(entry: HistoricEntry): boolean {
  if (isPrivateData(entry) || isStackElementJson(entry)) return false;
  return ![
    "Join",
    "Rejoin",
    "SetGameParameter",
    "Start",
    "Reset",
    "Rollback",
    "SubmitSelection",
    "InsertStackElementBefore",
    "DebugListLoot",
    "DebugListMonsterDeck",
    "DebugListCardsICanRemove",
    "DebugListTreasure",
    "ReportBug",
    "IsGameOngoing",
    "CreateRoom",
    "JoinRoom",
    "LeaveRoom",
    "LoadGame",
  ].includes(entry.type);
}
// Important historic information: purchase, DebugLoot, DebugListLoot, DebugListTreasure, DebugGainTreasure, GiveCoins, AttackMonster, EndTurn
export type PrivateData =
  | {
      private: true;
      type: "character";
      slug: string;
      playerId: string;
    }
  | {
      private: true;
      type: "randomSeed";
      seed: string;
    }
  | {
      private: true;
      type: "GameParameters";
      gameParameters: GameParameters;
    }
  | {
      private: true;
      type: "GameState";
      gameState: DetailedState;
    };

const isPrivateData = (entry: HistoricEntry): entry is PrivateData => {
  return (
    typeof entry === "object" &&
    entry !== null &&
    "private" in entry &&
    entry.private === true
  );
};

const isStackElementJson = (
  entry: HistoricEntry,
): entry is StackElementJson => {
  return ["death", "damage", "effect", "LootCardEffect", "diceRoll"].includes(
    entry.type,
  );
};

export type HistoricEntry = UserRequest | StackElementJson | PrivateData;
export class HistoricHandler {
  private historyId = generateHistoryId();

  private _history: HistoricEntry[] = [];

  addToHistory(entry: HistoricEntry): void {
    this._history.push(entry);
    try {
      // this.appendToFile("history.json", entry);
    } catch (error) {
      console.error("Error appending to history file", error);
    }
  }

  recordInitialGameState(game: Game): void {
    this.addToHistory({
      private: true,
      type: "GameParameters",
      gameParameters: game.gameParameters,
    });
    for (const player of game.players) {
      this.addToHistory({
        private: true,
        type: "character",
        slug: player.character.slug,
        playerId: player.id,
      });
    }
  }

  get history(): StackElementJson[] {
    return this._history.filter(isStackElementJson).slice(-20);
    // return this._history.filter((e) => !isPrivateData(e));
  }

  /**
   *
   * @param game is used to obtain the current game state for comparisons when reloading a game.
   * @returns History of the game, appended with the current game state to check the loader.
   */
  log(game: Game): HistoricEntry[] {
    const state: HistoricEntry = {
      private: true,
      type: "GameState",
      gameState: game.detailedStateJSON(game.players[0]!),
    };
    return [...this._history, state];
  }

  get lastUserRequestIssuer(): string | null {
    const lastUserRequestIndex = this._history.findLastIndex((entry, index) => {
      return isGameAction(entry);
    });
    if (
      this._history[lastUserRequestIndex] &&
      "issuer" in this._history[lastUserRequestIndex] &&
      this._history[lastUserRequestIndex].issuer !== undefined &&
      !isStackElementJson(this._history[lastUserRequestIndex]) // Already verified by lastUserRequest being a game action.
    )
      return this._history[lastUserRequestIndex].issuer;
    return null;
  }
  /** Returns the history entries until the last user request (exluded).
   * If no user request is found, returns the entire history.
   */
  get rollbackLog(): HistoricEntry[] {
    var lastUserRequestIndex = -1;
    var secondLastUserRequestIndex = -1;
    // We look for the second last user request in the history.
    // If there is only one user request, we use it instead.
    this._history.findLastIndex((entry, index) => {
      if (isGameAction(entry)) {
        if (lastUserRequestIndex === -1) lastUserRequestIndex = index;
        else if (secondLastUserRequestIndex === -1)
          secondLastUserRequestIndex = index;
        if (secondLastUserRequestIndex !== -1) return true; // stop searching once we found the second last user request
      }
    });
    if (secondLastUserRequestIndex !== -1)
      return this._history.slice(0, secondLastUserRequestIndex + 1);
    if (lastUserRequestIndex !== -1)
      return this._history.slice(0, lastUserRequestIndex);
    return this._history;
  }

  loadHistory(entries: HistoricEntry[]): void {
    this._history = entries;
  }

  appendToFile(filename: string, entry: HistoricEntry): void {
    fs.appendFileSync(
      filename,
      `${new Date().toISOString()} - ${this.historyId} - ${JSON.stringify(entry)}\n`,
      "utf8",
    );
  }
}
