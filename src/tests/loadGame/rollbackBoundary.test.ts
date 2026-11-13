import type { Game } from "@/models/game";
import { HistoricHandler, type HistoricEntry } from "@/models/handlers/historyHandler";
import { describe, expect, it } from "bun:test";

/**
 * A rollback drops the last request together with the answers to the selections it opened,
 * even when another request was recorded while those selections were open.
 * Rollback and save cut the history at the same place.
 */
function setup() {
  const stub = { hasPendingSelections: false };
  const handler = new HistoricHandler(stub as unknown as Game);
  const record = (entry: HistoricEntry, pending: boolean) => {
    stub.hasPendingSelections = pending;
    handler.addToHistory(entry);
  };
  return { handler, stub, record };
}

const start = { type: "Start", players: [], params: {} } as unknown as HistoricEntry;
const resolve = (issuer: string) => ({ type: "Resolve", issuer }) as HistoricEntry;
const answer = (issuer: string, requestId: number) =>
  ({ type: "SubmitSelection", issuer, payload: { requestId, selections: [] } }) as HistoricEntry;

describe("Rollback boundary", () => {
  it("drops the request that opened a selection, its answer, and a request sent while the selection was open.", () => {
    const { handler, stub, record } = setup();
    record(start, false);
    record(resolve("p0"), false);
    // This Resolve opens the death penalty selection.
    record(resolve("p1"), false);
    // A request recorded while the selection is open (as in the corrupted rollback).
    record(resolve("p1"), true);
    record(answer("p1", 0), true);
    stub.hasPendingSelections = false;

    expect(handler.rollbackLog.length).toBe(2);
    expect(handler.lastUserRequestIssuer).toBe("p1");
  });

  it("cuts at the same place as a save taken while the selection is open.", () => {
    const { handler, stub, record } = setup();
    record(start, false);
    record(resolve("p0"), false);
    record(resolve("p1"), false);
    stub.hasPendingSelections = true;

    expect(handler.rollbackLog).toEqual(handler.saveLog({ hasPendingSelections: true } as Game));
    expect(handler.rollbackLog.length).toBe(2);
  });

  it("returns the whole history when no request was made.", () => {
    const { handler, record } = setup();
    record(start, false);
    expect(handler.rollbackLog.length).toBe(1);
    expect(handler.lastUserRequestIssuer).toBe(null);
  });
});
