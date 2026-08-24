import type { Category } from "@game/game-engine";

export interface GeneratedEntry {
  word: string;
  category: Category;
  confidence: number;
}

// Regenerated locally with: npm run validation:build-index
export const GAME_INDEX_ENTRIES: readonly GeneratedEntry[] = [];
export const GAME_INDEX_COUNT = 0;
