export class NumberRobustString extends String {
    private readonly _raw: string;
    private readonly _numbers: number[];
    private readonly _spans: Array<{ start: number; end: number }>; // masked index -> raw substring span
    private _index = 0;

    constructor(raw: string) {
        const { masked, numbers, spans } = NumberRobustString.maskNumbers(raw);
        super(masked);
        this._raw = raw;
        this._numbers = numbers;
        this._spans = spans;
    }

    /** Original, unmasked string that the numbers were extracted from. */
    get raw(): string {
        return this._raw;
    }

    /** Extracted numbers, in encounter order. */
    get numbers(): number[] {
        return this._numbers;
    }

    /** Stateful iterator-style accessor (kept for convenience). */
    nextNumber(): number {
        if (this._index >= this._numbers.length)
            throw new Error("No more numbers available in the string");
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
        const masked = this.toString();
        if (!masked.startsWith(maskedPrefix)) return null;
        const rawEndIndex = this.rawIndexAtMaskedPos(maskedPrefix.length);
        return this._raw.slice(rawEndIndex);
    }

    private rawIndexAtMaskedPos(maskedPos: number): number {
        if (maskedPos <= 0) return 0;
        if (maskedPos > this._spans.length) return this._raw.length;
        return this._spans[maskedPos - 1]!.end;
    }

    private static maskNumbers(raw: string): { masked: string; numbers: number[]; spans: Array<{ start: number; end: number }> } {
        const numbers: number[] = [];
        const spans: Array<{ start: number; end: number }> = [];
        let masked = "";

        const isDigit = (c: string): boolean => c >= "0" && c <= "9";
        const isWordChar = (c: string): boolean => /[A-Za-z0-9_]/u.test(c);
        const isWhitespace = (c: string): boolean => /\s/u.test(c);

        const hasDigitAfterOptionalWhitespace = (start: number): boolean => {
            let j = start;
            while (j < raw.length && isWhitespace(raw[j]!)) j++;
            return j < raw.length && isDigit(raw[j]!);
        };

        let i = 0;
        while (i < raw.length) {
            const ch = raw[i]!;
            const prev = i > 0 ? raw[i - 1]! : "";

            const isSignedStart = (ch === "+" || ch === "-") && !isWordChar(prev) && hasDigitAfterOptionalWhitespace(i + 1);
            const isUnsignedStart = isDigit(ch);

            if (isSignedStart || isUnsignedStart) {
                const start = i;
                let j = i;
                if (isSignedStart) {
                    j++; // consume sign
                    while (j < raw.length && isWhitespace(raw[j]!)) j++;
                }
                while (j < raw.length && isDigit(raw[j]!)) j++;

                const segment = raw.slice(start, j);
                const parsed = Number(segment.replace(/\s+/gu, ""));
                if (!Number.isNaN(parsed)) numbers.push(parsed);

                masked += "x";
                spans.push({ start, end: j });
                i = j;
                continue;
            }

            masked += ch;
            spans.push({ start: i, end: i + 1 });
            i++;
        }

        return { masked, numbers, spans };
    }
}

export function normalizeMaskedForMatch(s: string): string {
    return s.trim().replace(/\s*[.?!,]+$/gu, "").trim();
}

export function maskedEqualsAny(nr: NumberRobustString, patterns: readonly string[]): boolean {
    const m = normalizeMaskedForMatch(nr.toString());
    return patterns.some((p) => normalizeMaskedForMatch(p) === m);
}

export function numberAtIfMaskedEqualsAny(nr: NumberRobustString, patterns: readonly string[], index = 0): number | null {
    if (!maskedEqualsAny(nr, patterns)) return null;
    return nr.numbers[index] ?? null;
}

export type NumberRobustCheck = {
    patterns: readonly string[];
    parse: (nr: NumberRobustString) => any;
};

export function applyNumberRobustChecks(nr: NumberRobustString, checks: readonly NumberRobustCheck[]): any | null {
    for (const check of checks) {
        if (!maskedEqualsAny(nr, check.patterns)) continue;
        nr.resetIndex();
        return check.parse(nr);
    }
    return null;
}
