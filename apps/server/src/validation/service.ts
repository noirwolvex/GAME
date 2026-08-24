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

const cache = new Map<string, { expiresAt: number; result: ValidationResult }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function cacheKey(value: string, category: Category, letter: string): string {
  return `${category}:${letter}:${value.trim()}`;
}

function getCached(key: string): ValidationResult | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  return hit.result;
}

function setCached(key: string, result: ValidationResult): void {
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, result });
}

export async function validateWithHybridSources(
  value: string | undefined,
  category: Category,
  letter: string,
): Promise<ValidationResult> {
  const local = validateWord(value, category, letter);
  const key = cacheKey(local.normalized, category, letter);

  const cached = getCached(key);
  if (cached) return cached;

  if (local.decision !== "review") {
    setCached(key, local);
    return local;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    setCached(key, local);
    return local;
  }

  try {
    const url = new URL(`${supabaseUrl}/rest/v1/validation_words`);
    url.searchParams.set("select", "word,normalized_word,category,aliases,status,confidence,source");
    url.searchParams.set("normalized_word", `eq.${encodeURIComponent(local.normalized)}`);
    url.searchParams.set("category", `eq.${category}`);
    url.searchParams.set("status", "eq.accepted");
    url.searchParams.set("limit", "1");

    const response = await fetch(url, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    });

    if (!response.ok) {
      setCached(key, local);
      return local;
    }

    const rows = (await response.json()) as SupabaseRow[];
    const row = rows[0];

    if (!row) {
      const review: ValidationResult = {
        ...local,
        decision: "review",
        reason: "unknown_word",
        confidence: 0.5,
      };
      setCached(key, review);
      return review;
    }

    const accepted: ValidationResult = {
      value: value?.trim() ?? "",
      normalized: row.normalized_word,
      category,
      letter,
      decision: "accept",
      reason: row.aliases?.includes(local.normalized) ? "known_alias" : "known_word",
      confidence: Number(row.confidence),
    };

    setCached(key, accepted);
    return accepted;
  } catch {
    setCached(key, local);
    return local;
  }
}
