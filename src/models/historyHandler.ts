import { generateHistoryId } from "@/utils/random";
import { type Requests, type StackElementJson } from "../shared/api";
import fs from "fs";
import type { GameParameters } from "./gameParameters";
import type { Game } from "./game";


/* This class is responsible for handling historic data.
* Historic data is divided into two categories:
* 1. History that is available for the user to check.
*    History contains stack information
* 2. Log that is used for record-keeping and auditing purposes.
*    Log solely contains user actions and random seed
*/
export type UserRequest = 
    {type: "Join", payload: Requests.Join } 
  | {type: "Rejoin", payload: Requests.Rejoin }
  | {type: "SetGameParameter", payload: Requests.SetGameParameter }
  | {type: "Start", payload: Requests.Start }
  | {type: "Reset", payload: Requests.Reset }
  | {type: "DeclareAttack", payload: Requests.DeclareAttack }
  | {type: "DeclarePurchase", payload: Requests.DeclarePurchase }
  | {type: "CancelPurchase", payload: Requests.CancelPurchase }
  | {type: "Resolve", payload: Requests.Resolve }
  | {type: "SubmitSelection", payload: Requests.SubmitSelection }
  | {type: "InsertStackElementBefore", payload: Requests.InsertStackElementBefore }
  | {type: "PlayCard", payload: Requests.PlayCard }
  | {type: "EndTurn", payload: Requests.EndTurn }
  | {type: "Activate", payload: Requests.Activate }
  | {type: "Purchase", payload: Requests.Purchase }
  | {type: "GiveCoins", payload: Requests.GiveCoins }
  | {type: "AttackMonster", payload: Requests.AttackMonster }
  | {type: "AttackRoll", payload: Requests.AttackRoll }
  | {type: "DebugLoot", payload: Requests.DebugLoot }
  | {type: "DebugListLoot", payload: Requests.DebugListLoot }
  | {type: "DebugListCardsICanRemove", payload: Requests.DebugListCardsICanRemove }
  | {type: "DebugRemoveCards", payload: Requests.DebugRemoveCards }
  | {type: "DebugListTreasure", payload: Requests.DebugListTreasure }
  | {type: "DebugGainTreasure", payload: Requests.DebugGainTreasure }
  | {type: "IsGameOngoing" }
  | {type: "CreateRoom" }
  | {type: "JoinRoom", payload: Requests.JoinRoom }
  | {type: "LeaveRoom" }


// Important historic information: purchase, DebugLoot, DebugListLoot, DebugListTreasure, DebugGainTreasure, GiveCoins, AttackMonster, EndTurn
  export type PrivateData = {
    private: true;
    type: "character";
    slug: string;
    playerId: string;
  } | {
    private: true;
    type: "randomSeed";
    seed: string;
  } | {
    private: true;
    type: "GameParameters";
    gameParameters: GameParameters;
  };

const isPrivateData = (entry: HistoricEntry): entry is PrivateData => {
  return (
    typeof entry === "object" &&
    entry !== null &&
    "private" in entry &&
    entry.private === true
  );
};

const isStackElementJson = (entry: HistoricEntry): entry is StackElementJson => {
  return (
    ["death", "damage", "effect", "LootCardEffect", "diceRoll"].includes(entry.type)
  );
};

export type HistoricEntry = UserRequest | StackElementJson | PrivateData;
export class HistoricHandler {

  private historyId = generateHistoryId();

  private _history: HistoricEntry[] = []
  
  addToHistory(entry: HistoricEntry): void {
    this._history.push(entry);
    try {
      this.appendToFile("history.json", entry);
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

  get log(): HistoricEntry[] {
    return this._history;
  }

  appendToFile(filename: string, entry: HistoricEntry): void {
    fs.appendFileSync(filename, `${new Date().toISOString()} - ${this.historyId} - ${JSON.stringify(entry)}\n`, "utf8");
  }
}