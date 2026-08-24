from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data" / "arabic-wordnet" / "game-index.json"
OUTPUT = ROOT / "packages" / "validation" / "src" / "game-index.generated.ts"


def js_string(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def main() -> int:
    if not SOURCE.exists():
        raise SystemExit(f"Missing {SOURCE}. Run: npm run validation:awn:classify")

    payload = json.loads(SOURCE.read_text(encoding="utf-8"))
    entries = payload.get("entries", {})

    lines = [
        "import type { Category } from \"@game/game-engine\";",
        "",
        "export interface GeneratedEntry { word: string; category: Category; confidence: number; }",
        "",
        "export const GAME_INDEX_ENTRIES: readonly GeneratedEntry[] = [",
    ]

    for word, entry in sorted(entries.items()):
        category = entry.get("category")
        confidence = entry.get("confidence", 0)
        if category not in {"human", "animal", "plant", "object", "country"}:
            continue
        lines.append(
            f"  {{ word: {js_string(word)}, category: {js_string(category)}, confidence: {float(confidence):.3f} }},"
        )

    lines.extend([
        "];",
        "",
        f"export const GAME_INDEX_COUNT = {len(entries)};",
        "",
    ])

    OUTPUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"Generated {len(entries):,} GAME validation entries")
    print(f"Done: {OUTPUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
