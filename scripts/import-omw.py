from __future__ import annotations

import json
import re
import tarfile
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data" / "omw"
ARCHIVE = DATA_DIR / "omw-arb-2.0.tar.xz"
OUTPUT = DATA_DIR / "arabic.json"
URL = "https://github.com/omwn/omw-data/releases/download/v2.0/omw-arb-2.0.tar.xz"


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def normalize(value: str) -> str:
    value = re.sub(r"[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06EDـ]", "", value)
    value = value.strip().lower()
    value = re.sub(r"[إأآٱ]", "ا", value)
    value = value.replace("ى", "ي").replace("ؤ", "و").replace("ئ", "ي")
    return re.sub(r"\s+", " ", value)


def download() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if ARCHIVE.exists():
        return
    print(f"Downloading OMW Arabic 2.0 from {URL}")
    request = urllib.request.Request(URL, headers={"User-Agent": "GAME-validation/0.1"})
    with urllib.request.urlopen(request, timeout=90) as response, ARCHIVE.open("wb") as out:
        out.write(response.read())


def find_xml() -> bytes:
    with tarfile.open(ARCHIVE, "r:xz") as archive:
        xml_members = [m for m in archive.getmembers() if m.name.endswith(".xml")]
        if not xml_members:
            raise RuntimeError("No XML file found in OMW Arabic archive")
        member = max(xml_members, key=lambda m: m.size)
        extracted = archive.extractfile(member)
        if extracted is None:
            raise RuntimeError(f"Unable to extract {member.name}")
        return extracted.read()


def build_index() -> None:
    xml_bytes = find_xml()
    root = ET.fromstring(xml_bytes)

    synset_ids: set[str] = set()
    sense_to_synset: dict[str, str] = {}
    entries: dict[str, dict[str, object]] = {}

    for element in root.iter():
        name = local_name(element.tag)
        if name == "Synset":
            synset_id = element.attrib.get("id", "")
            if synset_id:
                synset_ids.add(synset_id)
        elif name == "Sense":
            sense_id = element.attrib.get("id", "")
            synset_id = element.attrib.get("synset", "")
            if sense_id and synset_id:
                sense_to_synset[sense_id] = synset_id

    lexical_entries = 0
    lemma_count = 0

    for lexical_entry in root.iter():
        if local_name(lexical_entry.tag) != "LexicalEntry":
            continue
        lexical_entries += 1

        lemma = next((child for child in lexical_entry if local_name(child.tag) == "Lemma"), None)
        if lemma is None:
            continue

        written = lemma.attrib.get("writtenForm", "") or (lemma.text or "")
        word = normalize(written)
        if len(word) < 2:
            continue

        synsets_for_entry: list[str] = []
        for child in lexical_entry:
            if local_name(child.tag) != "Sense":
                continue
            sense_id = child.attrib.get("id", "")
            synset_id = child.attrib.get("synset", "") or sense_to_synset.get(sense_id, "")
            if synset_id and synset_id not in synsets_for_entry:
                synsets_for_entry.append(synset_id)

        item = entries.setdefault(
            word,
            {"synsets": [], "source": "omw-arb-2.0", "confidence": 0.84},
        )
        for synset_id in synsets_for_entry:
            if synset_id not in item["synsets"]:
                item["synsets"].append(synset_id)
        lemma_count += 1

    OUTPUT.write_text(
        json.dumps(
            {
                "source": "Open Multilingual Wordnet Arabic 2.0",
                "source_url": "https://github.com/omwn/omw-data/releases/tag/v2.0",
                "license": "Consult individual wordnet license; Arabic WordNet is CC BY-SA 3.0",
                "language": "arb",
                "synsets": len(synset_ids),
                "lexical_entries": lexical_entries,
                "lemma_occurrences": lemma_count,
                "words": len(entries),
                "entries": entries,
            },
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )
    print(
        f"Indexed {len(entries):,} Arabic OMW lemmas from {len(synset_ids):,} synsets"
    )
    print(f"Lexical entries: {lexical_entries:,}; lemma occurrences: {lemma_count:,}")
    print(f"Done: {OUTPUT}")


def main() -> int:
    download()
    build_index()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
