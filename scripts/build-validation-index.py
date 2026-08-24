from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data" / "arabic-wordnet" / "game-index.json"
OUTPUT = ROOT / "packages" / "validation" / "src" / "game-index.generated.ts"


def main() -> int:
    if not SOURCE.exists():
        raise SystemExit(
            f"Missing {SOURCE}. Run: npm run validation:awn:classify"
        )

    payload = json.loads(SOURCE.read_text(encoding="utf-8"))
    entries = payload.get("entries", {})

    generated = []
    for word, item in entries.items():
        category = item.get("category")
        confidence = item.get("confidence", 0)
        if category not in {"human", "animal", "plant", "object", "country"}:
            continue
        generated.append({
            "word": word,
            "category": category,
            "confidence": confidence,
        })

    generated.sort(key=lambda item: (item["category"], item["word"]))

    lines = [
        'import type { Category } from "@game/game-engine";',
        "",
        "export interface GeneratedEntry {",
        "  word: string;",
        "  category: Category;",
        "  confidence: number;",
        "}",
        "",
        "// Generated locally from data/arabic-wordnet/game-index.json.",
        "// Do not edit by hand. Regenerate with: npm run validation:build-index",
        "export const GAME_INDEX_ENTRIES: readonly GeneratedEntry[] = [",
    ]

    for item in generated:
        word = json.dumps(item["word"], ensure_ascii=False)
        category = json.dumps(item["category"])
        confidence = f"{float(item['confidence']):.3f}"
        lines.append(
            f"  {{ word: {word}, category: {category} as Category, confidence: {confidence} }},"
        )

    lines.extend([
        "];",
        f"export const GAME_INDEX_COUNT = {len(generated)};",
        "",
    ])

    OUTPUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"Generated {len(generated):,} GAME validation entries")
    print(f"Done: {OUTPUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
