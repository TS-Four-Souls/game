import {
  type TranslationKeys,
  type TranslationFunctionArgs,
} from "translations";
import {
  type BasicSerializedTranslation,
  type SerializedTranslation,
} from "@/shared/api";
import { GameError } from "@/models/GameError";
import en from "../../data/translations/en.json";

export function toSerializedTranslation<T extends TranslationKeys>(
  ...args: TranslationFunctionArgs<T>
): SerializedTranslation {
  return args[1] === undefined
    ? { key: args[0] }
    : { key: args[0], interpolates: args[1] };
}

export function translationKeyFromCardSlug(
  slug: string,
): BasicSerializedTranslation {
  if (!Object.hasOwn(en.cardNames, slug))
    throw new GameError(
      `Key "${slug}" is not a valid translation key`,
      toSerializedTranslation("error.parsingError", {
        error: `Key "${slug}" is not a valid translation key`,
      }),
    );
  return { key: "cardNames." + slug };
}
