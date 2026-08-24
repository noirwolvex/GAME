export const DEFAULT_CATEGORIES = [
  "human",
  "animal",
  "plant",
  "object",
  "country",
] as const;

export type Category = (typeof DEFAULT_CATEGORIES)[number];

export type RoundState = "waiting" | "playing" | "review" | "finished";

export interface RoundConfig {
  letter: string;
  durationSeconds: number;
  categories: readonly Category[];
}

export function normalizeAnswer(value: string): string {
  return value.trim().toLocaleLowerCase();
}

export function startsWithLetter(answer: string, letter: string): boolean {
  const normalizedAnswer = normalizeAnswer(answer);
  const normalizedLetter = normalizeAnswer(letter);
  return normalizedAnswer.length > 0 && normalizedAnswer.startsWith(normalizedLetter);
}
