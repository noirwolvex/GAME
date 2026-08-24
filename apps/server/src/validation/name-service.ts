import type { Category } from "@game/game-engine";
import { validateWordWithGroq } from "./groq-service";

export interface NameValidationResult {
  category: Category;
  confidence: number;
  source: string;
}

function normalizeArabic(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06EDـ]/g, "")
    .replace(/\s+/g, " ");
}

async function fetchJson(url: string): Promise<any | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "GAME-validation/0.9 (NOIR WOLVEX)",
      },
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function hasNameSignal(text: string): boolean {
  const normalized = text.toLocaleLowerCase();
  return [
    "اسم علم",
    "اسم شخص",
    "اسم علم مؤنث",
    "اسم علم مذكر",
    "اسم عربي",
    "اسم مؤنث",
    "اسم مذكر",
    "اسم شخص عربي",
    "female given name",
    "male given name",
    "given name",
    "personal name",
  ].some((signal) => normalized.includes(signal));
}

async function fetchExactPage(title: string): Promise<string> {
  const url = new URL("https://ar.wiktionary.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("prop", "extracts");
  url.searchParams.set("exintro", "1");
  url.searchParams.set("explaintext", "1");
  url.searchParams.set("redirects", "1");
  url.searchParams.set("titles", title);

  const payload = await fetchJson(url.toString());
  const pages = Object.values(payload?.query?.pages ?? {}) as Array<{ extract?: string; title?: string }>;
  const normalized = normalizeArabic(title);
  const page = pages.find((item) => normalizeArabic(item.title ?? "") === normalized);
  return page?.extract ?? "";
}

async function fetchSearchPage(word: string): Promise<string> {
  const url = new URL("https://ar.wiktionary.org/w/api.php");
  url.searchParams.set("action", "opensearch");
  url.searchParams.set("format", "json");
  url.searchParams.set("search", word);
  url.searchParams.set("limit", "5");
  url.searchParams.set("namespace", "0");

  const payload = await fetchJson(url.toString());
  const titles = Array.isArray(payload?.[1]) ? (payload[1] as string[]) : [];
  const normalized = normalizeArabic(word);
  const exactTitle = titles.find((title) => normalizeArabic(title) === normalized);
  if (!exactTitle) return "";
  return fetchExactPage(exactTitle);
}

export async function validateArabicGivenName(word: string): Promise<NameValidationResult | null> {
  const normalized = normalizeArabic(word);
  if (!normalized) return null;

  // Legacy human-name supplement uses the current generic Groq validator.
  const groq = await validateWordWithGroq(word, "human");
  if (groq?.valid && groq.category === "human" && groq.confidence >= 0.10) {
    return {
      category: "human",
      confidence: groq.confidence,
      source: groq.source,
    };
  }

  // Deterministic lexical fallback.
  const directExtract = await fetchExactPage(word);
  const extract = directExtract || await fetchSearchPage(word);

  if (extract && hasNameSignal(extract)) {
    return {
      category: "human",
      confidence: 0.95,
      source: "wiktionary-name",
    };
  }

  return null;
}
