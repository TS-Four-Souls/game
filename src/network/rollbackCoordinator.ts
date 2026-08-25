const DEFAULT_ROLLBACK_TIMEOUT_MS = 30_000;

export class RollbackCoordinator {
  private readonly activeRooms = new WeakSet<object>();

  async run<T>(
    room: object,
    operation: () => Promise<T>,
    timeoutMs: number = DEFAULT_ROLLBACK_TIMEOUT_MS,
  ): Promise<T> {
    if (this.activeRooms.has(room)) {
      throw new Error("Rollback is already in progress for this room.");
    }

    this.activeRooms.add(room);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    const operationPromise = Promise.resolve().then(operation);

    try {
      return await Promise.race([
        operationPromise,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => {
            timedOut = true;
            reject(new Error(`Rollback timed out after ${timeoutMs}ms.`));
          }, timeoutMs);
        }),
      ]);
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
      if (timedOut) {
        void operationPromise.then(
          () => this.activeRooms.delete(room),
          () => this.activeRooms.delete(room),
        );
      } else {
        this.activeRooms.delete(room);
      }
    }
  }
}

export const rollbackCoordinator = new RollbackCoordinator();
