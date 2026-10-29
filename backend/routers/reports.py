"""
reports.py · Informe de colección del usuario.

    GET /api/reports/collection         Listado agrupado por carta (paginado, filtrado y ordenado en servidor)
        Filtros: q, type_line, subtype, container_id

Se identifica al usuario igual que en el resto de la API: cabecera X-Username.
"""
import math
import re
import uuid
from typing import Dict, List, Optional

from fastapi import APIRouter, Header, HTTPException, Query

from backend.database import get_db_connection
from backend.services import get_user_by_username_or_email
from fastapi import Depends
from backend.security import session_username

router = APIRouter(prefix="/api/reports", tags=["Reports"])

CARD_TYPES_SQL = "regexp_replace(COALESCE(c.type_line, ''), '—[^/]*', '', 'g')"

SORT_COLUMNS = {
    "name": "name_key",
    "type": "card_type",
    "copies": "copies",
    "printings": "printings",
    "containers": "containers_count",
    "added": "last_added",
}

MAX_SEARCH_TERMS = 8


def _like(term: str) -> str:
    escaped = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def _natural_key(value: Optional[str]):
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", value or "")]


def _search_clause(q: Optional[str], type_line: Optional[str] = None, subtype: Optional[str] = None):
    """Condiciones sobre la carta (CTE raw). Mismo criterio que el filtro del visor admin:
    el tipo y el subtipo se buscan dentro de type_line."""
    parts, params = [], []
    for term in (q or "").split()[:MAX_SEARCH_TERMS]:
        parts.append("(name ILIKE %s OR set_name ILIKE %s OR type_line ILIKE %s)")
        params.extend([_like(term)] * 3)
    for value in (type_line, subtype):
        if value and value.strip():
            parts.append("type_line ILIKE %s")
            params.append(_like(value.strip()))
    if not parts:
        return "TRUE", []
    return " AND ".join(parts), params


def _get_user_id_from_header(x_username: str) -> str:
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
    return user["id"]


@router.get("/collection")
def collection_report(
    q: Optional[str] = Query(None, max_length=100, description="Búsqueda por nombre, set o tipo"),
    type_line: Optional[str] = Query(None, max_length=60, description="Tipo de carta (Creature, Land...)"),
    subtype: Optional[str] = Query(None, max_length=60, description="Subtipo (Elf, Aura...)"),
    container_id: Optional[str] = Query(None, description="Solo copias de este contenedor"),
    sort: str = Query("name", description="name | type | copies | printings | containers | added"),
    direction: str = Query("asc", alias="dir", description="asc | desc"),
    page: int = Query(1, ge=1),
    page_size: int = Query(24, ge=1, le=100),
    x_username: str = Depends(session_username),
):
    if sort not in SORT_COLUMNS:
        raise HTTPException(status_code=400, detail=f"Campo de ordenación no válido: {sort}.")
    if direction not in ("asc", "desc"):
        raise HTTPException(status_code=400, detail="La dirección debe ser asc o desc.")
    user_id = _get_user_id_from_header(x_username)

    raw_where = "co.user_id = %s"
    raw_params: list = [user_id]

    container_id = (container_id or "").strip() or None
    if container_id:
        try:
            uuid.UUID(container_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="El identificador de contenedor no es válido.")
        raw_where += " AND co.id = %s"
        raw_params.append(container_id)

    search_where, search_params = _search_clause(q, type_line, subtype)

    cte = f"""
        WITH raw AS (
            SELECT cc.id AS copy_id, cc.container_id, cc.printing_id, cc.is_foil, cc.created_at,
                   LOWER(c.name) AS name_key, c.name, c.mana_cost, c.type_line, c.oracle_text,
                   p.set_name,
                   {CARD_TYPES_SQL} AS card_types
            FROM card_copies cc
            JOIN containers co ON co.id = cc.container_id
            JOIN printings p ON p.id = cc.printing_id
            JOIN cards c ON c.id = p.card_id
            WHERE {raw_where}
        ),
        matched AS (
            SELECT DISTINCT name_key FROM raw WHERE {search_where}
        ),
        base AS (
            SELECT raw.* FROM raw
            WHERE name_key IN (SELECT name_key FROM matched)
        )
    """
    cte_params = raw_params + search_params

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            cte + "SELECT COUNT(DISTINCT name_key) AS total_cards, COUNT(*) AS total_copies FROM base;",
            tuple(cte_params),
        )
        totals = cursor.fetchone() or {}
        total_cards = int(totals.get("total_cards") or 0)
        total_copies = int(totals.get("total_copies") or 0)

        total_pages = max(1, math.ceil(total_cards / page_size))
        page = min(page, total_pages)

        items: List[dict] = []
        if total_cards:
            order_col = SORT_COLUMNS[sort]
            cursor.execute(
                cte + f"""
                SELECT name_key,
                       MIN(name)               AS card_name,
                       MIN(mana_cost)          AS mana_cost,
                       MIN(type_line)          AS card_type,
                       MIN(oracle_text)        AS oracle_text,
                       COUNT(*)                AS copies,
                       COUNT(DISTINCT printing_id)  AS printings,
                       COUNT(DISTINCT container_id) AS containers_count,
                       MAX(created_at)         AS last_added
                FROM base
                GROUP BY name_key
                ORDER BY {order_col} {direction.upper()} NULLS LAST, name_key ASC
                LIMIT %s OFFSET %s;
                """,
                tuple(cte_params + [page_size, (page - 1) * page_size]),
            )
            card_rows = cursor.fetchall()

            by_key: Dict[str, dict] = {}
            for row in card_rows:
                card = {
                    "name": row["card_name"],
                    "mana_cost": row["mana_cost"] or "",
                    "type_line": row["card_type"] or "",
                    "oracle_text": row["oracle_text"] or "",
                    "copies": int(row["copies"]),
                    "printings_count": int(row["printings"]),
                    "containers_count": int(row["containers_count"]),
                    "last_added": row["last_added"],
                    "printings": [],
                    "containers": [],
                    "_prints": {},
                    "_containers": {},
                }
                by_key[row["name_key"]] = card
                items.append(card)

            detail_container = " AND co.id = %s" if container_id else ""
            detail_sql = f"""
                SELECT LOWER(c.name) AS name_key,
                       p.id AS printing_uuid, p.scryfall_printing_id, p.set_code, p.set_name,
                       p.collector_number, p.rarity, p.image_uri,
                       co.id AS container_id, co.name AS container_name, co.type AS container_type,
                       COUNT(cc.id) AS qty,
                       COUNT(*) FILTER (WHERE cc.is_foil) AS foil_qty
                FROM card_copies cc
                JOIN containers co ON co.id = cc.container_id
                JOIN printings p ON p.id = cc.printing_id
                JOIN cards c ON c.id = p.card_id
                WHERE co.user_id = %s AND LOWER(c.name) = ANY(%s){detail_container}
                GROUP BY LOWER(c.name), p.id, p.scryfall_printing_id, p.set_code, p.set_name,
                         p.collector_number, p.rarity, p.image_uri, co.id, co.name, co.type;
            """
            detail_params: list = [user_id, list(by_key.keys())]
            if container_id:
                detail_params.append(container_id)
            cursor.execute(detail_sql, tuple(detail_params))

            for row in cursor.fetchall():
                card = by_key.get(row["name_key"])
                if card is None:
                    continue
                qty = int(row["qty"])
                foil = int(row["foil_qty"])
                container = {
                    "id": str(row["container_id"]),
                    "name": row["container_name"],
                    "type": row["container_type"],
                    "quantity": qty,
                }

                printing_key = str(row["printing_uuid"])
                printing = card["_prints"].get(printing_key)
                if printing is None:
                    printing = {
                        "printing_id": row["scryfall_printing_id"],
                        "set_code": row["set_code"],
                        "set_name": row["set_name"],
                        "collector_number": row["collector_number"],
                        "rarity": row["rarity"],
                        "image_uri": row["image_uri"] or "",
                        "quantity": 0,
                        "foil_quantity": 0,
                        "containers": [],
                    }
                    card["_prints"][printing_key] = printing
                printing["quantity"] += qty
                printing["foil_quantity"] += foil
                printing["containers"].append(container)

                agg = card["_containers"].get(container["id"])
                if agg is None:
                    card["_containers"][container["id"]] = dict(container)
                else:
                    agg["quantity"] += qty

            for card in items:
                prints = list(card.pop("_prints").values())
                prints.sort(key=lambda p: ((p["set_name"] or "").lower(), _natural_key(p["collector_number"])))
                for p in prints:
                    p["containers"].sort(key=lambda c: c["name"].lower())
                card["printings"] = prints
                card["containers"] = sorted(card.pop("_containers").values(), key=lambda c: c["name"].lower())

        return {
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages,
            "total_cards": total_cards,
            "total_copies": total_copies,
            "sort": sort,
            "dir": direction,
            "items": items,
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error generando el informe de colección: {e}")
        raise HTTPException(status_code=500, detail="Error interno al generar el informe de colección.")
    finally:
        cursor.close()
        conn.close()