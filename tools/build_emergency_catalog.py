#!/usr/bin/env python3
"""Build an external ZIP with 300 representative cards and their local images."""

from __future__ import annotations

import concurrent.futures
import gzip
import json
import random
import sys
import tempfile
import time
import os
import urllib.request
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data/default-cards.jsonl.gz"
OUTPUT = Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else Path("/tmp/card-binder-emergency.zip")
QUOTAS = {
    "creature": 105,
    "instant": 30,
    "sorcery": 30,
    "artifact": 25,
    "enchantment": 25,
    "land": 35,
    "planeswalker": 15,
    "other": 35,
}
MAX_ZIP_BYTES = 250 * 1024 * 1024
IMAGE_CACHE = OUTPUT.parent / "card-binder-emergency-images"


def category(type_line: str) -> str:
    lower = type_line.lower()
    for kind in ("creature", "instant", "sorcery", "artifact", "enchantment", "land", "planeswalker"):
        if kind in lower:
            return kind
    return "other"


def select_cards() -> list[dict]:
    if not SOURCE.is_file():
        raise RuntimeError(f"No existe {SOURCE}; ejecuta primero make download.")
    rng = random.Random(42042)
    reservoirs = {key: [] for key in QUOTAS}
    category_counts = dict.fromkeys(QUOTAS, 0)
    seen_oracles: set[str] = set()
    scanned = 0
    with gzip.open(SOURCE, "rt", encoding="utf-8") as source:
        for line in source:
            scanned += 1
            try:
                card = json.loads(line)
            except json.JSONDecodeError:
                continue
            if card.get("lang") != "en" or card.get("layout") in {"token", "art_series", "scheme", "vanguard", "planar", "phenomenon", "conspiracy"}:
                continue
            images = card.get("image_uris")
            image_url = images.get("normal") if images else None
            oracle_id = card.get("oracle_id") or card.get("id")
            if not image_url or not oracle_id or oracle_id in seen_oracles:
                continue
            seen_oracles.add(oracle_id)
            kind = category(card.get("type_line", ""))
            bucket = reservoirs[kind]
            quota = QUOTAS[kind]
            category_counts[kind] += 1
            if len(bucket) < quota:
                bucket.append(card)
            else:
                pos = rng.randrange(category_counts[kind])
                if pos < quota:
                    bucket[pos] = card

    cards = [card for group in reservoirs.values() for card in group]
    if len(cards) != sum(QUOTAS.values()):
        counts = ", ".join(f"{key}: {len(reservoirs[key])}/{QUOTAS[key]}" for key in QUOTAS)
        raise RuntimeError(f"No se pudo seleccionar el catálogo completo ({len(cards)}/300). {counts}")
    rng.shuffle(cards)
    print(f"✔ Seleccionadas {len(cards)} cartas variadas entre {scanned:,} registros del bulk.")
    return cards


def download_image(card: dict, target: Path) -> None:
    if target.is_file() and target.stat().st_size > 0:
        return
    url = card["image_uris"]["normal"]
    request = urllib.request.Request(url, headers={"User-Agent": "CardBinderPro-EmergencyPack/1.0"})
    last_error = None
    for attempt in range(5):
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                if response.status != 200:
                    raise RuntimeError(f"HTTP {response.status} descargando {card['name']}")
                content_type = response.headers.get("Content-Type", "")
                if not content_type.startswith("image/"):
                    raise RuntimeError(f"Respuesta no válida para la imagen de {card['name']}: {content_type}")
                content = response.read(12 * 1024 * 1024 + 1)
            if not content or len(content) > 12 * 1024 * 1024:
                raise RuntimeError(f"Tamaño de imagen no válido para {card['name']}.")
            target.write_bytes(content)
            return
        except Exception as exc:
            last_error = exc
            if attempt < 4:
                time.sleep(1 + attempt)
    raise RuntimeError(f"No se pudo descargar {card['name']} ({url}): {last_error}")


def main() -> int:
    cards = select_cards()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    IMAGE_CACHE.mkdir(parents=True, exist_ok=True)
    print("⬇ Descargando imágenes de tamaño normal desde Scryfall...")
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        futures = []
        for card in cards:
            card_id = card["id"]
            futures.append(pool.submit(download_image, card, IMAGE_CACHE / f"{card_id}.jpg"))
        for index, future in enumerate(concurrent.futures.as_completed(futures), start=1):
            future.result()
            if index % 50 == 0 or index == len(futures):
                print(f"  {index}/{len(futures)} imágenes verificadas o descargadas")

    expected_images = {f"{card['id']}.jpg" for card in cards}
    cached_images = {path.name for path in IMAGE_CACHE.glob("*.jpg")}
    if cached_images != expected_images:
        raise RuntimeError("La caché de imágenes no coincide exactamente con las 300 cartas seleccionadas.")

    with tempfile.TemporaryDirectory(prefix="card-binder-emergency-meta-") as tmp:
        cards_file = Path(tmp) / "default-cards.jsonl.gz"
        with gzip.open(cards_file, "wt", encoding="utf-8") as output:
            for card in cards:
                card = dict(card)
                card["image_uris"] = {"normal": f"/emergency-cards/{card['id']}.jpg"}
                output.write(json.dumps(card, ensure_ascii=False, separators=(",", ":")) + "\n")

        temp_zip = OUTPUT.with_name(OUTPUT.name + ".tmp")
        temp_zip.unlink(missing_ok=True)
        with zipfile.ZipFile(temp_zip, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
            archive.write(cards_file, "default-cards.jsonl.gz")
            for image in sorted(IMAGE_CACHE.glob("*.jpg")):
                if image.stat().st_size == 0:
                    raise RuntimeError(f"Imagen descargada vacía: {image.name}")
                archive.write(image, f"emergency-images/{image.name}")
        size = temp_zip.stat().st_size
        if size > MAX_ZIP_BYTES:
            temp_zip.unlink()
            raise RuntimeError(f"El ZIP supera el límite de 250 MiB ({size / 1024 / 1024:.1f} MiB).")
        os.replace(temp_zip, OUTPUT)
    print(f"✔ ZIP creado: {OUTPUT} ({OUTPUT.stat().st_size / 1024 / 1024:.1f} MiB).")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"✘ No se pudo crear el catálogo: {exc}", file=sys.stderr)
        raise SystemExit(1)
