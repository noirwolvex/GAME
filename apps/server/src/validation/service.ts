import { validateWord, type ValidationResult } from "@game/validation";
import type { Category } from "@game/game-engine";

interface SupabaseRow {
  word: string;
  normalized_word: string;
  category: Category;
  aliases: string[];
  status: "accepted" | "review" | "rejected";
  confidence: number;
  source: string;
}

type ExternalDecision = {
  category: Category;
  confidence: number;
  reason: "known_word" | "known_alias";
  sources: string[];
};

const cache = new Map<string, { expiresAt: number; result: ValidationResult & { sources?: string[] } }>();
const inFlight = new Map<string, Promise<ValidationResult & { sources?: string[] }>>();
const CACHE_TTL_MS = 10 * 60 * 1000;
const EXTERNAL_TIMEOUT_MS = 3500;
const WIKIMEDIA_USER_AGENT = "GAME-validation/0.5 (NOIR WOLVEX)";

function cacheKey(value: string, category: Category, letter: string): string {
  return `${category}:${letter}:${value.trim()}`;
}

function getCached(key: string): (ValidationResult & { sources?: string[] }) | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  return hit.result;
}

function setCached(key: string, result: ValidationResult & { sources?: string[] }): void {
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, result });
}

function containsAny(text: string, terms: readonly string[]): boolean {
  return terms.some((term) => text.includes(term));
}

function classifyArabicDescription(description: string): Category | null {
  const text = description.toLocaleLowerCase();
  if (containsAny(text, ["دولة", "بلد", "جمهورية", "مملكة", "إمارة", "سلطنة", "اتحاد دول"])) return "country";
  if (containsAny(text, ["شخص", "سياسي", "سياسية", "كاتب", "كاتبة", "لاعب", "لاعبة", "ممثل", "ممثلة", "مغني", "مغنية", "عالم", "عالمة", "مخترع", "مخترعة", "رئيس", "ملكة", "ملك", "أمير", "أميرة"])) return "human";
  if (containsAny(text, ["حيوان", "ثديي", "ثدييات", "طائر", "زاحف", "برمائي", "سمكة", "حشرة", "رخوي", "قشري", "عنكبي"])) return "animal";
  if (containsAny(text, ["نبات", "شجرة", "شجيرة", "زهرة", "عشبة", "عشب", "نخلة", "كرمة"])) return "plant";
  if (containsAny(text, ["أداة", "جهاز", "آلة", "مركبة", "سيارة", "مبنى", "منتج", "قطعة", "مادة", "شيء", "جسم", "أثاث", "ملابس", "كتاب"])) return "object";
  return null;
}

async function fetchJson(url: string): Promise<unknown | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EXTERNAL_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": WIKIMEDIA_USER_AGENT },
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function queryWikidata(word: string): Promise<{ category: Category; confidence: number; source: string } | null> {
  const searchUrl = new URL("https://www.wikidata.org/w/api.php");
  searchUrl.searchParams.set("action", "wbsearchentities");
  searchUrl.searchParams.set("format", "json");
  searchUrl.searchParams.set("language", "ar");
  searchUrl.searchParams.set("uselang", "ar");
  searchUrl.searchParams.set("search", word);
  searchUrl.searchParams.set("limit", "3");

  const searchPayload = (await fetchJson(searchUrl.toString())) as { search?: Array<{ id?: string; label?: string; description?: string }> } | null;
  const first = searchPayload?.search?.find((item) => item.id && item.label);
  if (!first?.id) return null;

  const entityUrl = new URL("https://www.wikidata.org/w/api.php");
  entityUrl.searchParams.set("action", "wbgetentities");
  entityUrl.searchParams.set("format", "json");
  entityUrl.searchParams.set("ids", first.id);
  entityUrl.searchParams.set("props", "claims|descriptions|labels");
  entityUrl.searchParams.set("languages", "ar|en");

  const entityPayload = (await fetchJson(entityUrl.toString())) as {
    entities?: Record<string, {
      claims?: Record<string, Array<{ mainsnak?: { datavalue?: { value?: { id?: string } } } }>>;
      descriptions?: Record<string, { value?: string }>;
    }>;
  } | null;
  const entity = entityPayload?.entities?.[first.id];
  if (!entity) return null;

  const p31 = entity.claims?.P31 ?? [];
  const instanceIds = new Set(p31.map((claim) => claim.mainsnak?.datavalue?.value?.id).filter((id): id is string => Boolean(id)));
  const directMap: ReadonlyMap<string, Category> = new Map([
    ["Q5", "human"],
    ["Q729", "animal"],
    ["Q756", "plant"],
    ["Q6256", "country"],
    ["Q223557", "object"],
  ]);

  const directCategory = [...instanceIds].map((id) => directMap.get(id) ?? null).find((category): category is Category => category !== null);
  const description = entity.descriptions?.ar?.value ?? entity.descriptions?.en?.value ?? first.description ?? "";
  const descriptionCategory = classifyArabicDescription(description);

  if (directCategory) {
    return { category: directCategory, confidence: descriptionCategory === directCategory ? 0.97 : 0.92, source: "wikidata" };
  }
  if (descriptionCategory) return { category: descriptionCategory, confidence: 0.82, source: "wikidata-description" };
  return null;
}

async function queryWikipedia(word: string): Promise<{ category: Category; confidence: number; source: string } | null> {
  const searchUrl = new URL("https://ar.wikipedia.org/w/rest.php/v1/search/page");
  searchUrl.searchParams.set("q", word);
  searchUrl.searchParams.set("limit", "3");
  const searchPayload = (await fetchJson(searchUrl.toString())) as { pages?: Array<{ title?: string; description?: string }> } | null;
  const normalizedWord = word.trim().toLocaleLowerCase();
  const best = searchPayload?.pages?.find((page) => page.title?.trim().toLocaleLowerCase() === normalizedWord) ?? searchPayload?.pages?.[0];
  if (!best) return null;

  const category = classifyArabicDescription(best.description ?? "");
  if (!category) return null;
  return { category, confidence: 0.80, source: "wikipedia" };
}

async function resolveExternal(value: string, requestedCategory: Category): Promise<ExternalDecision | null> {
  const [wikidata, wikipedia] = await Promise.all([queryWikidata(value), queryWikipedia(value)]);
  const evidence = [wikidata, wikipedia].filter((item): item is NonNullable<typeof item> => Boolean(item));
  const agreeing = evidence.filter((item) => item.category === requestedCategory);

  if (agreeing.length >= 2) {
    return { category: requestedCategory, confidence: 0.95, reason: "known_word", sources: agreeing.map((item) => item.source) };
  }
  const single = agreeing[0];
  if (single) return { category: requestedCategory, confidence: single.confidence, reason: "known_word", sources: [single.source] };
  return null;
}

async function validateExternally(local: ValidationResult): Promise<ValidationResult & { sources?: string[] }> {
  if (!local.normalized) return local;
  const external = await resolveExternal(local.normalized, local.category);
  if (!external) return local;
  return { ...local, decision: "accept", reason: external.reason, confidence: external.confidence, sources: external.sources };
}

export async function validateWithHybridSources(value: string | undefined, category: Category, letter: string): Promise<ValidationResult & { sources?: string[] }> {
  const local = validateWord(value, category, letter);
  const key = cacheKey(local.normalized, category, letter);
  const cached = getCached(key);
  if (cached) return cached;

  if (local.decision !== "review") {
    setCached(key, local);
    return local;
  }

  const existingFlight = inFlight.get(key);
  if (existingFlight) return existingFlight;

  const task = (async () => {
    try {
      const externalResult = await validateExternally(local);
      const supabaseUrl = process.env.SUPABASE_URL;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (externalResult.decision === "accept" && supabaseUrl && serviceRoleKey) {
        try {
          await fetch(`${supabaseUrl}/rest/v1/validation_words`, {
            method: "POST",
            headers: {
              apikey: serviceRoleKey,
              Authorization: `Bearer ${serviceRoleKey}`,
              "Content-Type": "application/json",
              Prefer: "resolution=ignore-duplicates,return=minimal",
            },
            body: JSON.stringify({
              word: externalResult.value,
              normalized_word: externalResult.normalized,
              category,
              aliases: [],
              status: "accepted",
              confidence: externalResult.confidence,
              source: externalResult.sources?.join("+") ?? "external",
            }),
          });
        } catch {
          // In-memory result remains authoritative for this request.
        }
      }

      setCached(key, externalResult);
      return externalResult;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, task);
  return task;
}
