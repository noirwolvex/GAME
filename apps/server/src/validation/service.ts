import { validateWord, type ValidationResult } from "@game/validation";
import type { Category } from "@game/game-engine";
import { validateArabicGivenName } from "./name-service";

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

type ExternalEvidence = {
  category: Category;
  confidence: number;
  source: string;
  exact: boolean;
};

const cache = new Map<string, { expiresAt: number; result: ValidationResult & { sources?: string[] } }>();
const inFlight = new Map<string, Promise<ValidationResult & { sources?: string[] }>>();
const CACHE_TTL_MS = 10 * 60 * 1000;
const EXTERNAL_TIMEOUT_MS = 3500;
const WIKIMEDIA_USER_AGENT = "GAME-validation/0.8 (NOIR WOLVEX)";

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

function normalizeLookup(value: string): string {
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

function containsAny(text: string, terms: readonly string[]): boolean {
  return terms.some((term) => text.includes(term));
}

function classifyArabicDescription(description: string): Category | null {
  const text = description.toLocaleLowerCase();

  if (containsAny(text, [
    "دولة", "بلد", "جمهورية", "مملكة", "إمارة", "سلطنة", "اتحاد دول",
    "دولة مدينة", "دولة-مدينة", "مدينة دولة", "مدينة-دولة", "دولة ذات سيادة",
  ])) return "country";

  if (containsAny(text, [
    "شخص", "إنسان", "سياسي", "سياسية", "كاتب", "كاتبة", "لاعب", "لاعبة",
    "ممثل", "ممثلة", "مغني", "مغنية", "عالم", "عالمة", "مخترع", "مخترعة",
    "رئيس", "رئيسة", "ملكة", "ملك", "أمير", "أميرة",
  ])) return "human";

  if (containsAny(text, [
    "حيوان", "ثديي", "ثدييات", "طائر", "زاحف", "برمائي", "سمكة", "حشرة",
    "رخوي", "قشري", "عنكبي",
  ])) return "animal";

  if (containsAny(text, [
    "نبات", "شجرة", "شجيرة", "زهرة", "عشبة", "عشب", "نخلة", "كرمة",
  ])) return "plant";

  if (containsAny(text, [
    "أداة", "جهاز", "آلة", "مركبة", "سيارة", "مبنى", "منتج", "قطعة", "مادة",
    "شيء", "جسم", "أثاث", "ملابس", "كتاب",
  ])) return "object";

  return null;
}

async function fetchJson(url: string): Promise<unknown | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EXTERNAL_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": WIKIMEDIA_USER_AGENT,
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

function getEntityIds(
  claims: Record<string, Array<{ mainsnak?: { datavalue?: { value?: { id?: string } } } }>> | undefined,
  property: string,
): string[] {
  return (claims?.[property] ?? [])
    .map((claim) => claim.mainsnak?.datavalue?.value?.id)
    .filter((id): id is string => Boolean(id));
}

const DIRECT_CATEGORY_BY_QID: ReadonlyMap<string, Category> = new Map([
  ["Q5", "human"],
  ["Q729", "animal"],
  ["Q756", "plant"],
  ["Q6256", "country"],
  ["Q3624078", "country"],
  ["Q237", "country"],
  ["Q223557", "object"],
]);

async function queryWikidata(word: string): Promise<ExternalEvidence | null> {
  const normalizedWord = normalizeLookup(word);
  if (!normalizedWord) return null;

  const searchUrl = new URL("https://www.wikidata.org/w/api.php");
  searchUrl.searchParams.set("action", "wbsearchentities");
  searchUrl.searchParams.set("format", "json");
  searchUrl.searchParams.set("language", "ar");
  searchUrl.searchParams.set("uselang", "ar");
  searchUrl.searchParams.set("search", word);
  searchUrl.searchParams.set("limit", "10");

  const searchPayload = (await fetchJson(searchUrl.toString())) as {
    search?: Array<{ id?: string; label?: string; description?: string }>;
  } | null;

  const candidates = (searchPayload?.search ?? []).filter((item) => item.id);
  if (candidates.length === 0) return null;

  const candidateIds = candidates.map((item) => item.id).filter((id): id is string => Boolean(id));
  const entityUrl = new URL("https://www.wikidata.org/w/api.php");
  entityUrl.searchParams.set("action", "wbgetentities");
  entityUrl.searchParams.set("format", "json");
  entityUrl.searchParams.set("ids", candidateIds.join("|"));
  entityUrl.searchParams.set("props", "claims|descriptions|labels|aliases");
  entityUrl.searchParams.set("languages", "ar|en");
  entityUrl.searchParams.set("languagefallback", "1");

  const entityPayload = (await fetchJson(entityUrl.toString())) as {
    entities?: Record<string, {
      claims?: Record<string, Array<{ mainsnak?: { datavalue?: { value?: { id?: string } } } }>>;
      descriptions?: Record<string, { value?: string }>;
      labels?: Record<string, { value?: string }>;
      aliases?: Record<string, Array<{ value?: string }>>;
    }>;
  } | null;

  const entities = entityPayload?.entities ?? {};
  let best: ExternalEvidence | null = null;

  for (const candidate of candidates) {
    const id = candidate.id;
    if (!id) continue;
    const entity = entities[id];
    if (!entity) continue;

    const label = entity.labels?.ar?.value ?? candidate.label ?? "";
    const aliases = (entity.aliases?.ar ?? [])
      .map((alias) => alias.value ?? "")
      .filter(Boolean);
    const exactLabel = normalizeLookup(label) === normalizedWord;
    const exactAlias = aliases.some((alias) => normalizeLookup(alias) === normalizedWord);
    if (!exactLabel && !exactAlias) continue;

    const p31Ids = getEntityIds(entity.claims, "P31");
    const p279Ids = getEntityIds(entity.claims, "P279");
    const typeIds = [...new Set([...p31Ids, ...p279Ids])];

    const directCategory = typeIds
      .map((qid) => DIRECT_CATEGORY_BY_QID.get(qid) ?? null)
      .find((category): category is Category => category !== null);

    const description =
      entity.descriptions?.ar?.value ??
      entity.descriptions?.en?.value ??
      candidate.description ??
      "";
    const descriptionCategory = classifyArabicDescription(description);
    const category = directCategory ?? descriptionCategory;
    if (!category) continue;

    const confidence = directCategory
      ? descriptionCategory === directCategory ? 0.99 : 0.95
      : 0.86;

    const evidence: ExternalEvidence = {
      category,
      confidence,
      source: directCategory ? "wikidata-entity" : "wikidata-description",
      exact: true,
    };

    if (!best || evidence.confidence > best.confidence) best = evidence;
  }

  return best;
}

async function queryWikipedia(word: string): Promise<ExternalEvidence | null> {
  const normalizedWord = normalizeLookup(word);
  if (!normalizedWord) return null;

  const searchUrl = new URL("https://ar.wikipedia.org/w/rest.php/v1/search/page");
  searchUrl.searchParams.set("q", word);
  searchUrl.searchParams.set("limit", "10");

  const searchPayload = (await fetchJson(searchUrl.toString())) as {
    pages?: Array<{ title?: string; description?: string }>;
  } | null;

  const pages = searchPayload?.pages ?? [];
  const best = pages.find((page) => normalizeLookup(page.title ?? "") === normalizedWord);
  if (!best?.title) return null;

  const summaryUrl = `https://ar.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(best.title)}`;
  const summaryPayload = (await fetchJson(summaryUrl)) as {
    title?: string;
    description?: string | null;
    extract?: string | null;
  } | null;

  const description = `${summaryPayload?.description ?? best.description ?? ""}\n${summaryPayload?.extract ?? ""}`;
  const category = classifyArabicDescription(description);
  if (!category) return null;

  return {
    category,
    confidence: 0.88,
    source: "wikipedia-exact",
    exact: true,
  };
}

async function resolveExternal(value: string, requestedCategory: Category): Promise<ExternalDecision | null> {
  const [wikidata, wikipedia] = await Promise.all([
    queryWikidata(value),
    queryWikipedia(value),
  ]);

  const evidence = [wikidata, wikipedia].filter(
    (item): item is ExternalEvidence => Boolean(item),
  );
  const matching = evidence.filter((item) => item.category === requestedCategory);

  if (matching.length >= 2) {
    return {
      category: requestedCategory,
      confidence: Math.min(0.99, Math.max(...matching.map((item) => item.confidence)) + 0.01),
      reason: "known_word",
      sources: matching.map((item) => item.source),
    };
  }

  const strongest = matching.sort((a, b) => b.confidence - a.confidence)[0];
  if (strongest?.exact && strongest.confidence >= 0.90) {
    return {
      category: requestedCategory,
      confidence: strongest.confidence,
      reason: "known_word",
      sources: [strongest.source],
    };
  }

  return null;
}

async function validateExternally(local: ValidationResult): Promise<ValidationResult & { sources?: string[] }> {
  if (!local.normalized) return local;

  const external = await resolveExternal(local.normalized, local.category);
  if (external) {
    return {
      ...local,
      decision: "accept",
      reason: external.reason,
      confidence: external.confidence,
      sources: external.sources,
    };
  }

  if (local.category === "human") {
    const nameEvidence = await validateArabicGivenName(local.normalized);
    if (nameEvidence) {
      return {
        ...local,
        decision: "accept",
        reason: "known_word",
        confidence: nameEvidence.confidence,
        sources: [nameEvidence.source],
      };
    }
  }

  return local;
}

export async function validateWithHybridSources(
  value: string | undefined,
  category: Category,
  letter: string,
): Promise<ValidationResult & { sources?: string[] }> {
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
