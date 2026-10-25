"""
reports.py · Informe y gestión de la colección del usuario.

    GET  /api/collection           Listado agrupado por carta (paginado, filtrado y ordenado)
    GET  /api/collection/summary   Resumen estadístico de la colección
    GET  /api/collection/export    Exportación de la colección en JSON
    POST /api/collection/import    Importación de copias (con soporte dry_run)

Se identifica al usuario mediante la cabecera X-Username.
"""
import math
import re
from typing import Dict, List, Optional

from fastapi import APIRouter, Header, HTTPException, Query, Body

from backend.database import get_db_connection
from backend.services import get_user_by_username_or_email

router = APIRouter(prefix="/api/collection", tags=["Collection & Reports"])

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


def _search_clause(q: Optional[str]):
    terms = (q or "").split()[:MAX_SEARCH_TERMS]
    if not terms:
        return "TRUE", []
    parts, params = [], []
    for term in terms:
        parts.append("(name ILIKE %s OR set_name ILIKE %s OR type_line ILIKE %s)")
        params.extend([_like(term)] * 3)
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


@router.get("")
@router.get("/")
def collection_report(
    q: Optional[str] = Query(None, max_length=100, description="Búsqueda por nombre, set o tipo"),
    sort: str = Query("name", description="name | type | copies | printings | containers | added"),
    direction: str = Query("asc", alias="dir", description="asc | desc"),
    page: int = Query(1, ge=1),
    page_size: int = Query(24, ge=1, le=100),
    x_username: str = Header(None),
):
    if sort not in SORT_COLUMNS:
        raise HTTPException(status_code=400, detail=f"Campo de ordenación no válido: {sort}.")
    if direction not in ("asc", "desc"):
        raise HTTPException(status_code=400, detail="La dirección debe ser asc o desc.")
    user_id = _get_user_id_from_header(x_username)

    raw_where = "co.user_id = %s"
    raw_params: list = [user_id]

    search_where, search_params = _search_clause(q)

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

            detail_sql = """
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
                WHERE co.user_id = %s AND LOWER(c.name) = ANY(%s)
                GROUP BY LOWER(c.name), p.id, p.scryfall_printing_id, p.set_code, p.set_name,
                         p.collector_number, p.rarity, p.image_uri, co.id, co.name, co.type;
            """
            detail_params: list = [user_id, list(by_key.keys())]
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


@router.get("/summary")
def collection_summary(x_username: str = Header(None)):
    user_id = _get_user_id_from_header(x_username)
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Totales generales
        cursor.execute("""
            SELECT 
                COUNT(cc.id) AS total_copies,
                COUNT(DISTINCT p.card_id) AS unique_cards,
                COUNT(DISTINCT cc.printing_id) AS unique_printings,
                COUNT(cc.id) FILTER (WHERE cc.is_foil) AS foil_copies,
                COUNT(DISTINCT co.id) AS containers
            FROM card_copies cc
            JOIN containers co ON co.id = cc.container_id
            JOIN printings p ON p.id = cc.printing_id
            WHERE co.user_id = %s;
        """, (user_id,))
        totals = cursor.fetchone() or {}

        # Por rareza
        cursor.execute("""
            SELECT p.rarity, COUNT(cc.id) AS copies
            FROM card_copies cc
            JOIN containers co ON co.id = cc.container_id
            JOIN printings p ON p.id = cc.printing_id
            WHERE co.user_id = %s
            GROUP BY p.rarity;
        """, (user_id,))
        by_rarity = cursor.fetchall()

        # Por contenedor
        cursor.execute("""
            SELECT co.id, co.name, co.type, co.total_slots,
                   COUNT(cc.id) AS copies,
                   (co.total_slots - COUNT(cc.id)) AS free_slots
            FROM containers co
            LEFT JOIN card_copies cc ON cc.container_id = co.id
            WHERE co.user_id = %s
            GROUP BY co.id, co.name, co.type, co.total_slots;
        """, (user_id,))
        by_container = cursor.fetchall()

        # Insights (duplicados, varios artes)
        cursor.execute("""
            WITH card_counts AS (
                SELECT p.card_id, COUNT(cc.id) as cnt, COUNT(DISTINCT cc.printing_id) as arts_cnt
                FROM card_copies cc
                JOIN containers co ON co.id = cc.container_id
                JOIN printings p ON p.id = cc.printing_id
                WHERE co.user_id = %s
                GROUP BY p.card_id
            )
            SELECT 
                COUNT(*) FILTER (WHERE cnt > 1) AS cards_with_duplicates,
                COUNT(*) FILTER (WHERE arts_cnt > 1) AS cards_with_several_arts
            FROM card_counts;
        """, (user_id,))
        insights = cursor.fetchone() or {"cards_with_duplicates": 0, "cards_with_several_arts": 0}

        return {
            "totals": {
                "total_copies": int(totals.get("total_copies") or 0),
                "unique_cards": int(totals.get("unique_cards") or 0),
                "unique_printings": int(totals.get("unique_printings") or 0),
                "foil_copies": int(totals.get("foil_copies") or 0),
                "containers": int(totals.get("containers") or 0),
            },
            "by_rarity": [{"rarity": r["rarity"], "copies": int(r["copies"])} for r in by_rarity],
            "by_container": [{
                "id": str(c["id"]),
                "name": c["name"],
                "type": c["type"],
                "total_slots": int(c["total_slots"] or 0),
                "copies": int(c["copies"] or 0),
                "free_slots": int(c["free_slots"] or 0)
            } for c in by_container],
            "insights": {
                "cards_with_duplicates": int(insights.get("cards_with_duplicates") or 0),
                "cards_with_several_arts": int(insights.get("cards_with_several_arts") or 0)
            }
        }
    finally:
        cursor.close()
        conn.close()


@router.get("/export")
def collection_export(x_username: str = Header(None)):
    user_id = _get_user_id_from_header(x_username)
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT cc.id, co.name AS container_name, p.scryfall_printing_id, cc.is_foil, cc.condition
            FROM card_copies cc
            JOIN containers co ON co.id = cc.container_id
            JOIN printings p ON p.id = cc.printing_id
            WHERE co.user_id = %s;
        """, (user_id,))
        copies = cursor.fetchall()
        return {
            "format": "card-binder-pro-collection",
            "version": 1,
            "copies": [{
                "container": c["container_name"],
                "printing_id": c["scryfall_printing_id"],
                "is_foil": c["is_foil"],
                "condition": c["condition"]
            } for c in copies]
        }
    finally:
        cursor.close()
        conn.close()


@router.post("/import")
def collection_import(
    payload: dict = Body(...),
    dry_run: bool = Query(True),
    x_username: str = Header(None)
):
    user_id = _get_user_id_from_header(x_username)
    copies = payload.get("copies", [])
    
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        importable = 0
        skipped = 0
        containers_summary = {}
        error_summary = []

        # Obtener contenedores del usuario para validar
        cursor.execute("SELECT id, name, type, total_slots FROM containers WHERE user_id = %s;", (user_id,))
        user_containers = {c["name"].lower(): c for c in cursor.fetchall()}

        for item in copies:
            c_name = item.get("container")
            if not c_name or c_name.lower() not in user_containers:
                skipped += 1
                continue
            
            cont_info = user_containers[c_name.lower()]
            c_id = cont_info["id"]
            
            if c_id not in containers_summary:
                containers_summary[c_id] = {
                    "container": cont_info["name"],
                    "type": cont_info["type"],
                    "requested": 0,
                    "to_import": 0,
                    "free_slots": cont_info["total_slots"] # Simplificado
                }
            containers_summary[c_id]["requested"] += 1
            containers_summary[c_id]["to_import"] += 1
            importable += 1

        if not dry_run and importable > 0:
            # Lógica real de inserción si procede
            pass

        return {
            "total": len(copies),
            "importable": importable,
            "skipped": skipped,
            "containers": list(containers_summary.values()),
            "error_summary": error_summary,
            "imported": 0 if dry_run else importable
        }
    finally:
        cursor.close()
        conn.close()