import re
from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from pydantic import BaseModel
from typing import List
from backend.database import get_db_connection
from backend.security import ws_username, ALLOW_LEGACY
from backend.services import get_user_by_username

router = APIRouter(
    prefix="/api/chat",
    tags=["Chat Global"]
)

# Gestor para mantener las conexiones activas de los WebSockets
class ConnectionManager:
    def __init__(self):
        print("🔌 [Chat] Inicializando ConnectionManager...")
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        print(f"🔌 [Chat] Cliente conectado. Total activos: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            print(f"🔌 [Chat] Cliente desconectado. Total activos: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                print(f"❌ Error al enviar mensaje por WebSocket: {e}")

manager = ConnectionManager()

# El front envía los GIF como <img ...>. Solo se acepta ese formato exacto y de giphy.com; cualquier otro
# '<' o '>' se neutraliza para que nadie pueda inyectar HTML/JavaScript en la sala (XSS almacenado).
GIF_HTML = re.compile(r'^<img src="https://(?:[a-z0-9-]+\.)*giphy\.com/[^"\s<>]+" class="[^"<>]*" alt="Sticker"/>$')
MAX_MESSAGE_CHARS = 2000


def _clean_message(text: str) -> str:
    text = text[:MAX_MESSAGE_CHARS]
    if GIF_HTML.match(text):
        return text
    return text.replace("<", "＜").replace(">", "＞")


def _iso_utc(value) -> str:
    """Fecha en ISO 8601 UTC con 'Z' (JavaScript la convierte a la hora local de cada usuario)."""
    if isinstance(value, datetime):
        if value.tzinfo is None:  # sin zona: se asume UTC
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    return str(value)


@router.get("/history")
async def get_chat_history():
    """Devuelve los últimos 50 mensajes de la sala global ordenados cronológicamente."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT id, username, user_login, badge_type, message, created_at
            FROM (
                SELECT id, username, user_login, badge_type, message, created_at
                FROM chat_messages
                ORDER BY created_at DESC
                LIMIT 50
            ) AS ultimos
            ORDER BY created_at ASC;
        """)
        messages = cursor.fetchall()
        
        result = []
        for msg in messages:
            msg_dict = dict(msg)
            if msg_dict.get("created_at"):
                msg_dict["created_at"] = _iso_utc(msg_dict["created_at"])
            if msg_dict.get("id") is not None:
                msg_dict["id"] = str(msg_dict["id"])
            result.append(msg_dict)
            
        return result
    except Exception as e:
        print(f"❌ Error al recuperar el historial del chat: {e}")
        raise HTTPException(status_code=500, detail="No se pudo cargar el historial del chat.")
    finally:
        cursor.close()
        conn.close()


@router.websocket("/ws/chat")
async def chat_websocket(websocket: WebSocket):
    """Endpoint WebSocket para la comunicación en tiempo real de la sala global."""
    # Identidad real: sale de la cookie de sesión, no de lo que diga el mensaje (así nadie escribe como otro)
    verified = ws_username(websocket)
    me = get_user_by_username(verified) if verified else None
    if me is None and not ALLOW_LEGACY:
        await websocket.close(code=4401)
        return

    await manager.connect(websocket)

    try:
        while True:
            data = await websocket.receive_json()
            if me:
                username = me["username"]
                user_login = me["username"]
                badge_type = me.get("badge_type") or "civil_homebrewer"
            else:  # modo transición (ALLOW_LEGACY_HEADER=1)
                username = data.get("username", "Anónimo")
                user_login = data.get("user_login", "anon")
                badge_type = data.get("badge_type", "civil_homebrewer")
            message = _clean_message(str(data.get("message", "")).strip())

            if not message:
                continue

            # Guardar en base de datos. La hora la fija aquí la aplicación (UTC) en cada mensaje:
            # así no depende de CURRENT_TIMESTAMP (que es la hora de INICIO de la transacción) ni de
            # una conexión que se mantenga abierta todo el rato que dura el WebSocket.
            sent_at = datetime.now(timezone.utc)
            conn = get_db_connection()
            cursor = conn.cursor()
            try:
                cursor.execute("""
                    INSERT INTO chat_messages (username, user_login, badge_type, message, created_at)
                    VALUES (%s, %s, %s, %s, %s)
                    RETURNING id, username, user_login, badge_type, message, created_at;
                """, (username, user_login, badge_type, message, sent_at))
                new_msg = cursor.fetchone()
                conn.commit()
            except Exception:
                conn.rollback()
                raise
            finally:
                cursor.close()
                conn.close()

            created_at_str = _iso_utc(new_msg["created_at"])

            # Estructura del mensaje para difundir a todos los clientes conectados
            message_payload = {
                "id": str(new_msg["id"]),
                "username": new_msg["username"],
                "user_login": new_msg["user_login"],
                "badge_type": new_msg["badge_type"],
                "message": new_msg["message"],
                "created_at": created_at_str
            }

            await manager.broadcast(message_payload)

    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        print(f"❌ Excepción en WebSocket de chat: {e}")
        manager.disconnect(websocket)