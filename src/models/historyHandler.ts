import { TargetBuilder } from "./targetBuilder";
import { type Requests, type StackElementJson } from "../shared/api";
import type { StackElement } from "./stack";


/* This class is responsible for handling historic data.
* Historic data is divided into two categories:
* 1. History that is available for the user to check.
*    History contains stack information
* 2. Log that is used for record-keeping and auditing purposes.
*    Log solely contains user actions and random resolutions (shuffle, random number generation)
*/
export type UserRequest = 
    {type: "Join", payload: Requests.Join } 
  | {type: "Rejoin", payload: Requests.Rejoin }
  | {type: "Start", payload: Requests.Start }
  | {type: "Reset", payload: Requests.Reset }
  | {type: "DeclareAttack", payload: Requests.DeclareAttack }
  | {type: "Resolve", payload: Requests.Resolve }
  | {type: "SubmitSelection", payload: Requests.SubmitSelection }
  | {type: "EndTurn", payload: Requests.EndTurn }
  | {type: "PlayCard", payload: Requests.PlayCard }
  | {type: "Activate", payload: Requests.Activate }
  | {type: "Purchase", payload: Requests.Purchase }
  | {type: "GiveCoins", payload: Requests.GiveCoins }
  | {type: "AttackMonster", payload: Requests.AttackMonster }
  | {type: "AttackRoll", payload: Requests.AttackRoll }
  | {type: "DebugLoot", payload: Requests.DebugLoot }
  | {type: "DebugListLoot", payload: Requests.DebugListLoot }
  | {type: "DebugListTreasure", payload: Requests.DebugListTreasure }
  | {type: "DebugGainTreasure", payload: Requests.DebugGainTreasure }
  | {type: "DebugReset", payload: Requests.DebugReset };

  export type PrivateData = {
    private: true;
    type: "character";
    slug: string;
    playerId: string;
  }[] | {
    private: true;
    type: "shuffle";
    deckName: string;
    discard: boolean;
    order: number[];
  } | {
    private: true;
    type: "randomNumber";
    min: number;
    max: number;
    result: number;
  };

const isPrivateData = (entry: HistoricEntry): entry is PrivateData => {
  return (
    typeof entry === "object" &&
    entry !== null &&
    "private" in entry &&
    entry.private === true
  );
};

export type HistoricEntry = UserRequest | StackElementJson | PrivateData;
export class HistoricHandler {

  private _history: HistoricEntry[] = []
  
  addToHistory(entry: HistoricEntry): void {
    this._history.push(entry);
  }
  
  get history(): HistoricEntry[] {
    return this._history.filter((e) => !isPrivateData(e));
  }

  get log(): HistoricEntry[] {
    return this._history;
  }
}