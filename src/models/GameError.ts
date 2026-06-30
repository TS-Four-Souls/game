import type { SerializedTranslation } from "../shared/api";


export class GameError extends Error {
  private _translation?: SerializedTranslation;
  constructor(message: string, translation: SerializedTranslation) {
    super(message);
    this._translation = translation;
    this.name = "gameError";
  }

  get translation(): SerializedTranslation | undefined {
    return this._translation;
  }
}
