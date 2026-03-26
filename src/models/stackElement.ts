import type { StackElementJson, StackReorderingInfo as ApiStackReorderingInfo } from "@/shared/api";

type StackElementJsonBase = {
  id: number;
  reordering?: StackReorderingInfo;
};

export abstract class StackElement {
  private _stackId: number = -1;
  private _reordering: StackReorderingInfo | null = null;
  
  set stackId(id: number) {
    this._stackId = id;
  }

  get stackId(): number {
    return this._stackId;
  }

  set reordering(info: StackReorderingInfo | null) {
    this._reordering = info;
  }

  get reordering(): StackReorderingInfo | null {
    return this._reordering;
  }

  get isReorderable(): boolean {
    return this._reordering !== null;
  }

  protected get baseJson(): StackElementJsonBase {
    return {
      id: this.stackId,
      ...(this.reordering ? { reordering: this.reordering } : {}),
    };
  }

  abstract get json(): StackElementJson;
  abstract onResolve(): Promise<void | boolean>;
}

export type StackReorderingInfo = ApiStackReorderingInfo;
