function shuffle<T>(random: () => number, array: T[]): void {
    let currentIndex = array.length;

    // For each elements starting from the end.
    while (currentIndex != 0) {
        // Pick a random element from the remaining elements.
        const randomIndex = Math.floor(currentIndex * random());
        currentIndex--;
        // Swap the current element with the random element.
        [array[currentIndex]!, array[randomIndex]!] = [
            array[randomIndex]!, array[currentIndex]!];
    }
}
export function partialsEndingWithNumber1to6(str:string) {
  const result = [];
  const regex = /\b[1-6]\b/g;   // match a single digit 1–6 as a whole token

  let match;
  while ((match = regex.exec(str)) !== null) {
    const endIndex = match.index + match[0].length;
    result.push(str.slice(0, endIndex).trim());
  }

  return result;
}

function print(...args: unknown[]): void {
    console.log(...args);
}

export { shuffle, print };