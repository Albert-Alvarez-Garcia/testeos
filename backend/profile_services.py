"""
profile_services.py · Lógica de perfil, avatares y sistema social (amistades y bloqueos).

Sustituye al profile_services.py anterior. Diferencias importantes:
  - Nadie pasa su identificador por la URL: el usuario sale del token (ver security.py) y aquí llega ya
    autenticado como dict (id, username...). Los demás usuarios se nombran por su username.
  - Los avatares se guardan en AVATAR_DIR (el mismo almacén que usa auth.py para 42) y los sirve la API
    en /api/auth/avatar/<usuario>. Antes se escribían en public/assets/avatars *dentro del contenedor de la API*,
    una carpeta que nginx (otro contenedor) no ve.
  - Los errores previstos se lanzan como ProfileError(status_code, detail); el router los convierte en HTTP.

Tablas (ya creadas): friendships(user_id, friend_id, status 'pending'|'accepted') y blocked_users(user_id, blocked_id).
En friendships, user_id es quien envía la solicitud y friend_id quien la recibe.
"""
import os
import time
from typing import List

from backend.database import get_db_connection
from backend.routers.auth import (
    AVATAR_DIR,
    AVATAR_MEDIA_TYPES,
    _safe_avatar_name,
    _detect_image_ext,
)

# Límite para imágenes subidas por el usuario (la descarga de 42 en auth.py admite hasta 5 MB)
UPLOAD_MAX_BYTES = 1 * 1024 * 1024
SEARCH_MIN_CHARS = 2
SEARCH_LIMIT = 10


class ProfileError(Exception):
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


# ---------------------------------------------------------------------------
# Avatares
# ---------------------------------------------------------------------------
def avatar_url(username: str):
    """URL pública del avatar del usuario o None si no tiene. El ?v= (fecha del fichero) evita la caché antigua."""
    safe = _safe_avatar_name(username)
    for ext in AVATAR_MEDIA_TYPES:
        path = os.path.join(AVATAR_DIR, f"{safe}.{ext}")
        if os.path.isfile(path):
            return f"/api/auth/avatar/{safe}?v={int(os.path.getmtime(path))}"
    return None


def store_avatar(username: str, data: bytes) -> str:
    """Valida por la firma real del fichero (no por el Content-Type ni la extensión) y lo guarda.
    SVG y cualquier otro formato no soportado se rechazan. Lanza ProfileError(415) si no es una imagen válida."""
    ext = _detect_image_ext(data)
    if not ext:
        raise ProfileError(415, "Formato no soportado. Usa PNG, JPG, GIF o WebP.")

    safe = _safe_avatar_name(username)
    os.makedirs(AVATAR_DIR, exist_ok=True)

    final_path = os.path.join(AVATAR_DIR, f"{safe}.{ext}")
    tmp_path = final_path + ".tmp"
    with open(tmp_path, "wb") as f:
        f.write(data)
    os.replace(tmp_path, final_path)

    # Si antes tenía una imagen con otra extensión, se elimina para no servir la antigua
    for other in AVATAR_MEDIA_TYPES:
        if other != ext:
            stale = os.path.join(AVATAR_DIR, f"{safe}.{other}")
            if os.path.isfile(stale):
                os.remove(stale)

    return f"/api/auth/avatar/{safe}?v={int(time.time())}"


def remove_avatar(username: str) -> bool:
    safe = _safe_avatar_name(username)
    removed = False
    for ext in AVATAR_MEDIA_TYPES:
        path = os.path.join(AVATAR_DIR, f"{safe}.{ext}")
        if os.path.isfile(path):
            os.remove(path)
            removed = True
    return removed


# ---------------------------------------------------------------------------
# Perfil
# ---------------------------------------------------------------------------
def get_profile(user: dict) -> dict:
    """Perfil propio. Nunca se devuelve password_hash."""
    return {
        "username": user["username"],
        "email": user.get("email"),
        "badge": user.get("badge_type"),
        "auth_type": user.get("auth_type"),
        "avatar": avatar_url(user["username"]),
    }


def _card(row) -> dict:
    """Datos públicos de otro usuario: nada de correo ni identificadores."""
    return {"username": row["username"], "badge": row.get("badge_type"), "avatar": avatar_url(row["username"])}


def _clean_username(value) -> str:
    name = (value or "").strip() if isinstance(value, str) else ""
    if not name or len(name) > 100:
        raise ProfileError(400, "Indica un nombre de usuario válido.")
    return name


def _find_user(cursor, username: str):
    cursor.execute(
        "SELECT id, username, badge_type FROM users WHERE LOWER(username) = LOWER(%s);",
        (username,),
    )
    return cursor.fetchone()


def _blocked_between(cursor, a, b) -> bool:
    cursor.execute(
        """
        SELECT 1 FROM blocked_users
        WHERE (user_id = %s AND blocked_id = %s) OR (user_id = %s AND blocked_id = %s);
        """,
        (a, b, b, a),
    )
    return cursor.fetchone() is not None


def _like(term: str) -> str:
    escaped = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def _run(action):
    """Abre conexión, ejecuta action(cursor), confirma y cierra. Deshace todo si algo falla."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        result = action(cursor)
        conn.commit()
        return result
    except ProfileError:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        print(f"❌ Error en el sistema social: {e}")
        raise ProfileError(500, "Error interno en el sistema social.")
    finally:
        cursor.close()
        conn.close()


# ---------------------------------------------------------------------------
# Listado y búsqueda
# ---------------------------------------------------------------------------
def list_social(me_id) -> dict:
    """Amigos, solicitudes recibidas, solicitudes enviadas y usuarios bloqueados."""
    def action(cursor):
        cursor.execute(
            """
            SELECT f.status, f.user_id AS sender_id, u.username, u.badge_type
            FROM friendships f
            JOIN users u ON u.id = CASE WHEN f.user_id = %s THEN f.friend_id ELSE f.user_id END
            WHERE f.user_id = %s OR f.friend_id = %s
            ORDER BY LOWER(u.username);
            """,
            (me_id, me_id, me_id),
        )
        friends: List[dict] = []
        incoming: List[dict] = []
        outgoing: List[dict] = []
        for row in cursor.fetchall():
            if row["status"] == "accepted":
                friends.append(_card(row))
            elif str(row["sender_id"]) == str(me_id):
                outgoing.append(_card(row))
            else:
                incoming.append(_card(row))

        cursor.execute(
            """
            SELECT u.username, u.badge_type
            FROM blocked_users b JOIN users u ON u.id = b.blocked_id
            WHERE b.user_id = %s
            ORDER BY LOWER(u.username);
            """,
            (me_id,),
        )
        blocked = [_card(row) for row in cursor.fetchall()]
        return {"friends": friends, "incoming": incoming, "outgoing": outgoing, "blocked": blocked}

    return _run(action)


def search_users(me_id, query: str) -> List[dict]:
    """Busca por nombre de usuario (coincidencia parcial). No devuelve al propio usuario ni a quien te ha bloqueado.
    Cada resultado lleva su relación con el usuario: friend | pending_out | pending_in | blocked | None."""
    query = (query or "").strip()
    if len(query) < SEARCH_MIN_CHARS:
        return []

    def action(cursor):
        cursor.execute(
            """
            SELECT u.username, u.badge_type,
                   (SELECT CASE WHEN f.status = 'accepted' THEN 'friend'
                                WHEN f.user_id = %s THEN 'pending_out'
                                ELSE 'pending_in' END
                      FROM friendships f
                     WHERE (f.user_id = %s AND f.friend_id = u.id) OR (f.user_id = u.id AND f.friend_id = %s)
                     LIMIT 1) AS relation,
                   EXISTS (SELECT 1 FROM blocked_users b WHERE b.user_id = %s AND b.blocked_id = u.id) AS i_blocked
            FROM users u
            WHERE u.id <> %s
              AND u.username ILIKE %s
              AND NOT EXISTS (SELECT 1 FROM blocked_users b WHERE b.user_id = u.id AND b.blocked_id = %s)
            ORDER BY LOWER(u.username)
            LIMIT %s;
            """,
            (me_id, me_id, me_id, me_id, me_id, _like(query), me_id, SEARCH_LIMIT),
        )
        results = []
        for row in cursor.fetchall():
            item = _card(row)
            item["relation"] = "blocked" if row["i_blocked"] else row["relation"]
            results.append(item)
        return results

    return _run(action)


# ---------------------------------------------------------------------------
# Amistades
# ---------------------------------------------------------------------------
def send_friend_request(me_id, target_username) -> dict:
    name = _clean_username(target_username)

    def action(cursor):
        target = _find_user(cursor, name)
        if not target:
            raise ProfileError(404, "Usuario no encontrado.")
        target_id = target["id"]
        if str(target_id) == str(me_id):
            raise ProfileError(400, "No puedes enviarte una solicitud a ti mismo.")

        # Mensaje genérico a propósito: no revela quién ha bloqueado a quién
        if _blocked_between(cursor, me_id, target_id):
            raise ProfileError(403, "No se puede establecer la conexión con este usuario.")

        cursor.execute(
            """
            SELECT id, user_id, status FROM friendships
            WHERE (user_id = %s AND friend_id = %s) OR (user_id = %s AND friend_id = %s);
            """,
            (me_id, target_id, target_id, me_id),
        )
        existing = cursor.fetchone()
        if existing:
            if existing["status"] == "accepted":
                raise ProfileError(409, "Ya sois amigos.")
            if str(existing["user_id"]) == str(me_id):
                raise ProfileError(409, "Ya existe una solicitud pendiente.")
            # Esa persona ya te había enviado una solicitud: enviarle otra equivale a aceptarla
            cursor.execute("UPDATE friendships SET status = 'accepted' WHERE id = %s;", (existing["id"],))
            return {"status": "accepted", "message": f"Ahora eres amigo de {target['username']}."}

        cursor.execute(
            "INSERT INTO friendships (user_id, friend_id, status) VALUES (%s, %s, 'pending');",
            (me_id, target_id),
        )
        return {"status": "pending", "message": "Solicitud de amistad enviada."}

    return _run(action)


def accept_friend_request(me_id, from_username) -> dict:
    name = _clean_username(from_username)

    def action(cursor):
        sender = _find_user(cursor, name)
        if not sender:
            raise ProfileError(404, "Usuario no encontrado.")
        cursor.execute(
            """
            UPDATE friendships SET status = 'accepted'
            WHERE user_id = %s AND friend_id = %s AND status = 'pending'
            RETURNING id;
            """,
            (sender["id"], me_id),
        )
        if not cursor.fetchone():
            raise ProfileError(404, "No tienes ninguna solicitud pendiente de ese usuario.")
        return {"message": f"Ahora eres amigo de {sender['username']}."}

    return _run(action)


def reject_friend_request(me_id, other_username) -> dict:
    """Rechaza una solicitud recibida o cancela una enviada (solo afecta a solicitudes pendientes)."""
    name = _clean_username(other_username)

    def action(cursor):
        other = _find_user(cursor, name)
        if not other:
            raise ProfileError(404, "Usuario no encontrado.")
        cursor.execute(
            """
            DELETE FROM friendships
            WHERE status = 'pending'
              AND ((user_id = %s AND friend_id = %s) OR (user_id = %s AND friend_id = %s))
            RETURNING id;
            """,
            (me_id, other["id"], other["id"], me_id),
        )
        if not cursor.fetchone():
            raise ProfileError(404, "No hay ninguna solicitud pendiente con ese usuario.")
        return {"message": "Solicitud eliminada."}

    return _run(action)


def remove_friend(me_id, other_username) -> dict:
    name = _clean_username(other_username)

    def action(cursor):
        other = _find_user(cursor, name)
        if not other:
            raise ProfileError(404, "Usuario no encontrado.")
        cursor.execute(
            """
            DELETE FROM friendships
            WHERE status = 'accepted'
              AND ((user_id = %s AND friend_id = %s) OR (user_id = %s AND friend_id = %s))
            RETURNING id;
            """,
            (me_id, other["id"], other["id"], me_id),
        )
        if not cursor.fetchone():
            raise ProfileError(404, "Ese usuario no está en tu lista de amigos.")
        return {"message": f"{other['username']} ya no es tu amigo."}

    return _run(action)


# ---------------------------------------------------------------------------
# Bloqueos
# ---------------------------------------------------------------------------
def block_user(me_id, target_username) -> dict:
    """Bloquea y borra cualquier amistad o solicitud entre ambos."""
    name = _clean_username(target_username)

    def action(cursor):
        target = _find_user(cursor, name)
        if not target:
            raise ProfileError(404, "Usuario no encontrado.")
        if str(target["id"]) == str(me_id):
            raise ProfileError(400, "No puedes bloquearte a ti mismo.")
        cursor.execute(
            """
            INSERT INTO blocked_users (user_id, blocked_id) VALUES (%s, %s)
            ON CONFLICT (user_id, blocked_id) DO NOTHING;
            """,
            (me_id, target["id"]),
        )
        cursor.execute(
            """
            DELETE FROM friendships
            WHERE (user_id = %s AND friend_id = %s) OR (user_id = %s AND friend_id = %s);
            """,
            (me_id, target["id"], target["id"], me_id),
        )
        return {"message": f"{target['username']} ha sido bloqueado."}

    return _run(action)


def unblock_user(me_id, target_username) -> dict:
    name = _clean_username(target_username)

    def action(cursor):
        target = _find_user(cursor, name)
        if not target:
            raise ProfileError(404, "Usuario no encontrado.")
        cursor.execute(
            "DELETE FROM blocked_users WHERE user_id = %s AND blocked_id = %s RETURNING id;",
            (me_id, target["id"]),
        )
        if not cursor.fetchone():
            raise ProfileError(404, "Ese usuario no estaba bloqueado.")
        return {"message": f"{target['username']} ha sido desbloqueado."}

    return _run(action)
