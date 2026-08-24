import type { Category } from "@game/game-engine";
import { GAME_INDEX_ENTRIES } from "./game-index.generated";

export type ValidationDecision = "accept" | "review" | "reject";
export type ValidationReason =
  | "empty"
  | "too_short"
  | "wrong_letter"
  | "known_word"
  | "known_alias"
  | "category_mismatch"
  | "unknown_word";

export interface DictionaryEntry {
  word: string;
  category: Category;
  aliases?: readonly string[];
  confidence?: number;
}

export interface ValidationResult {
  value: string;
  normalized: string;
  category: Category;
  letter: string;
  decision: ValidationDecision;
  reason: ValidationReason;
  confidence: number;
}

const MIN_ANSWER_LENGTH = 2;
const DEFINITE_ARTICLE = "ال";

const SEED_DICTIONARY: readonly DictionaryEntry[] = [
  { word: "محمد", category: "human", aliases: ["محمّد"] },
  { word: "مريم", category: "human" },
  { word: "ماهر", category: "human" },
  { word: "منى", category: "human" },
  { word: "نورة", category: "human" },
  { word: "نورا", category: "human" },
  { word: "حيدر", category: "human" },
  { word: "مرام", category: "human" },
  { word: "ضحى", category: "human" },
  { word: "قاسم", category: "human" },
  { word: "زهراء", category: "human" },
  { word: "يحيى", category: "human" },
  { word: "تامر", category: "human" },
  { word: "أسد", category: "animal" },
  { word: "ماعز", category: "animal" },
  { word: "مها", category: "animal" },
  { word: "نمر", category: "animal" },
  { word: "نسر", category: "animal" },
  { word: "يمامة", category: "animal" },
  { word: "موز", category: "plant" },
  { word: "مانجو", category: "plant" },
  { word: "مشمش", category: "plant" },
  { word: "مفتاح", category: "object" },
  { word: "مكتب", category: "object" },
  { word: "منضدة", category: "object" },
  { word: "مصر", category: "country" },
  { word: "مالطا", category: "country" },
  { word: "مغرب", category: "country", aliases: ["المغرب"] },
  { word: "الفاتيكان", category: "country", aliases: ["فاتيكان"] },
];

function stripArabicMarks(value: string): string {
  return value.replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06EDـ]/g, "");
}

export function normalizeArabic(value: string): string {
  return stripArabicMarks(value)
    .trim()
    .toLocaleLowerCase()
    .replace(/[إأآٱ]/g, "ا")
    .replace(/[ى]/g, "ي")
    .replace(/[ؤ]/g, "و")
    .replace(/[ئ]/g, "ي")
    .replace(/\s+/g, " ");
}

export function validationForm(value: string): { normalized: string; letterForm: string } {
  const normalized = normalizeArabic(value);
  const letterForm = normalized.startsWith(DEFINITE_ARTICLE) && normalized.length > DEFINITE_ARTICLE.length
    ? normalized.slice(DEFINITE_ARTICLE.length)
    : normalized;
  return { normalized, letterForm };
}

export function startsWithArabicLetter(value: string, letter: string): boolean {
  const { normalized, letterForm } = validationForm(value);
  const normalizedLetter = normalizeArabic(letter);
  return (
    normalized.length > 0 &&
    (normalized.startsWith(normalizedLetter) || letterForm.startsWith(normalizedLetter))
  );
}

export function createDictionary(entries: readonly DictionaryEntry[] = SEED_DICTIONARY) {
  const exact = new Map<string, DictionaryEntry[]>();
  for (const entry of entries) {
    const values = [entry.word, ...(entry.aliases ?? [])];
    for (const value of values) {
      const key = normalizeArabic(value);
      const current = exact.get(key) ?? [];
      current.push(entry);
      exact.set(key, current);
    }
  }
  return exact;
}

const GENERATED_DICTIONARY: readonly DictionaryEntry[] = GAME_INDEX_ENTRIES.map((entry) => ({
  word: entry.word,
  category: entry.category,
  confidence: entry.confidence,
}));

export const DEFAULT_DICTIONARY = createDictionary([...SEED_DICTIONARY, ...GENERATED_DICTIONARY]);

export function validateWord(
  value: string | undefined,
  category: Category,
  letter: string,
  dictionary = DEFAULT_DICTIONARY,
): ValidationResult {
  const original = value?.trim() ?? "";
  const { normalized } = validationForm(original);

  if (!normalized) {
    return { value: original, normalized, category, letter, decision: "reject", reason: "empty", confidence: 1 };
  }
  if (normalized.length < MIN_ANSWER_LENGTH) {
    return { value: original, normalized, category, letter, decision: "reject", reason: "too_short", confidence: 1 };
  }
  if (!startsWithArabicLetter(normalized, letter)) {
    return { value: original, normalized, category, letter, decision: "reject", reason: "wrong_letter", confidence: 1 };
  }

  const entries = dictionary.get(normalized) ?? [];
  const matching = entries.filter((entry) => entry.category === category);

  if (matching.length > 0) {
    const exact = matching.some((entry) => normalizeArabic(entry.word) === normalized);
    const confidence = Math.max(...matching.map((entry) => entry.confidence ?? (exact ? 1 : 0.99)));
    return {
      value: original,
      normalized,
      category,
      letter,
      decision: "accept",
      reason: exact ? "known_word" : "known_alias",
      confidence,
    };
  }

  if (entries.length > 0) {
    return { value: original, normalized, category, letter, decision: "reject", reason: "category_mismatch", confidence: 0.99 };
  }

  return { value: original, normalized, category, letter, decision: "review", reason: "unknown_word", confidence: 0.5 };
}

export function seedDictionary(): readonly DictionaryEntry[] {
  return SEED_DICTIONARY;
}

export function validationDictionaryStats() {
  return {
    generatedEntries: GENERATED_DICTIONARY.length,
    totalEntries: DEFAULT_DICTIONARY.size,
  };
}
