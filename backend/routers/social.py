"""
social.py · Perfil de un amigo y mensajes directos (DM).

Identifica al usuario con la cabecera X-Username, igual que profile.py.
Solo se puede ver el perfil y hablar con usuarios que ya son amigos tuyos.

    GET  /api/social/user/{username}                 Perfil de un amigo (avatar, insignia y resumen de su colección)
    GET  /api/social/user/{username}/collection      Colección paginada, solo si permite exploración
    GET  /api/social/dm/{username}?after_id=0        Mensajes con ese amigo (los 50 últimos; con after_id, solo los nuevos)
    POST /api/social/dm/{username}   { "message" }   Enviar un mensaje a ese amigo

Los mensajes se guardan en la tabla direct_messages, que se crea sola la primera vez que se usa.
El chat se actualiza consultando cada pocos segundos (sin WebSocket) para no complicar las pruebas.

Para activarlo, en main.py (donde ya incluyes el router de profile):
    from backend.<carpeta> import social
    app.include_router(social.router)
"""
import time
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field

from backend.database import get_db_connection
from backend.services import get_user_by_username
from backend import profile_services as svc
from backend.profile_services import ProfileError
from fastapi import Depends
from backend.security import session_username
from backend.routers.stats import MEDAL_CARD_TARGETS, XP_CARD, XP_CONTAINER, XP_GAME, XP_MEDAL, XP_WIN, level_progress_for_xp

router = APIRouter(prefix="/api/social", tags=["Social"])

MAX_MESSAGE_LEN = 1000
HISTORY_LIMIT = 50
TYPING_SECONDS = 4
_typing = {}  # (emisor, receptor) -> instante del último "escribiendo"


def get_session_user(x_username: str = Depends(session_username)):
    """Usuario indicado en la cabecera X-Username (401 si falta o no existe). Igual que en profile.py."""
    user = get_user_by_username((x_username or "").strip()) if x_username else None
    if not user:
        raise HTTPException(status_code=401, detail="Sesión no válida. Vuelve a iniciar sesión.")
    return user


class DirectMessageIn(BaseModel):
    message: str = Field(..., max_length=MAX_MESSAGE_LEN)


def _dm_status(row) -> str:
    """sent (✓) · delivered (✓✓, ya le ha llegado al receptor) · read (✓✓ azul, ha abierto la conversación)."""
    if row.get("read_at") is not None:
        return "read"
    return "delivered" if row.get("delivered_at") is not None else "sent"


def _iso_utc(value) -> str:
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    return str(value)


# ----- Tabla de mensajes (se crea la primera vez) ---------------------------
_table_ready = False


def _ensure_table():
    global _table_ready
    if _table_ready:
        return
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS direct_messages (
                id BIGSERIAL PRIMARY KEY,
                sender_id TEXT NOT NULL,
                recipient_id TEXT NOT NULL,
                message TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );
        """)
        cursor.execute("ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;")
        cursor.execute("ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;")
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_direct_messages_pair
            ON direct_messages (sender_id, recipient_id, id);
        """)
        conn.commit()
        _table_ready = True
    except Exception:
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()


# ----- Comprobación de amistad ----------------------------------------------
def _require_friend(me: dict, username: str) -> dict:
    target = get_user_by_username((username or "").strip())
    if not target:
        raise HTTPException(status_code=404, detail="Ese usuario no existe.")
    if str(target["id"]) == str(me["id"]):
        raise HTTPException(status_code=400, detail="No puedes escribirte a ti mismo.")
    try:
        social = svc.list_social(me["id"])
    except ProfileError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)
    wanted = target["username"].lower()
    if not any((f.get("username") or "").lower() == wanted for f in social.get("friends", [])):
        raise HTTPException(status_code=403, detail="Solo puedes ver el perfil y escribir a tus amigos.")
    return target


def _collection_stats(user_id, visibility: str) -> dict | None:
    """Devuelve solo el nivel de detalle permitido por la preferencia del propietario."""
    if visibility == "hidden":
        return None
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT COUNT(cc.id) AS copies, COUNT(DISTINCT LOWER(c.name)) AS cards
            FROM card_copies cc
            JOIN containers co ON co.id = cc.container_id
            JOIN printings p ON p.id = cc.printing_id
            JOIN cards c ON c.id = p.card_id
            WHERE co.user_id = %s;
        """, (user_id,))
        row = cursor.fetchone() or {}
        cursor.execute("SELECT COUNT(*) AS n FROM containers WHERE user_id = %s;", (user_id,))
        cont = cursor.fetchone() or {}
        result = {
            "copies": int(row.get("copies") or 0),
            "cards": int(row.get("cards") or 0),
            "containers": int(cont.get("n") or 0),
        }
        if visibility in {"stats", "browse"}:
            cursor.execute("""
                SELECT COALESCE(p.rarity, 'unknown') AS rarity, COUNT(cc.id) AS copies,
                       COUNT(cc.id) FILTER (WHERE cc.is_foil) AS foil_copies
                FROM card_copies cc
                JOIN containers co ON co.id = cc.container_id
                JOIN printings p ON p.id = cc.printing_id
                WHERE co.user_id = %s
                GROUP BY COALESCE(p.rarity, 'unknown') ORDER BY copies DESC, rarity;
            """, (user_id,))
            result["by_rarity"] = [{"rarity": r["rarity"], "copies": int(r["copies"]),
                                    "foil_copies": int(r["foil_copies"])} for r in cursor.fetchall()]
        return result
    finally:
        cursor.close()
        conn.close()


# ----- Perfil de un amigo -----------------------------------------------------
@router.get("/user/{username}")
def friend_profile(username: str, current_user: dict = Depends(get_session_user)):
    target = _require_friend(current_user, username)
    try:
        profile = svc.get_profile(target) or {}
        visibility = target.get("collection_visibility") or "stats"
        collection = _collection_stats(target["id"], visibility)
    except Exception as e:
        print(f"❌ Error cargando el perfil de '{username}': {e}")
        raise HTTPException(status_code=500, detail="No se pudo cargar el perfil.")
    # Solo datos públicos: nunca el email
    return {
        "username": target["username"],
        "avatar": profile.get("avatar"),
        "badge": profile.get("badge"),
        "collection": collection,
        "collection_visibility": visibility,
    }


@router.get("/friends/levels")
def friend_levels(current_user: dict = Depends(get_session_user)):
    """Nivel y avance de amistades aceptadas; no expone XP total ni desglose de colección."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT u.id, u.username
            FROM friendships f
            JOIN users u ON u.id = CASE WHEN f.user_id = %s THEN f.friend_id ELSE f.user_id END
            WHERE (f.user_id = %s OR f.friend_id = %s) AND f.status = 'accepted'
            ORDER BY LOWER(u.username);
        """, (current_user["id"], current_user["id"], current_user["id"]))
        friends = cursor.fetchall()
        if not friends:
            return {"levels": []}

        friend_ids = [friend["id"] for friend in friends]
        cursor.execute("""
            SELECT u.id, u.username,
                   COALESCE(collection.cards, 0) AS cards,
                   COALESCE(collection.containers, 0) AS containers,
                   COALESCE(games.games, 0) AS games,
                   COALESCE(games.wins, 0) AS wins
            FROM users u
            LEFT JOIN LATERAL (
                SELECT COUNT(cc.id) AS cards, COUNT(DISTINCT co.id) AS containers
                FROM containers co
                LEFT JOIN card_copies cc ON cc.container_id = co.id
                WHERE co.user_id = u.id
            ) collection ON TRUE
            LEFT JOIN LATERAL (
                SELECT COUNT(*) AS games, COUNT(*) FILTER (WHERE is_winner) AS wins
                FROM game_players WHERE username = u.username
            ) games ON TRUE
            WHERE u.id::text = ANY(%s);
        """, (friend_ids,))

        summaries = []
        for row in cursor.fetchall():
            cards = int(row["cards"])
            containers = int(row["containers"])
            medals = (1 if containers >= 1 else 0) + sum(1 for target in MEDAL_CARD_TARGETS if cards >= target)
            xp = (cards * XP_CARD) + (containers * XP_CONTAINER) + (medals * XP_MEDAL) + \
                 (int(row["games"]) * XP_GAME) + (int(row["wins"]) * XP_WIN)
            progress = level_progress_for_xp(xp)
            summaries.append({
                "username": row["username"],
                "level": progress["level"],
                "progress": progress["progress"],
            })
        return {"levels": summaries}
    except Exception as e:
        print(f"❌ Error cargando niveles de amistades: {e}")
        raise HTTPException(status_code=500, detail="No se pudo cargar el progreso de tus amistades.")
    finally:
        cursor.close()
        conn.close()


@router.get("/user/{username}/collection")
def browse_friend_collection(
    username: str,
    q: str = Query("", max_length=100),
    type_line: str = Query("", max_length=60),
    subtype: str = Query("", max_length=60),
    rarity: str = Query("", max_length=20),
    sort: str = Query("name"),
    direction: str = Query("asc", alias="dir"),
    page: int = Query(1, ge=1),
    page_size: int = Query(24, ge=1, le=100),
    current_user: dict = Depends(get_session_user),
):
    target = _require_friend(current_user, username)
    if (target.get("collection_visibility") or "stats") != "browse":
        raise HTTPException(status_code=403, detail="Este usuario no permite explorar su colección.")
    sort_columns = {"name": "name_key", "type": "card_type", "copies": "copies", "printings": "printings"}
    if sort not in sort_columns:
        raise HTTPException(status_code=400, detail="El orden solicitado no es válido.")
    if direction not in {"asc", "desc"}:
        raise HTTPException(status_code=400, detail="La dirección debe ser asc o desc.")

    search_clauses = []
    search_params = []
    if q.strip():
        escaped = q.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        pattern = f"%{escaped}%"
        search_clauses.append("(c.name ILIKE %s OR p.set_name ILIKE %s OR c.type_line ILIKE %s)")
        search_params.extend([pattern, pattern, pattern])
    if type_line.strip():
        search_clauses.append("c.type_line ILIKE %s")
        search_params.append(f"%{type_line.strip()}%")
    if subtype.strip():
        search_clauses.append("c.type_line ILIKE %s")
        search_params.append(f"%{subtype.strip()}%")
    match_where = "co.user_id = %s" + (" AND " + " AND ".join(search_clauses) if search_clauses else "")
    match_params = [target["id"]] + search_params
    where = "co.user_id = %s"
    params = [target["id"]]
    if rarity.strip():
        where += " AND LOWER(COALESCE(p.rarity, '')) = LOWER(%s)"
        params.append(rarity.strip())

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        from_clause = """
            FROM card_copies cc
            JOIN containers co ON co.id = cc.container_id
            JOIN printings p ON p.id = cc.printing_id
            JOIN cards c ON c.id = p.card_id
        """
        cursor.execute(f"""
            WITH matched AS (
                SELECT DISTINCT LOWER(c.name) AS name_key {from_clause} WHERE {match_where}
            )
            SELECT COUNT(DISTINCT LOWER(c.name)) AS cards, COUNT(cc.id) AS copies
            {from_clause} JOIN matched m ON m.name_key = LOWER(c.name)
            WHERE {where};
        """, tuple(match_params + params))
        totals = cursor.fetchone() or {}
        total_cards = int(totals.get("cards") or 0)
        total_pages = max(1, (total_cards + page_size - 1) // page_size)
        page = min(page, total_pages)
        cursor.execute(f"""
            WITH matched AS (
                SELECT DISTINCT LOWER(c.name) AS name_key {from_clause} WHERE {match_where}
            )
            SELECT LOWER(c.name) AS name_key, MIN(c.name) AS name,
                   MIN(c.type_line) AS card_type, COUNT(cc.id) AS copies,
                   COUNT(DISTINCT p.id) AS printings
            {from_clause} JOIN matched m ON m.name_key = LOWER(c.name) WHERE {where}
            GROUP BY LOWER(c.name) ORDER BY {sort_columns[sort]} {direction.upper()} NULLS LAST, LOWER(c.name) ASC
            LIMIT %s OFFSET %s;
        """, tuple(match_params + params + [page_size, (page - 1) * page_size]))
        rows = cursor.fetchall()
        items = [{"name": r["name"], "type_line": r["card_type"] or "", "copies": int(r["copies"]),
                  "printings_count": int(r["printings"]), "printings": []} for r in rows]
        by_name = {r["name_key"]: item for r, item in zip(rows, items)}
        if by_name:
            cursor.execute("""
                SELECT LOWER(c.name) AS name_key, p.set_name, p.set_code, p.collector_number,
                       p.rarity, p.image_uri, COUNT(cc.id) AS copies,
                       COUNT(cc.id) FILTER (WHERE cc.is_foil) AS foil_copies
                FROM card_copies cc
                JOIN containers co ON co.id = cc.container_id
                JOIN printings p ON p.id = cc.printing_id
                JOIN cards c ON c.id = p.card_id
                WHERE co.user_id = %s AND LOWER(c.name) = ANY(%s)
                  AND (%s = '' OR LOWER(COALESCE(p.rarity, '')) = LOWER(%s))
                GROUP BY LOWER(c.name), p.id, p.set_name, p.set_code, p.collector_number, p.rarity, p.image_uri
                ORDER BY LOWER(c.name), LOWER(p.set_name), p.collector_number;
            """, (target["id"], list(by_name), rarity.strip(), rarity.strip()))
            for printing in cursor.fetchall():
                by_name[printing["name_key"]]["printings"].append({
                    "set_name": printing["set_name"], "set_code": printing["set_code"],
                    "collector_number": printing["collector_number"], "rarity": printing["rarity"],
                    "image_uri": printing["image_uri"] or "",
                    "copies": int(printing["copies"]), "foil_copies": int(printing["foil_copies"]),
                })
        return {"page": page, "page_size": page_size, "total_pages": total_pages,
                "total_cards": total_cards, "total_copies": int(totals.get("copies") or 0), "items": items}
    except Exception as e:
        print(f"❌ Error explorando colección de '{username}': {e}")
        raise HTTPException(status_code=500, detail="No se pudo cargar la colección.")
    finally:
        cursor.close()
        conn.close()


# ----- Mensajes directos -------------------------------------------------------
@router.get("/dm/{username}")
def get_dm(username: str, after_id: int = Query(0, ge=0), current_user: dict = Depends(get_session_user)):
    target = _require_friend(current_user, username)
    me_id, other_id = str(current_user["id"]), str(target["id"])
    conn = None
    try:
        _ensure_table()
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, sender_id, message, created_at, delivered_at, read_at FROM (
                SELECT id, sender_id, message, created_at, delivered_at, read_at
                FROM direct_messages
                WHERE ((sender_id = %s AND recipient_id = %s) OR (sender_id = %s AND recipient_id = %s))
                  AND id > %s
                ORDER BY id DESC
                LIMIT %s
            ) AS ultimos
            ORDER BY id ASC;
        """, (me_id, other_id, other_id, me_id, after_id, HISTORY_LIMIT))
        rows = cursor.fetchall()
        if rows:  # al abrir la conversación, lo recibido hasta aquí queda como visto
            cursor.execute("""
                UPDATE direct_messages SET read_at = now(), delivered_at = COALESCE(delivered_at, now())
                WHERE recipient_id = %s AND sender_id = %s AND read_at IS NULL AND id <= %s;
            """, (me_id, other_id, rows[-1]["id"]))
            conn.commit()
        cursor.execute("SELECT id, delivered_at, read_at FROM direct_messages WHERE sender_id = %s AND recipient_id = %s ORDER BY id DESC LIMIT %s;",
                       (me_id, other_id, HISTORY_LIMIT))
        statuses = {str(r["id"]): _dm_status(r) for r in cursor.fetchall()}
        cursor.close()
        return {"messages": [
            {
                "id": int(r["id"]),
                "mine": r["sender_id"] == me_id,
                "message": r["message"],
                "created_at": _iso_utc(r["created_at"]),
                "status": _dm_status(r) if r["sender_id"] == me_id else None,
            }
            for r in rows
        ], "statuses": statuses, "typing": (time.monotonic() - _typing.get((other_id, me_id), -100.0)) < TYPING_SECONDS}
    except Exception as e:
        print(f"❌ Error leyendo mensajes directos: {e}")
        raise HTTPException(status_code=500, detail="No se pudieron cargar los mensajes.")
    finally:
        if conn:
            conn.close()


@router.post("/dm/{username}/typing")
def dm_typing(username: str, current_user: dict = Depends(get_session_user)):
    """Marca que el usuario está escribiendo a ese amigo (caduca a los pocos segundos)."""
    target = _require_friend(current_user, username)
    _typing[(str(current_user["id"]), str(target["id"]))] = time.monotonic()
    return {"ok": True}


@router.post("/dm/{username}")
def send_dm(username: str, body: DirectMessageIn, current_user: dict = Depends(get_session_user)):
    text = body.message.strip()
    if not text:
        raise HTTPException(status_code=400, detail="El mensaje está vacío.")
    target = _require_friend(current_user, username)
    conn = None
    try:
        _ensure_table()
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO direct_messages (sender_id, recipient_id, message, created_at)
            VALUES (%s, %s, %s, %s)
            RETURNING id;
        """, (str(current_user["id"]), str(target["id"]), text, datetime.now(timezone.utc)))
        new_id = cursor.fetchone()["id"]
        conn.commit()
        cursor.close()
        return {"id": int(new_id)}
    except Exception as e:
        if conn:
            conn.rollback()
        print(f"❌ Error guardando mensaje directo: {e}")
        raise HTTPException(status_code=500, detail="No se pudo enviar el mensaje.")
    finally:
        if conn:
            conn.close()


# ----- Notificaciones ----------------------------------------------------------
@router.get("/notifications")
def notifications(current_user: dict = Depends(get_session_user)):
    """Solicitudes de amistad pendientes y mensajes directos sin ver (agrupados por amigo)."""
    try:
        social = svc.list_social(current_user["id"])
    except ProfileError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)

    requests = [{"username": u["username"], "avatar": u.get("avatar")} for u in social.get("incoming", [])]

    counts = {}
    conn = None
    try:
        _ensure_table()
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT sender_id, COUNT(*) AS n FROM direct_messages
            WHERE recipient_id = %s AND read_at IS NULL
            GROUP BY sender_id;
        """, (str(current_user["id"]),))
        counts = {r["sender_id"]: int(r["n"]) for r in cursor.fetchall()}
        cursor.execute("UPDATE direct_messages SET delivered_at = now() WHERE recipient_id = %s AND delivered_at IS NULL;",
                       (str(current_user["id"]),))
        conn.commit()
        cursor.close()
    except Exception as e:
        print(f"❌ Error leyendo notificaciones: {e}")
        raise HTTPException(status_code=500, detail="No se pudieron cargar las notificaciones.")
    finally:
        if conn:
            conn.close()

    messages = []
    if counts:
        for f in social.get("friends", []):
            friend = get_user_by_username(f["username"])
            n = counts.get(str(friend["id"])) if friend else 0
            if n:
                messages.append({"username": f["username"], "avatar": f.get("avatar"), "count": n})

    return {
        "requests": requests,
        "messages": messages,
        "total": len(requests) + sum(m["count"] for m in messages),
    }
