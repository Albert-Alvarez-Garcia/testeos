import json
import os
from fastapi import APIRouter, HTTPException, Query, Header
from typing import Optional
from backend.services import search_cards_by_substring, get_user_by_username_or_email
from backend.database import get_db_connection

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


@router.get("/ownership/{scryfall_id}")
def get_card_ownership(
    scryfall_id: str,
    x_username: str = Header(None)
):
    """
    Comprueba si el usuario posee copias de una carta y en qué contenedores.
    """

    if not x_username:
        raise HTTPException(
            status_code=401,
            detail="No se ha proporcionado el usuario en la cabecera X-Username."
        )

    user = get_user_by_username_or_email(x_username)

    if not user:
        raise HTTPException(
            status_code=401,
            detail="Usuario no encontrado en la base de datos."
        )

    user_id = user["id"]

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("""
            SELECT
                COUNT(cc.id) AS quantity,
                COUNT(DISTINCT cc.container_id) AS container_count
            FROM card_copies cc
            JOIN printings p ON cc.printing_id = p.id
            JOIN cards c ON p.card_id = c.id
            JOIN containers co ON cc.container_id = co.id
            WHERE c.scryfall_id::text = %s
              AND co.user_id = %s;
        """, (scryfall_id, user_id))

        ownership = cursor.fetchone()

        quantity = int(ownership["quantity"]) if ownership else 0

        cursor.execute("""
            SELECT
                co.id AS container_id,
                co.name AS container_name,
                COUNT(cc.id) AS quantity
            FROM card_copies cc
            JOIN printings p ON cc.printing_id = p.id
            JOIN cards c ON p.card_id = c.id
            JOIN containers co ON cc.container_id = co.id
            WHERE c.scryfall_id::text = %s
              AND co.user_id = %s
            GROUP BY co.id, co.name
            ORDER BY co.name ASC;
        """, (scryfall_id, user_id))

        containers = cursor.fetchall()

        return {
            "owned": quantity > 0,
            "quantity": quantity,
            "containers": [dict(container) for container in containers]
        }

    except Exception as e:
        print(f"❌ Error comprobando propiedad de carta: {e}")
        raise HTTPException(
            status_code=500,
            detail="Error interno al comprobar la propiedad de la carta."
        )

    finally:
        cursor.close()
        conn.close()