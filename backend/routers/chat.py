from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from pydantic import BaseModel
from typing import List
from backend.database import get_db_connection

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


@router.get("/history")
async def get_chat_history():
    """Devuelve los últimos 50 mensajes de la sala global ordenados cronológicamente."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT id, username, user_login, badge_type, message, created_at
            FROM chat_messages
            ORDER BY created_at ASC
            LIMIT 50;
        """)
        messages = cursor.fetchall()
        return [dict(msg) for msg in messages]
    except Exception as e:
        print(f"❌ Error al recuperar el historial del chat: {e}")
        raise HTTPException(status_code=500, detail="No se pudo cargar el historial del chat.")
    finally:
        cursor.close()
        conn.close()


@router.websocket("/ws/chat")
async def chat_websocket(websocket: WebSocket):
    """Endpoint WebSocket para la comunicación en tiempo real de la sala global."""
    await manager.connect(websocket)
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        while True:
            data = await websocket.receive_json()
            username = data.get("username", "Anónimo")
            user_login = data.get("user_login", "anon")
            badge_type = data.get("badge_type", "civil_homebrewer")
            message = data.get("message", "").strip()

            if not message:
                continue

            # Guardar en base de datos
            cursor.execute("""
                INSERT INTO chat_messages (username, user_login, badge_type, message)
                VALUES (%s, %s, %s, %s)
                RETURNING id, username, user_login, badge_type, message, created_at;
            """, (username, user_login, badge_type, message))
            
            new_msg = cursor.fetchone()
            conn.commit()

            # Estructura del mensaje para difundir a todos los clientes conectados
            message_payload = {
                "id": str(new_msg["id"]),
                "username": new_msg["username"],
                "user_login": new_msg["user_login"],
                "badge_type": new_msg["badge_type"],
                "message": new_msg["message"],
                "created_at": new_msg["created_at"].isoformat()
            }

            await manager.broadcast(message_payload)

    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        print(f"❌ Excepción en WebSocket de chat: {e}")
        manager.disconnect(websocket)
    finally:
        cursor.close()
        conn.close()