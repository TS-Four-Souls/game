import { type TriggerEvent } from '@/models/types/eventTypes';
import type { TriggerEventDataMap } from './types/eventTypes';

export class GameEventEmitter {
  private listeners: Map<TriggerEvent, ((data: any) => void)[]> = new Map();
  
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
    this.listeners.get(event)!.push(callback as (data: any) => void);
    
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
    const cbs = this.listeners.get(event);
    if (cbs) {
      const idx = cbs.indexOf(callback);
      if (idx !== -1) cbs.splice(idx, 1);
    }
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
    for (const cb of cbsCopy) {
      cb(data);
    }
    return cbs.length;
  }
}