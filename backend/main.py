from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from typing import List
import json
from backend.routers import cards, containers, auth, chat

app = FastAPI(title="Card Binder Pro API", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- GESTOR DE CONEXIONES WEBSOCKET ---
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_text(json.dumps(message))
            except Exception as e:
                print(f"❌ Error enviando mensaje por WS: {e}")

manager = ConnectionManager()

# --- ENDPOINT WEBSOCKET DIRECTO EN APP ---
@app.websocket("/api/chat/ws/chat")
async def websocket_chat_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data_text = await websocket.receive_text()
            data = json.loads(data_text)
            
            message_payload = {
                "username": data.get("username", "Conjurador"),
                "user_login": data.get("user_login", "guest"),
                "badge_type": data.get("badge_type", "civil_homebrewer"),
                "message": data.get("message", ""),
                "created_at": data.get("created_at", None) or "2026-08-09T20:00:00Z"
            }
            
            await manager.broadcast(message_payload)
            
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        print(f"❌ Excepción en WebSocket: {e}")
        manager.disconnect(websocket)

# --- INCLUSIÓN DE ROUTERS ---
app.include_router(cards.router)
app.include_router(containers.router)
app.include_router(auth.router)
app.include_router(chat.router)