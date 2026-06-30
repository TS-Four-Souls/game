import { GameError } from "@/models/GameError";
import { toSerializedTranslation } from "@/utils/translation";
export class NumberRobustString extends String {
    private readonly _raw: string;
    private readonly _masked: string;
    private readonly _numbers: number[];
    private _normalizedMasked: string;
    private _index = 0;

    constructor(raw: string) {
        const { masked, numbers } = NumberRobustString.maskNumbers(raw);
        super(masked);
        this._raw = raw;
        this._masked = masked;
        this._normalizedMasked = normalizeMaskedForMatch(this._masked);
        this._numbers = numbers;
    }

    /** Original, unmasked string that the numbers were extracted from. */
    get raw(): string {
        return this._raw;
    }

    /** Extracted numbers, in encounter order. */
    get numbers(): number[] {
        return this._numbers;
    }

    /** Masked string with numbers replaced by x. */
    get masked(): string {
        return this._masked;
    }

    /** Normalized masked string for pattern matching. Cached because it is queried a lot. */
    get normalizedMasked(): string {
        return this._normalizedMasked;
    }

    /** Stateful iterator-style accessor (kept for convenience). */
    nextNumber(): number {
        if (this._index >= this._numbers.length)
            throw new GameError("No more numbers available in the string", toSerializedTranslation("error.noMoreNumbersAvailableInString"));
        return this._numbers[this._index++]!;
    }

    resetIndex(): void {
        this._index = 0;
    }

    /**
     * Returns the raw remainder after a masked prefix.
     * The prefix is expressed in the masked form (numbers replaced by 'x').
     */
    restAfter(maskedPrefix: string): string | null {
        const masked = this._masked;
        if (!masked.startsWith(maskedPrefix)) return null;
        const rawEndIndex = NumberRobustString.rawIndexAfterMaskedPrefix(this._raw, maskedPrefix.length);
        return this._raw.slice(rawEndIndex);
    }

    private static rawIndexAfterMaskedPrefix(raw: string, maskedPos: number): number {
        if (maskedPos <= 0) return 0;

        let rawIndex = 0;
        let maskedIndex = 0;

        while (rawIndex < raw.length && maskedIndex < maskedPos) {
            const ch = raw[rawIndex]!;
            if (ch >= "0" && ch <= "9") {
                maskedIndex++;
                while (rawIndex < raw.length) {
                    const digit = raw[rawIndex]!;
                    if (digit < "0" || digit > "9") break;
                    rawIndex++;
                }
                continue;
            }

            maskedIndex++;
            rawIndex++;
        }

        return rawIndex;
    }

    private static maskNumbers(raw: string): { masked: string; numbers: number[] } {
        const numbers: number[] = [];
        let masked = "";

        let cursor = 0;
        for (const match of raw.matchAll(/\d+/gu)) {
            const start = match.index ?? 0;
            const digits = match[0]!;
            const end = start + digits.length;

            if (cursor < start) {
                masked += raw.slice(cursor, start);
            }

            const parsed = Number(digits);
            if (!Number.isNaN(parsed)) numbers.push(parsed);

            masked += "x";
            cursor = end;
        }

        if (cursor < raw.length) {
            masked += raw.slice(cursor);
        }

        return { masked, numbers };
    }
}

function normalizeMaskedForMatch(s: string): string {
    // Keep internal punctuation, but ignore trailing punctuation variants (.,?,!) so we can match e.g. "loot 3" and "loot 3.".
    // Also normalize leading plus signs before masked numbers so existing `x` patterns still match `+x` text,
    // while preserving `-x` for cases that need to treat a negative sign explicitly.
    return s
        .trim()
        .replace(/(^|[^\w])\+*x/gu, "$1x")
        .replace(/\s*[.?!,]+$/gu, "")
        .trim();
}