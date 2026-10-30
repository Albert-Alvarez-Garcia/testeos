"""
social.py · Perfil de un amigo y mensajes directos (DM).

Identifica al usuario con la cabecera X-Username, igual que profile.py.
Solo se puede ver el perfil y hablar con usuarios que ya son amigos tuyos.

    GET  /api/social/user/{username}                 Perfil de un amigo (avatar, insignia y resumen de su colección)
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


def _collection_stats(user_id) -> dict:
    """Mismos totales que /api/reports/collection y que el hub: copias, cartas distintas y contenedores."""
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
        return {
            "copies": int(row.get("copies") or 0),
            "cards": int(row.get("cards") or 0),
            "containers": int(cont.get("n") or 0),
        }
    finally:
        cursor.close()
        conn.close()


# ----- Perfil de un amigo -----------------------------------------------------
@router.get("/user/{username}")
def friend_profile(username: str, current_user: dict = Depends(get_session_user)):
    target = _require_friend(current_user, username)
    try:
        profile = svc.get_profile(target) or {}
        collection = _collection_stats(target["id"])
    except Exception as e:
        print(f"❌ Error cargando el perfil de '{username}': {e}")
        raise HTTPException(status_code=500, detail="No se pudo cargar el perfil.")
    # Solo datos públicos: nunca el email
    return {
        "username": target["username"],
        "avatar": profile.get("avatar"),
        "badge": profile.get("badge"),
        "collection": collection,
    }


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
            SELECT id, sender_id, message, created_at FROM (
                SELECT id, sender_id, message, created_at
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
                UPDATE direct_messages SET read_at = now()
                WHERE recipient_id = %s AND sender_id = %s AND read_at IS NULL AND id <= %s;
            """, (me_id, other_id, rows[-1]["id"]))
            conn.commit()
        cursor.close()
        return {"messages": [
            {
                "id": int(r["id"]),
                "mine": r["sender_id"] == me_id,
                "message": r["message"],
                "created_at": _iso_utc(r["created_at"]),
            }
            for r in rows
        ], "typing": (time.monotonic() - _typing.get((other_id, me_id), -100.0)) < TYPING_SECONDS}
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