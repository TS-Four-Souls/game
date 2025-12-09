// models/abilityRegistry.ts
import { GameEventEmitter } from './eventEmmitter';
import type { TriggerEvent } from '@/types/triggers';
import type { Card, EffectFunction } from './cards';
import type { Player } from './player';

export interface Ability {
    id: string;
    card: Card;
    trigger: TriggerEvent;
    effect: EffectFunction;
    scope: 'owner' | 'player' | 'monster' | 'this';
    isActive: boolean;
}

export class AbilityRegistry {
    constructor(private emitter: GameEventEmitter) { }

    private unsubscribers = new Map<string, () => void>(); // abilityId -> unsubscribe
    private abilities = new Map<string, Ability>();        // abilityId -> ability

    register(ability: Ability) {
        // Subscribe the ability’s effect to the trigger via the emitter
        const off = this.emitter.on(ability.trigger, (data) => {
            if (!ability.isActive) return;
            // data should include issuer/targets; you can shape it as you like
            ability.effect(ability.card, data.issuer as Player, data.targets ?? []);
        });
        this.unsubscribers.set(ability.id, off);
        this.abilities.set(ability.id, ability);
    }

    unregister(abilityId: string) {
        this.unsubscribers.get(abilityId)?.(); // detach from emitter
        this.unsubscribers.delete(abilityId);
        this.abilities.delete(abilityId);
    }

    clear() {
        [...this.unsubscribers.values()].forEach((off) => off());
        this.unsubscribers.clear();
        this.abilities.clear();
    }
}