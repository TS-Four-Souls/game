import type { Card } from "./cards";

export type StackElement = Card | number;

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

    resolve(): StackElement | undefined {
        return this._stack.pop();
    }

    get elements(): StackElement[] {
        return this._stack;
    }

    isEmpty(): boolean {
        return this._stack.length === 0;
    }

    size(): number {
        return this._stack.length;
    }
    isTopElementNumber(): boolean {
        if (this.isEmpty()) {
            return false;
        }
        const topElement = this._stack[this._stack.length - 1];
        return typeof topElement === "number";
    }
}