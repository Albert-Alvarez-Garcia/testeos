from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from backend.services import search_cards_by_substring  # <--- Solo importamos lo que realmente existe

router = APIRouter(prefix="/api/cards", tags=["cards"])

@router.get("/filter")
def filter_cards(
    name: Optional[str] = Query(None, description="Filtrar por nombre de la carta"),
    type_line: Optional[str] = Query(None, description="Filtrar por tipo"),
    rarity: Optional[str] = Query(None, description="Filtrar por rareza")
):
    if not name or len(name.strip()) < 2:
        return []

    # Búsqueda por subcadena (con rescate automático en Scryfall)
    cards = search_cards_by_substring(name.strip())
    
    if not cards:
        raise HTTPException(status_code=404, detail=f"No se ha encontrado ninguna carta que coincida con '{name}'.")

    return cards