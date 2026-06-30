import {
  type TranslationKeys,
  type TranslationFunctionArgs,
} from "translations";
import { type BasicSerializedTranslation, type SerializedTranslation } from "@/shared/api";
import { readFileSync } from "fs";
import { GameError } from "@/models/GameError";

const TRANSLATION_FILE_PATH = "/Users/sylvain/Documents/foursouls/four-souls-game/src/shared/translation.json";

const f = readFileSync(TRANSLATION_FILE_PATH, "utf-8");
const translation = JSON.parse(f);
export function toSerializedTranslation<T extends TranslationKeys>(
  ...args: TranslationFunctionArgs<T>
): SerializedTranslation {
  return args[1] === undefined
    ? { key: args[0] }
    : { key: args[0], interpolates: args[1] };
}

export function translationKeyFromCardSlug(slug: string): BasicSerializedTranslation {
  if (!Object.keys(translation["cardNames"]).includes(slug))
    throw new GameError(`Key "${slug}" is not a valid translation key`, toSerializedTranslation("error2.parsingError", {error: `Key "${slug}" is not a valid translation key`}));
  return { key: "cardNames." + slug };
}
