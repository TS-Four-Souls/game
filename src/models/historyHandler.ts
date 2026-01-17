import { TargetBuilder } from "./targetBuilder";
import { type Requests } from "../shared/api";
import type { StackElement } from "./stack";


/* This class is responsible for handling historic data.
* Historic data is divided into two categories:
* 1. History that is available for the user to check.
*    History contains stack information
* 2. Log that is used for record-keeping and auditing purposes.
*    Log solely contains user actions and random resolutions (shuffle, random number generation)
*/
export type UserRequest = 
    Requests.Join 
  | Requests.Rejoin 
  | Requests.Start 
  | Requests.Reset 
  | Requests.DeclareAttack 
  | Requests.resolve 
  | Requests.submitSelection 
  | Requests.EndTurn 
  | Requests.PlayCard 
  | Requests.Activate 
  | Requests.Purchase
  | Requests.GiveCoins
  | Requests.AttackMonster
  | Requests.AttackRoll
  | Requests.DebugLoot
  | Requests.DebugGainTreasure
  | Requests.DebugReset;

  export type PrivateData = {
    type: "character";
    slug: string;
    playerId: string;
  }[] | {
    type: "shuffle";
    deckName: string;
    discard: boolean;
    order: number[];
  } | {
    type: "randomNumber";
    min: number;
    max: number;
    result: number;
  };

export type HistoricEntry = UserRequest | StackElement | PrivateData;
export class HistoricHandler {

  private _history: HistoricEntry[] = []
  
  addToHistory(entry: HistoricEntry): void {
    this._history.push(entry);
  }
  
  get history(): (UserRequest | StackElement)[] {
    return this.history.filter((e): e is UserRequest | StackElement => true);
  }

  get log(): HistoricEntry[] {
    return this._history;
  }
}