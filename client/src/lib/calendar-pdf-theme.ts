import designTokens from "@/index.css?raw";

// A PDF cannot consume CSS variables. Read their light-theme declarations
// directly, keeping index.css as the source of truth even when the UI is dark.
const lightTokens = designTokens.match(/:root\s*\{([\s\S]*?)\}/)?.[1] ?? "";

export function printToken(name: string): string {
  const value = lightTokens.match(new RegExp(`--${name}\\s*:\\s*([^;]+);`))?.[1].trim();
  if (!value) throw new Error(`Missing print design token: ${name}`);
  return value;
}

/** The guide's pixel spacing/radius translated into PDF points. */
export function printPoints(name: string): number {
  return parseFloat(printToken(name)) * 0.75;
}
