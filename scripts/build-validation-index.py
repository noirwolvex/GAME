from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CAMEL_PROMOTED_SOURCE = ROOT / "data" / "validation" / "camel-promoted-index.json"
REVIEW_SOURCE = ROOT / "data" / "validation" / "review-master-index.json"
ELNER_SOURCE = ROOT / "data" / "validation" / "elner-master-index.json"
BASE_SOURCE = ROOT / "data" / "validation" / "master-index.json"
OUTPUT = ROOT / "packages" / "validation" / "src" / "game-index.generated.ts"
CATEGORIES = {"human", "animal", "plant", "object", "country"}


def choose_source() -> Path:
    # Prefer the most complete merged layer that exists locally.
    for candidate in (CAMEL_PROMOTED_SOURCE, REVIEW_SOURCE, ELNER_SOURCE, BASE_SOURCE):
        if candidate.exists():
            return candidate
    raise SystemExit("Missing validation index. Run: npm run validation:merge")


def main() -> int:
    source = choose_source()
    payload = json.loads(source.read_text(encoding="utf-8"))
    entries = payload.get("entries", {})

    generated = []
    for word, item in entries.items():
        category = item.get("category")
        confidence = item.get("confidence", 0)
        if category not in CATEGORIES:
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
        f"// Generated from {source.relative_to(ROOT).as_posix()}.",
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
    print(f"Source: {source.relative_to(ROOT)}")
    print(f"Done: {OUTPUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
