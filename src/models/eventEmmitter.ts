import { type TriggerEvent } from '@/types/triggers';

export class GameEventEmitter {
  private listeners: Map<TriggerEvent, ((data: any) => void)[]> = new Map();
  
  on(event: TriggerEvent, callback: (data: any) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
    
    // Return unsubscribe function
    return () => this.off(event, callback);
  }
  
  off(event: TriggerEvent, callback: (data: any) => void): void {
    const cbs = this.listeners.get(event);
    if (cbs) {
      const idx = cbs.indexOf(callback);
      if (idx !== -1) cbs.splice(idx, 1);
    }
  }
  
  emit(event: TriggerEvent, data: any = {}): number {
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