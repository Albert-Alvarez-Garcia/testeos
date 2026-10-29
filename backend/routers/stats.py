"""Estadísticas, historial de partidas y ranking (todos los juegos: 'guess_card', 'pong', ...)."""
from fastapi import APIRouter, Depends, Query
from backend.database import get_db_connection
from backend.security import session_username

router = APIRouter(prefix="/api/stats", tags=["Stats"])
_ready = False


def _ensure_tables(cur):
    global _ready
    if _ready:
        return
    cur.execute("""
        CREATE TABLE IF NOT EXISTS game_results (
            id BIGSERIAL PRIMARY KEY,
            game TEXT NOT NULL,
            room_id TEXT,
            winner TEXT,
            players_count INT NOT NULL DEFAULT 0,
            finished_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );""")
    cur.execute("""
        CREATE TABLE IF NOT EXISTS game_players (
            result_id BIGINT NOT NULL REFERENCES game_results(id) ON DELETE CASCADE,
            username TEXT NOT NULL,
            score INT NOT NULL DEFAULT 0,
            position INT NOT NULL,
            is_winner BOOLEAN NOT NULL DEFAULT FALSE,
            PRIMARY KEY (result_id, username)
        );""")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_game_players_user ON game_players (username);")
    _ready = True


def save_game_result(game: str, room_id: str, ranking: list, winner: str):
    """Guarda una partida terminada. ranking = [{'username','score'}, ...] ordenado de mayor a menor."""
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        _ensure_tables(cur)
        cur.execute(
            "INSERT INTO game_results (game, room_id, winner, players_count) VALUES (%s,%s,%s,%s) RETURNING id",
            (game, room_id, winner, len(ranking)))
        rid = cur.fetchone()["id"]
        for pos, p in enumerate(ranking, start=1):
            cur.execute(
                "INSERT INTO game_players (result_id, username, score, position, is_winner) VALUES (%s,%s,%s,%s,%s) "
                "ON CONFLICT DO NOTHING",
                (rid, p["username"], int(p.get("score", 0)), pos, p["username"] == winner))
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _query(sql, params=()):
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        _ensure_tables(cur)
        conn.commit()
        cur.execute(sql, params)
        return cur.fetchall()
    finally:
        conn.close()


@router.get("/me")
def my_stats(game: str = Query(None, max_length=30), username: str = Depends(session_username)):
    flt, params = ("AND r.game = %s", (username, game)) if game else ("", (username,))
    s = _query(f"""
        SELECT count(*) AS games, count(*) FILTER (WHERE p.is_winner) AS wins,
               COALESCE(sum(p.score),0) AS points, COALESCE(max(p.score),0) AS best
        FROM game_players p JOIN game_results r ON r.id = p.result_id
        WHERE p.username = %s {flt}""", params)[0]
    history = _query(f"""
        SELECT r.id, r.game, r.finished_at, p.score, p.position, p.is_winner,
               COALESCE((SELECT array_agg(o.username ORDER BY o.position) FROM game_players o
                         WHERE o.result_id = r.id AND o.username <> p.username), '{{}}') AS opponents
        FROM game_players p JOIN game_results r ON r.id = p.result_id
        WHERE p.username = %s {flt} ORDER BY r.id DESC LIMIT 20""", params)
    games, wins = int(s["games"]), int(s["wins"])
    return {
        "username": username,
        "summary": {"games": games, "wins": wins, "losses": games - wins,
                    "win_rate": round(100 * wins / games) if games else 0,
                    "points": int(s["points"]), "best": int(s["best"])},
        "history": history,
    }


@router.get("/leaderboard")
def leaderboard(game: str = Query(None, max_length=30), username: str = Depends(session_username)):
    flt, params = ("WHERE r.game = %s", (game,)) if game else ("", ())
    rows = _query(f"""
        SELECT p.username, count(*) AS games, count(*) FILTER (WHERE p.is_winner) AS wins,
               COALESCE(sum(p.score),0) AS points
        FROM game_players p JOIN game_results r ON r.id = p.result_id {flt}
        GROUP BY p.username ORDER BY wins DESC, points DESC, games ASC LIMIT 10""", params)
    return {"leaderboard": [{**r, "games": int(r["games"]), "wins": int(r["wins"]), "points": int(r["points"])} for r in rows]}


# ---------------- XP y nivel (calculados con datos persistentes de la BBDD) ----------------
XP_CARD, XP_CONTAINER, XP_MEDAL, XP_GAME, XP_WIN = 2, 25, 50, 20, 50
MEDAL_CARD_TARGETS = (1, 100, 500, 1000)   # coinciden con las medallas de achievements.py


@router.get("/xp")
def my_xp(username: str = Depends(session_username)):
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        _ensure_tables(cur)
        conn.commit()
        cur.execute("SELECT id FROM users WHERE username = %s", (username,))
        u = cur.fetchone()
        cards = containers = 0
        if u:
            cur.execute("SELECT COUNT(cc.id) AS n FROM card_copies cc JOIN containers co ON cc.container_id = co.id "
                        "WHERE co.user_id = %s", (u["id"],))
            cards = int(cur.fetchone()["n"])
            cur.execute("SELECT COUNT(*) AS n FROM containers WHERE user_id = %s", (u["id"],))
            containers = int(cur.fetchone()["n"])
        cur.execute("SELECT count(*) AS g, count(*) FILTER (WHERE is_winner) AS w FROM game_players WHERE username = %s",
                    (username,))
        g = cur.fetchone()
        games, wins = int(g["g"]), int(g["w"])
    finally:
        conn.close()
    medals = (1 if containers >= 1 else 0) + sum(1 for t in MEDAL_CARD_TARGETS if cards >= t)
    parts = {"cards": cards * XP_CARD, "containers": containers * XP_CONTAINER, "medals": medals * XP_MEDAL,
             "games": games * XP_GAME, "wins": wins * XP_WIN}
    xp = sum(parts.values())
    level = 1 + int((xp / 100) ** 0.5)
    start, nxt = 100 * (level - 1) ** 2, 100 * level ** 2
    return {"xp": xp, "level": level, "level_start": start, "next_level_xp": nxt,
            "progress": round(100 * (xp - start) / (nxt - start)), "breakdown": parts}
