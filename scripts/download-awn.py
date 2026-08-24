from __future__ import annotations

import gzip
import json
import re
import sys
import urllib.request
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data" / "arabic-wordnet"
RAW_FILE = DATA_DIR / "awn4.xml.gz"
INDEX_FILE = DATA_DIR / "index.json"
URL = "https://github.com/Salah-Sal/arabic-wordnet-v4/releases/download/v4.1.0/awn4.xml.gz"


def normalize(value: str) -> str:
    value = re.sub(r"[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06EDـ]", "", value)
    value = value.strip().lower()
    value = re.sub(r"[إأآٱ]", "ا", value)
    value = value.replace("ى", "ي").replace("ؤ", "و").replace("ئ", "ي")
    return re.sub(r"\s+", " ", value)


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def download() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if RAW_FILE.exists():
        return
    print(f"Downloading Arabic WordNet 4.1.0 from {URL}")
    request = urllib.request.Request(
        URL,
        headers={"User-Agent": "GAME-validation/0.2"},
    )
    with urllib.request.urlopen(request, timeout=120) as response, RAW_FILE.open("wb") as out:
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            out.write(chunk)


def build_index() -> None:
    print("Building compact Arabic WordNet lookup index...")

    # WN-LMF stores words under <LexicalEntry>/<Lemma> and connects them to
    # synsets through <Sense synset="...">. Definitions and POS live on
    # <Synset>. The previous parser incorrectly expected <lemma> children
    # inside <Synset>, which produced an empty index.
    synsets: dict[str, dict[str, object]] = {}
    synset_count = 0

    with gzip.open(RAW_FILE, "rb") as handle:
        for event, elem in ET.iterparse(handle, events=("end",)):
            if local_name(elem.tag) != "Synset":
                continue

            synset_id = elem.attrib.get("id", "")
            if synset_id:
                definition = ""
                for child in elem:
                    if local_name(child.tag) == "Definition":
                        text = "".join(child.itertext()).strip()
                        if text:
                            definition = normalize(text)
                            break

                synsets[synset_id] = {
                    "pos": elem.attrib.get("partOfSpeech", ""),
                    "definition": definition,
                }
                synset_count += 1

            elem.clear()

    entries: dict[str, dict[str, object]] = {}

    with gzip.open(RAW_FILE, "rb") as handle:
        for event, elem in ET.iterparse(handle, events=("end",)):
            if local_name(elem.tag) != "LexicalEntry":
                continue

            lemma_value = ""
            pos = ""
            senses: list[str] = []

            for child in elem:
                child_name = local_name(child.tag)
                if child_name == "Lemma":
                    lemma_value = child.attrib.get("writtenForm", "") or "".join(child.itertext())
                    pos = child.attrib.get("partOfSpeech", "")
                elif child_name == "Sense":
                    synset_id = child.attrib.get("synset", "")
                    if synset_id:
                        senses.append(synset_id)

            lemma = normalize(lemma_value)
            if lemma and senses:
                bucket = entries.setdefault(
                    lemma,
                    {"synsets": [], "pos": [], "definitions": []},
                )

                for synset_id in senses:
                    if synset_id not in bucket["synsets"]:
                        bucket["synsets"].append(synset_id)

                    meta = synsets.get(synset_id)
                    if not meta:
                        continue

                    synset_pos = str(meta.get("pos", ""))
                    if synset_pos and synset_pos not in bucket["pos"]:
                        bucket["pos"].append(synset_pos)

                    definition = str(meta.get("definition", ""))
                    if definition and definition not in bucket["definitions"]:
                        bucket["definitions"].append(definition)

                # Preserve lexical-entry POS when present.
                if pos and pos not in bucket["pos"]:
                    bucket["pos"].append(pos)

            elem.clear()

    payload = {
        "source": "Arabic WordNet 4.1.0",
        "source_url": "https://github.com/Salah-Sal/arabic-wordnet-v4/releases/tag/v4.1.0",
        "license": "CC BY 4.0",
        "language": "arb",
        "synsets": synset_count,
        "words": len(entries),
        "entries": entries,
    }
    INDEX_FILE.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"Indexed {len(entries):,} Arabic lemmas from {synset_count:,} synsets")


def main() -> int:
    try:
        download()
        build_index()
        print(f"Done: {INDEX_FILE}")
        return 0
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
