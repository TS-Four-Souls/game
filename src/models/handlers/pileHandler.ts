import type { SerializedTranslation } from "@/shared/api";
import type { Card } from "../cards";

export abstract class PileHandler<T> {
    _default: T;
    _pile: T[] = [];

    constructor(defaultValue: T) {
        this._default = defaultValue;
    }
    
    get default(): T {
        return this._default;
    }
    get pile(): T[] {
        return this._pile;
    }
    /**
     * Returns the top element of the pile, or the default value if the pile is empty.
     */
    get top(): T {
        if (this._pile.length === 0) {
            return this._default;
        }
        return this._pile[this._pile.length - 1]!;
    }
    protected add(elem: T): void {
        this._pile.push(elem);
    }
    protected remove(elem: T): void {
        const index = this._pile.indexOf(elem);
        if (index > -1) {
            this._pile.splice(index, 1);
        }
    }
    protected clear(): void {
        this._pile = [];
    }
}

export class NamedPileHandler extends PileHandler<{ name: SerializedTranslation, origin: Card | "default" }> {
    constructor(defaultName: SerializedTranslation) {
        super({ name: defaultName, origin: "default" });
    }
    get topName(): SerializedTranslation {
        return this.top.name;
    }
    addNamed(name: SerializedTranslation, origin: Card): void {
        this.add({ name, origin });
    }
    removeName(origin: Card): void {
        const index = this._pile.findIndex((elem) => elem.origin === origin);
        if (index > -1) {
            this._pile.splice(index, 1);
        }
    }
}

export class Attribute extends PileHandler<{ value: number, origin: Card | "default" }>{

    get value(): number{
        return this._default.value + this._pile.map(p => p.value).reduce((prev, curr) => prev + curr, 0);
    }
    get hasAny(): boolean{
        return this.value > 0;
    }
}