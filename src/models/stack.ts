import type { Entity } from "./entity";
import { StackElement } from "./stackElement";

export function isStackElement(obj: any): obj is StackElement {
    return obj instanceof StackElement;
}
export class Stack {
    _stack: StackElement[] = [];
    _nextId: number = 0;
    
    constructor() {}

    push(item: StackElement) : void {
        item.stackId = this._nextId++;
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

    insertStackElementBefore(elementToMove: StackElement, targetElement: StackElement): void {
        if (elementToMove === targetElement) {
            return;
        }

        const fromIndex = this._stack.indexOf(elementToMove);
        const toIndex = this._stack.indexOf(targetElement);

        if (fromIndex === -1 || toIndex === -1) {
            throw new Error("Both elements must be in the stack.");
        }

        const sourceGroup = elementToMove.reordering?.groupId;
        const targetGroup = targetElement.reordering?.groupId;
        if (!sourceGroup || !targetGroup) {
            throw new Error("Both elements must belong to a reordering group.");
        }
        if (sourceGroup !== targetGroup) {
            throw new Error("Cannot reorder elements from different groups.");
        }

        // Swap-based insertion to keep operation explicit and predictable.
        if (fromIndex < toIndex) {
            // If already directly before target, no move is needed.
            for (let i = fromIndex; i < toIndex - 1; i++) {
                const tmp = this._stack[i]!;
                this._stack[i] = this._stack[i + 1]!;
                this._stack[i + 1] = tmp;
            }
            return;
        }

        for (let i = fromIndex; i > toIndex; i--) {
            const tmp = this._stack[i]!;
            this._stack[i] = this._stack[i - 1]!;
            this._stack[i - 1] = tmp;
        }
    }

    cancelPreviousDeath(entity: Entity): void {
        for (let i = this._stack.length - 1; i >= 0; i--) {
            const element = this._stack[i];
            if (element?.json.type === "death") {
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

    peek(): StackElement | undefined {
        return this._stack[this._stack.length - 1];
    }
}

export { StackElement } from "./stackElement";