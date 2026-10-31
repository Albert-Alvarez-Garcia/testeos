#!/usr/bin/env python3
"""Safely install the external emergency catalog archive into ignored data/."""

from __future__ import annotations

import shutil
import sys
import zipfile
import gzip
import json
from pathlib import Path, PurePosixPath


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
MAX_UNPACKED = 250 * 1024 * 1024


def main() -> int:
    if len(sys.argv) != 2:
        print("Uso: python3 tools/install_emergency_catalog.py /ruta/al/card-binder-emergency.zip", file=sys.stderr)
        return 2
    archive_path = Path(sys.argv[1]).expanduser().resolve()
    if not archive_path.is_file():
        print(f"No existe el ZIP: {archive_path}", file=sys.stderr)
        return 1

    with zipfile.ZipFile(archive_path) as archive:
        files = [item for item in archive.infolist() if not item.is_dir()]
        names = {item.filename for item in files}
        if "default-cards.jsonl.gz" not in names:
            raise RuntimeError("El ZIP debe incluir default-cards.jsonl.gz en su raíz.")
        image_names = [name for name in names if name.startswith("emergency-images/")]
        if not 200 <= len(image_names) <= 300:
            raise RuntimeError(f"Se esperaban entre 200 y 300 imágenes, encontré {len(image_names)}.")
        total = sum(item.file_size for item in files)
        if total > MAX_UNPACKED:
            raise RuntimeError(f"El contenido descomprimido supera el límite de 250 MiB ({total / 1024 / 1024:.1f} MiB).")

        for item in files:
            path = PurePosixPath(item.filename)
            if path.is_absolute() or ".." in path.parts or len(path.parts) != (2 if path.parts[0] == "emergency-images" else 1):
                raise RuntimeError(f"Ruta no permitida en el ZIP: {item.filename}")
            if path.parts[0] == "emergency-images" and path.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"}:
                raise RuntimeError(f"Extensión de imagen no permitida: {item.filename}")

        image_files = {PurePosixPath(name).name for name in image_names}
        expected_images = set()
        with archive.open("default-cards.jsonl.gz") as compressed:
            with gzip.GzipFile(fileobj=compressed, mode="rb") as records:
                for raw_line in records:
                    card = json.loads(raw_line)
                    uri = card.get("image_uris", {}).get("normal", "")
                    expected = f"/emergency-cards/{card.get('id')}.jpg"
                    if uri != expected:
                        raise RuntimeError(f"URL local inesperada en carta {card.get('name', 'desconocida')}.")
                    expected_images.add(f"{card['id']}.jpg")
        if len(expected_images) != 300 or expected_images != image_files:
            raise RuntimeError("El ZIP no contiene exactamente las 300 imágenes referenciadas por el catálogo.")

        emergency = DATA / "emergency"
        # Use a new path rather than one Docker may already have created as root
        # during a previous failed startup with a bind mount.
        images = DATA / "emergency-assets"
        emergency.mkdir(parents=True, exist_ok=True)
        images.mkdir(parents=True, exist_ok=True)
        with archive.open("default-cards.jsonl.gz") as source, (emergency / "default-cards.jsonl.gz").open("wb") as target:
            shutil.copyfileobj(source, target)
        for name in image_names:
            destination = images / PurePosixPath(name).name
            with archive.open(name) as source, destination.open("wb") as target:
                shutil.copyfileobj(source, target)

    print(f"Catálogo instalado: {len(image_names)} imágenes locales y {emergency / 'default-cards.jsonl.gz'}.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, zipfile.BadZipFile, RuntimeError) as exc:
        print(f"Error instalando el catálogo de emergencia: {exc}", file=sys.stderr)
        raise SystemExit(1)
