import { type TriggerEvent } from '@/models/types/eventTypes';
import type { TriggerEventDataMap } from './types/eventTypes';

type ListenerEntry = {
  id: number;
  callback: (data: any) => void;
};

export class GameEventEmitter {
  private listeners: Map<TriggerEvent, ListenerEntry[]> = new Map();
  private nextListenerId = 1;
  private currentEmittingEvent: TriggerEvent | null = null;
  private currentListenerId: number | null = null;
  
  /**
   * Subscribe to an event. The callback type is automatically inferred from the event name.
   * @param event - The event name (e.g., "on:damage:taken")
   * @param callback - Callback function that receives event-specific data
   * @returns Unsubscribe function
   * 
   * @example
   * game.emitter.on("on:damage:taken", ({ eventIssuer, damage }) => {
   *   // eventIssuer and damage are correctly typed
   * });
   */
  on<T extends TriggerEvent>(
    event: T, 
    callback: (data: TriggerEventDataMap[T]) => void
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push({
      id: this.nextListenerId++,
      callback: callback as (data: any) => void,
    });
    
    // Return unsubscribe function
    return () => this.off(event, callback);
  }
  
  /**
   * Unsubscribe from an event.
   */
  off<T extends TriggerEvent>(
    event: T, 
    callback: (data: TriggerEventDataMap[T]) => void
  ): void {
    const entries = this.listeners.get(event);
    if (entries) {
      const idx = entries.findIndex((entry) => entry.callback === callback);
      if (idx !== -1) entries.splice(idx, 1);
    }
  }

  getCurrentEmissionContext(): { event: TriggerEvent; listenerId: number } | null {
    if (!this.currentEmittingEvent || this.currentListenerId == null) {
      return null;
    }
    return {
      event: this.currentEmittingEvent,
      listenerId: this.currentListenerId,
    };
  }

  reorderListenersBySubset(event: TriggerEvent, orderedSubsetListenerIds: number[]): void {
    const entries = this.listeners.get(event) || [];
    if (entries.length === 0 || orderedSubsetListenerIds.length <= 1) {
      return;
    }

    const orderedIdSet = new Set(orderedSubsetListenerIds);
    const subsetPositions: number[] = [];
    const subsetEntries: ListenerEntry[] = [];

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]!;
      if (orderedIdSet.has(entry.id)) {
        subsetPositions.push(i);
        subsetEntries.push(entry);
      }
    }

    if (subsetPositions.length !== orderedSubsetListenerIds.length) {
      throw new Error("Cannot reorder listeners: some listener IDs are not subscribed to this event.");
    }

    const entryById = new Map<number, ListenerEntry>(subsetEntries.map((entry) => [entry.id, entry]));
    const reorderedSubset = orderedSubsetListenerIds.map((id) => {
      const entry = entryById.get(id);
      if (!entry) {
        throw new Error("Cannot reorder listeners: listener subset mismatch.");
      }
      return entry;
    });

    const nextEntries = entries.slice();
    subsetPositions.forEach((position, idx) => {
      nextEntries[position] = reorderedSubset[idx]!;
    });

    this.listeners.set(event, nextEntries);
  }
  
  /**
   * Emit an event with type-safe data.
   * @param event - The event name
   * @param data - Event-specific data matching the event type
   * @returns Number of listeners that were called
   */
  emit<T extends TriggerEvent>(
    event: T, 
    data: TriggerEventDataMap[T]
  ): number {
    // console.log(`Event emitted: ${event}`
    //   , data.card ? `for ${data.card.name}` : '');
    const cbs = this.listeners.get(event) || [];
    // Create a shallow copy to avoid issues if callbacks modify listeners during iteration
    const cbsCopy = cbs.slice();
    const previousEvent = this.currentEmittingEvent;
    const previousListenerId = this.currentListenerId;
    this.currentEmittingEvent = event;
    try {
      for (const cb of cbsCopy) {
        this.currentListenerId = cb.id;
        cb.callback(data);
      }
    } finally {
      this.currentEmittingEvent = previousEvent;
      this.currentListenerId = previousListenerId;
    }
    return cbs.length;
  }
}