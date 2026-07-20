import json
import os
from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from backend.services import search_cards_by_substring

router = APIRouter(prefix="/api/cards", tags=["cards"])


@router.get("/filter")
def filter_cards(
    name: Optional[str] = Query(None, description="Filtrar por nombre de la carta"),
    type_line: Optional[str] = Query(None, description="Filtrar por tipo"),
    rarity: Optional[str] = Query(None, description="Filtrar por rareza")
):
    # Normalizamos los parámetros
    name = name.strip() if name else ""
    type_line = type_line.strip() if type_line else None

    # Si no hay ningún filtro, no hacemos la búsqueda
    if not name and not type_line:
        return []

    # Buscamos usando nombre (aunque esté vacío) y/o tipo
    cards = search_cards_by_substring(name, type_line)

    if not cards:
        filtros = []

        if name:
            filtros.append(f"nombre '{name}'")
        if type_line:
            filtros.append(f"tipo '{type_line}'")

        raise HTTPException(
            status_code=404,
            detail=f"No se ha encontrado ninguna carta para {' y '.join(filtros)}."
        )

    return cards


@router.get("/types-taxonomy")
def get_types_taxonomy():
    """Devuelve la taxonomía limpia de macro-categorías y subtipos para los filtros."""
    json_path = "clean_card_types.json"

    if not os.path.exists(json_path):
        return {}

    with open(json_path, "r", encoding="utf-8") as f:
        return json.load(f)