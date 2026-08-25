import { RollbackCoordinator } from "@/network/rollbackCoordinator";
import { describe, expect, it } from "bun:test";

describe("RollbackCoordinator", () => {
  it("rejects a second rollback while one is active for the room", async () => {
    const coordinator = new RollbackCoordinator();
    const room = {};
    let finishRollback: (value: string) => void = () => undefined;
    const firstRollback = coordinator.run(
      room,
      async () => new Promise<string>((resolve) => {
        finishRollback = resolve;
      }),
    );

    await expect(coordinator.run(room, async () => "second"))
      .rejects.toThrow("Rollback is already in progress for this room.");

    finishRollback("first");
    await expect(firstRollback).resolves.toBe("first");
  });

  it("rejects a rollback that exceeds its timeout", async () => {
    const coordinator = new RollbackCoordinator();
    const room = {};

    await expect(coordinator.run(room, async () => new Promise(() => undefined), 5))
      .rejects.toThrow("Rollback timed out after 5ms.");
  });

  it("keeps the room locked after timeout until the original rollback settles", async () => {
    const coordinator = new RollbackCoordinator();
    const room = {};
    let finishRollback: () => void = () => undefined;

    await expect(coordinator.run(
      room,
      async () => new Promise<void>((resolve) => {
        finishRollback = resolve;
      }),
      5,
    ))
      .rejects.toThrow("Rollback timed out after 5ms.");
    await expect(coordinator.run(room, async () => "too-early"))
      .rejects.toThrow("Rollback is already in progress for this room.");

    finishRollback();
    await Bun.sleep(0);
    await expect(coordinator.run(room, async () => "recovered"))
      .resolves.toBe("recovered");
  });

  it("releases the room lock after a failed rollback", async () => {
    const coordinator = new RollbackCoordinator();
    const room = {};

    await expect(coordinator.run(room, async () => {
      throw new Error("load failed");
    })).rejects.toThrow("load failed");
    await expect(coordinator.run(room, async () => "recovered"))
      .resolves.toBe("recovered");
  });

  it("allows rollbacks for different rooms to run concurrently", async () => {
    const coordinator = new RollbackCoordinator();
    const firstRoom = {};
    const secondRoom = {};
    let finishFirstRollback: () => void = () => undefined;
    const firstRollback = coordinator.run(
      firstRoom,
      async () => new Promise<void>((resolve) => {
        finishFirstRollback = resolve;
      }),
    );

    await expect(coordinator.run(secondRoom, async () => "second-room"))
      .resolves.toBe("second-room");
    finishFirstRollback();
    await expect(firstRollback).resolves.toBeUndefined();
  });
});
