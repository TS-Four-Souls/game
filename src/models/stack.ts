import type { Card, LootCard } from "./cards";
import type { Entity } from "./entity";
import { DamageOnStack, DeathOnStack, DiceRoll } from "./player";

export type StackElement = LootCard | DiceRoll | DeathOnStack | DamageOnStack;
    
export class Stack {
    _stack: StackElement[] = [];
    
    constructor() {}

    push(item: StackElement) : void {
        this._stack.push(item);
    }

    cancel() : void {
        this._stack.pop();
    }

    clear() : void {
        this._stack = [];
    }

    removeAt(index: number) : void {
        this._stack.splice(index, 1);
    }
    cancelElement(element: StackElement) : void {
        for (let i = this._stack.length - 1; i >= 0; i--) {
            const el = this._stack[i];
            if (el === element) {
                this._stack.splice(i, 1);
                return;
            }
        }
    }
    cancelPreviousNonRoll() : void {
        for (let i = this._stack.length - 2; i >= 0; i--) {
            const element = this._stack[i];
            this._stack.splice(i, 1);
            if (!(element instanceof DiceRoll)) {
                return;
            }
        }
    }
    cancelPreviousDeath(entity: Entity): void {
        for (let i = this._stack.length - 1; i >= 0; i--) {
            const element = this._stack[i];
            if ((element instanceof DeathOnStack)) {
                this._stack.splice(i, 1);
                return;
            }
        }
    }

    resolve(): StackElement | undefined {
        return this._stack.pop();
    }

    get elements(): StackElement[] {
        return this._stack;
    }

    isEmpty(): boolean {
        return this._stack.length === 0;
    }

   get size(): number {
        return this._stack.length;
    }

    displayStack(): void {
        console.log("Current Stack:");
        for (let i = this._stack.length - 1; i >= 0; i--) {
            const element = this._stack[i]!;
            console.log(`  [${i}]: ${element.constructor.name}`);
        }
    }
}