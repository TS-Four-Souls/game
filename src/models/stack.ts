class Stack {
    _stack: any[] = [];
    
    constructor() {}

    push(item: any) {
        this._stack.push(item);
    }

    resolve(): any | undefined {
        return this._stack.pop();
    }

    get stack(): any[] {
        return this._stack;
    }

    isEmpty(): boolean {
        return this._stack.length === 0;
    }

    size(): number {
        return this._stack.length;
    }
}