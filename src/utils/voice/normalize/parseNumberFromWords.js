import { NUMBER_WORDS } from "../NUMBER_WORDS";

export const parseNumberFromWords = (text) => {
  if (!text) return null;

  const words = text
    .toLowerCase()
    .replace(/[,]/g, " ")
    .split(/\s+/);

  let total = 0;
  let current = 0;
  let fraction = 0;
  let fractionDivider = 1;
  let isFraction = false;

  for (let i = 0; i < words.length; i++) {
    const w = words[i];

    // дробная часть
    if (w === "и" || w === "целых") {
      continue;
    }

    if (w === "десятых") {
      fractionDivider = 10;
      isFraction = true;
      continue;
    }

    if (w === "сотых") {
      fractionDivider = 100;
      isFraction = true;
      continue;
    }

    const value = NUMBER_WORDS[w];

    if (value === undefined) continue;

    if (value === 1000) {
      total += (current || 1) * value;
      current = 0;
      continue;
    }

    if (value >= 100) {
      current += value;
      continue;
    }

    if (isFraction) {
      fraction += value;
    } else {
      current += value;
    }
  }

  total += current;

  if (isFraction) {
    total += fraction / fractionDivider;
  }

  return total || null;
};
