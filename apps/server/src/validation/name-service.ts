import type { Category } from "@game/game-engine";

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
        "User-Agent": "GAME-validation/0.7 (NOIR WOLVEX)",
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

export async function validateArabicGivenName(word: string): Promise<NameValidationResult | null> {
  const normalized = normalizeArabic(word);
  if (!normalized) return null;

  const url = new URL("https://ar.wiktionary.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("prop", "extracts");
  url.searchParams.set("exintro", "1");
  url.searchParams.set("explaintext", "1");
  url.searchParams.set("redirects", "1");
  url.searchParams.set("titles", word);

  const payload = await fetchJson(url.toString());
  const pages = Object.values(payload?.query?.pages ?? {}) as Array<{ extract?: string; title?: string }>;
  const page = pages.find((item) => normalizeArabic(item.title ?? "") === normalized);
  const extract = page?.extract ?? "";

  if (!page || !extract) return null;

  const text = extract.toLocaleLowerCase();
  const nameSignals = [
    "اسم علم",
    "اسم شخص",
    "اسم علم مؤنث",
    "اسم علم مذكر",
    "اسم عربي",
    "اسم مؤنث",
    "اسم مذكر",
  ];

  if (nameSignals.some((signal) => text.includes(signal))) {
    return {
      category: "human",
      confidence: 0.94,
      source: "wiktionary-name",
    };
  }

  return null;
}
