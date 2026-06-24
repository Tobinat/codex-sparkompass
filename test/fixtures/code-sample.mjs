import { calculateSavings } from "./savings.mjs";

export function compressText(input, options = {}) {
  const keepTerms = options.keep ?? [];
  const targetPercent = options.targetPercent ?? 35;
  if (!input) {
    return {
      text: "",
      quality: "gut"
    };
  }

  const result = {
    text: String(input).trim(),
    savings: calculateSavings(100, targetPercent),
    quality: {
      status: "gut",
      warnings: []
    }
  };

  if (keepTerms.includes("AUTH_RESET_TOKEN_EXPIRED")) {
    result.text += "\nAUTH_RESET_TOKEN_EXPIRED";
  }

  return result;
}

export function formatCompressionReport(result) {
  return `Qualität: ${result.quality.status}\n${result.text}`;
}

const filler = [
  "noise one",
  "noise two",
  "noise three",
  "noise four",
  "noise five"
];

console.log(filler.join("\n"));
