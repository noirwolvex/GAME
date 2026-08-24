import dotenv from "dotenv";
import { resolve } from "node:path";
import type { Category } from "@game/game-engine";

export interface GroqValidationResult {
  valid: boolean;
  category: Category;
  confidence: number;
  reason: string;
  source: "groq-ai";
}

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = process.env.GROQ_MODEL ?? "openai/gpt-oss-20b";
const GROQ_TIMEOUT_MS = 4000;
const LOCAL_DAILY_CAP = 900;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const cache = new Map<string, { expiresAt: number; result: GroqValidationResult }>();
let usageDay = "";
let usageCount = 0;

const CATEGORIES: readonly Category[] = ["human", "animal", "plant", "object", "country"];

function normalize(value: string): string {
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

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function canUseGroq(): boolean {
  // Load the server env at request time so this module does not depend on
  // ESM/CommonJS import ordering during `npm --workspace ... run dev`.
  dotenv.config({
    path: [resolve(process.cwd(), "apps/server/.env"), resolve(process.cwd(), ".env")],
    override: true,
  });

  if (!process.env.GROQ_API_KEY) {
    console.warn("[GROQ] skipped: GROQ_API_KEY is missing");
    return false;
  }
  const today = todayKey();
  if (usageDay !== today) {
    usageDay = today;
    usageCount = 0;
  }
  if (usageCount >= LOCAL_DAILY_CAP) {
    console.warn(`[GROQ] skipped: local daily cap reached (${LOCAL_DAILY_CAP})`);
    return false;
  }
  return true;
}

function cacheKey(word: string, requestedCategory: Category): string {
  return `${requestedCategory}:${normalize(word)}`;
}

function getCached(word: string, requestedCategory: Category): GroqValidationResult | null {
  const hit = cache.get(cacheKey(word, requestedCategory));
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    cache.delete(cacheKey(word, requestedCategory));
    return null;
  }
  console.info(`[GROQ] cache hit: ${requestedCategory}:${normalize(word)}`);
  return hit.result;
}

function setCached(word: string, requestedCategory: Category, result: GroqValidationResult): void {
  cache.set(cacheKey(word, requestedCategory), {
    expiresAt: Date.now() + CACHE_TTL_MS,
    result,
  });
}

export async function validateWordWithGroq(word: string, requestedCategory: Category): Promise<GroqValidationResult | null> {
  const normalized = normalize(word);
  if (!normalized) {
    console.warn("[GROQ] skipped: empty normalized word");
    return null;
  }

  const cached = getCached(normalized, requestedCategory);
  if (cached) return cached;
  if (!canUseGroq()) return null;

  usageCount += 1;
  console.info(`[GROQ] request #${usageCount}: category=${requestedCategory} word=${normalized} model=${GROQ_MODEL}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GROQ_TIMEOUT_MS);

  try {
    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0,
        reasoning_effort: "low",
        max_completion_tokens: 512,
        messages: [
          {
            role: "system",
            content:
              "You are the final validator for an Arabic word game. Classify the supplied Arabic word into exactly one category: human, animal, plant, object, or country. Accept established Arabic words and names even when they do not have a Wikipedia page. Do not invent facts for arbitrary strings. Human includes recognized personal/given names. Animal includes recognized animal/common species names. Plant includes recognized plant/tree/fruit/vegetable names. Object includes tangible objects, tools, devices, buildings, materials, foods, and similar things. Country includes sovereign states and commonly recognized country names. Return strict JSON only.",
          },
          {
            role: "user",
            content: `Arabic word: ${word}\nRequested category: ${requestedCategory}\nClassify the word and decide whether it reasonably belongs to the requested category.`,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "arabic_word_validation",
            strict: true,
            schema: {
              type: "object",
              properties: {
                valid: { type: "boolean" },
                category: { type: "string", enum: CATEGORIES },
                confidence: { type: "number" },
                reason: { type: "string" },
              },
              required: ["valid", "category", "confidence", "reason"],
              additionalProperties: false,
            },
          },
        },
      }),
    });

    if (!response.ok) {
      const retryAfter = response.headers.get("retry-after");
      const requestId = response.headers.get("x-request-id");
      const errorBody = await response.text();
      console.error(
        `[GROQ] HTTP ${response.status} ${response.statusText || ""}`.trim(),
        JSON.stringify({ retryAfter, requestId }),
      );
      console.error("[GROQ] error body:", errorBody || "<empty>");
      return null;
    }

    console.info(`[GROQ] HTTP ${response.status} OK`);

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      console.error("[GROQ] invalid response: missing choices[0].message.content");
      return null;
    }

    const parsed = JSON.parse(content) as {
      valid?: boolean;
      category?: Category;
      confidence?: number;
      reason?: string;
    };

    if (
      typeof parsed.valid !== "boolean" ||
      !parsed.category ||
      !CATEGORIES.includes(parsed.category) ||
      typeof parsed.confidence !== "number"
    ) {
      console.error("[GROQ] invalid response schema");
      return null;
    }

    const result: GroqValidationResult = {
      valid: parsed.valid,
      category: parsed.category,
      confidence: Math.max(0, Math.min(1, parsed.confidence)),
      reason: parsed.reason?.trim() || "ai_validation",
      source: "groq-ai",
    };
    console.info(
      `[GROQ] result: valid=${result.valid} category=${result.category} confidence=${result.confidence} reason=${result.reason}`,
    );
    setCached(normalized, requestedCategory, result);
    return result;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      console.error(`[GROQ] timeout after ${GROQ_TIMEOUT_MS}ms`);
    } else {
      console.error("[GROQ] request failed:", error instanceof Error ? error.message : String(error));
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
