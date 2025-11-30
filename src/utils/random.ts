export const rollDice = (sides: number = 6) => {
  return Math.floor(Math.random() * sides) + 1;
};
