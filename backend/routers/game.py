import random
import time
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict, List
from backend.database import get_db_connection

router = APIRouter(
    prefix="/api/game",
    tags=["Minijuego Adivina la Carta"]
)

# Gestor de salas de juego activas
class GameManager:
    def __init__(self):
        self.rooms: Dict[str, List[WebSocket]] = {}
        self.scores: Dict[WebSocket, dict] = {}

    async def connect(self, websocket: WebSocket, room_id: str):
        await websocket.accept()
        if room_id not in self.rooms:
            self.rooms[room_id] = []
        self.rooms[room_id].append(websocket)
        self.scores[websocket] = {"score": 0, "streak": 0}

    def disconnect(self, websocket: WebSocket, room_id: str):
        if room_id in self.rooms:
            if websocket in self.rooms[room_id]:
                self.rooms[room_id].remove(websocket)
            if not self.rooms[room_id]:
                del self.rooms[room_id]
        if websocket in self.scores:
            del self.scores[websocket]

    async def broadcast_to_room(self, room_id: str, message: dict):
        if room_id in self.rooms:
            for connection in self.rooms[room_id]:
                try:
                    await connection.send_json(message)
                except Exception as e:
                    print(f"❌ Error enviando mensaje a sala {room_id}: {e}")

manager = GameManager()

def get_random_card_with_options():
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT c.name, p.image_uri 
            FROM cards c
            JOIN printings p ON p.card_id = c.id
            WHERE p.image_uri IS NOT NULL AND p.image_uri != ''
            ORDER BY RANDOM() LIMIT 1;
        """)
        correct = cursor.fetchone()
        if not correct:
            return None

        correct_name = correct["name"]
        image_uri = correct["image_uri"]

        cursor.execute("""
            SELECT DISTINCT name FROM (
                SELECT name FROM cards 
                WHERE LOWER(name) != LOWER(%s)
                ORDER BY RANDOM()
            ) sub 
            LIMIT 3;
        """, (correct_name,))
        distractors = [row["name"] for row in cursor.fetchall()]

        options = distractors + [correct_name]
        random.shuffle(options)

        return {
            "name": correct_name,
            "image_uri": image_uri,
            "options": options
        }
    except Exception as e:
        print(f"❌ Error obteniendo carta para el juego: {e}")
        return None
    finally:
        cursor.close()
        conn.close()

@router.websocket("/ws/game/{room_id}")
async def game_websocket(websocket: WebSocket, room_id: str):
    await manager.connect(websocket, room_id)
    current_card = None
    round_start_time = 0.0
    
    try:
        current_card = get_random_card_with_options()
        if current_card:
            round_start_time = time.time()
            await websocket.send_json({
                "type": "NEW_ROUND",
                "image_uri": current_card["image_uri"],
                "options": current_card["options"],
                "start_time": round_start_time
            })

        while True:
            data = await websocket.receive_json()
            action = data.get("action")

            if action == "ANSWER":
                selected_answer = data.get("answer", "")
                answer_time = time.time()
                elapsed = answer_time - round_start_time

                # Detectar si es un envío por tiempo agotado (respuesta vacía)
                is_timeout = (selected_answer == "")
                is_correct = False

                if not is_timeout:
                    is_correct = (selected_answer.strip().lower() == current_card["name"].strip().lower())
                
                player_data = manager.scores[websocket]
                points_earned = 0

                if is_correct:
                    if elapsed <= 5:
                        base_pts = 3
                    elif elapsed <= 10:
                        base_pts = 2
                    else:
                        base_pts = 1
                    
                    streak_bonus = 1 if player_data["streak"] > 0 else 0
                    points_earned = base_pts + streak_bonus
                    
                    player_data["score"] += points_earned
                    player_data["streak"] += 1
                else:
                    if not is_timeout:
                        player_data["streak"] = 0

                # Enviar resultado al jugador
                await websocket.send_json({
                    "type": "ANSWER_RESULT",
                    "correct": is_correct,
                    "correct_answer": current_card["name"],
                    "points_earned": points_earned,
                    "total_score": player_data["score"]
                })

                if player_data["score"] >= 10:
                    await manager.broadcast_to_room(room_id, {
                        "type": "GAME_OVER",
                        "winner": data.get("username", "Un jugador")
                    })
                elif is_correct or is_timeout:
                    # SOLO avanzamos de ronda si se acierta o si el tiempo de la ronda expira (timeout)
                    current_card = get_random_card_with_options()
                    round_start_time = time.time()
                    await manager.broadcast_to_room(room_id, {
                        "type": "NEW_ROUND",
                        "image_uri": current_card["image_uri"],
                        "options": current_card["options"],
                        "start_time": round_start_time
                    })
                else:
                    # Si falla antes de tiempo, NO cambiamos de carta. El jugador se queda bloqueado esperando.
                    pass

    except WebSocketDisconnect:
        manager.disconnect(websocket, room_id)
    except Exception as e:
        print(f"❌ Excepción en WebSocket de juego: {e}")
        manager.disconnect(websocket, room_id)