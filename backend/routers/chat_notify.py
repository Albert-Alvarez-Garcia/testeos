"""Avisos de partida en el chat global. Uso: await announce_game("Adivina la Carta", ganador, ranking)
(ranking = [{"username": ..., "score": ...}, ...]). También sirve para Pong."""
import asyncio
from datetime import datetime, timezone

from backend.database import get_db_connection
from backend.routers.chat import manager, _iso_utc

SYSTEM_USER = "Sistema"


def _insert(text):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            INSERT INTO chat_messages (username, user_login, badge_type, message, created_at)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id, username, user_login, badge_type, message, created_at;""",
                    (SYSTEM_USER, SYSTEM_USER, "civil_homebrewer", text, datetime.now(timezone.utc)))
        row = cur.fetchone()
        conn.commit()
        return row
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


async def announce_game(game: str, winner: str, ranking: list):
    rivals = [r["username"] for r in ranking if r["username"] != winner]
    text = f"🏆 {winner} ha ganado una partida de {game}" + (f" contra {', '.join(rivals)}" if rivals else "")
    row = await asyncio.to_thread(_insert, text[:300])
    await manager.broadcast({
        "id": str(row["id"]), "username": row["username"], "user_login": row["user_login"],
        "badge_type": row["badge_type"], "message": row["message"], "created_at": _iso_utc(row["created_at"]),
    })
