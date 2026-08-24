import dotenv from "dotenv";
import { resolve } from "node:path";
import type { Category } from "@game/game-engine";

export interface GeminiValidationResult {
  valid: boolean;
  category: Category;
  confidence: number;
  reason: string;
  source: "gemini-ai";
}

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-3.1-flash-lite";
const GEMINI_TIMEOUT_MS = 5000;
const LOCAL_DAILY_CAP = 300;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CATEGORIES: readonly Category[] = ["human", "animal", "plant", "object", "country"];

const cache = new Map<string, { expiresAt: number; result: GeminiValidationResult }>();
let usageDay = "";
let usageCount = 0;

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

function cacheKey(word: string, requestedCategory: Category): string {
  return `${requestedCategory}:${normalize(word)}`;
}

function canUseGemini(): boolean {
  // Load the server env at request time so this module does not depend on
  // ESM/CommonJS import ordering during `npm --workspace ... run dev`.
  dotenv.config({
    path: [resolve(process.cwd(), "apps/server/.env"), resolve(process.cwd(), ".env")],
    override: true,
  });

  if (!process.env.GEMINI_API_KEY) {
    console.warn("[GEMINI] skipped: GEMINI_API_KEY is missing");
    return false;
  }

  const today = todayKey();
  if (usageDay !== today) {
    usageDay = today;
    usageCount = 0;
  }

  if (usageCount >= LOCAL_DAILY_CAP) {
    console.warn(`[GEMINI] skipped: local daily cap reached (${LOCAL_DAILY_CAP})`);
    return false;
  }

  return true;
}

export async function validateWordWithGemini(
  word: string,
  requestedCategory: Category,
): Promise<GeminiValidationResult | null> {
  const normalized = normalize(word);
  if (!normalized) return null;

  const cached = cache.get(cacheKey(normalized, requestedCategory));
  if (cached && cached.expiresAt >= Date.now()) {
    console.info(`[GEMINI] cache hit: ${requestedCategory}:${normalized}`);
    return cached.result;
  }
  if (cached) cache.delete(cacheKey(normalized, requestedCategory));

  if (!canUseGemini()) return null;

  usageCount += 1;
  console.info(`[GEMINI] request #${usageCount}: category=${requestedCategory} word=${normalized} model=${GEMINI_MODEL}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${GEMINI_API_URL}/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY!)}`,
      {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: {
            parts: [
              {
                text:
                  "You are the final validator for an Arabic word game. Classify the supplied Arabic word into exactly one category: human, animal, plant, object, or country. Accept established Arabic words and recognized personal names. Do not invent facts for arbitrary strings. Return only the requested JSON structure.",
              },
            ],
          },
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: `Arabic word: ${word}\nRequested category: ${requestedCategory}\nDecide whether the word reasonably belongs to the requested category.`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
            responseSchema: {
              type: "object",
              properties: {
                valid: { type: "boolean" },
                category: { type: "string", enum: CATEGORIES },
                confidence: { type: "number", minimum: 0, maximum: 1 },
                reason: { type: "string" },
              },
              required: ["valid", "category", "confidence", "reason"],
              additionalProperties: false,
            },
          },
        }),
      },
    );

    if (!response.ok) {
      let body = "";
      try {
        body = await response.text();
      } catch {
        body = "<unreadable>";
      }
      console.error(`[GEMINI] HTTP ${response.status} ${response.statusText || ""}`.trim());
      console.error(`[GEMINI] error body: ${body}`);
      return null;
    }

    console.info(`[GEMINI] HTTP ${response.status} OK`);

    const payload = (await response.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };
    const content = payload.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) {
      console.error("[GEMINI] invalid response: missing candidate text");
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
      console.error("[GEMINI] invalid response schema");
      return null;
    }

    const result: GeminiValidationResult = {
      valid: parsed.valid,
      category: parsed.category,
      confidence: Math.max(0, Math.min(1, parsed.confidence)),
      reason: parsed.reason?.trim() || "ai_validation",
      source: "gemini-ai",
    };

    console.info(
      `[GEMINI] result: valid=${result.valid} category=${result.category} confidence=${result.confidence} reason=${result.reason}`,
    );

    cache.set(cacheKey(normalized, requestedCategory), {
      expiresAt: Date.now() + CACHE_TTL_MS,
      result,
    });

    return result;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      console.error(`[GEMINI] timeout after ${GEMINI_TIMEOUT_MS}ms`);
    } else {
      console.error("[GEMINI] request failed:", error instanceof Error ? error.message : String(error));
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
