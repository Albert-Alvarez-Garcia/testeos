from fastapi import APIRouter, HTTPException, Depends
from backend.database import get_db_connection
from backend.routers.containers import get_current_user

router = APIRouter(prefix="/api/achievements", tags=["Achievements"])

# Definición de las medallas. "stat" indica qué contador alimenta cada una.
ACHIEVEMENTS = [
    {
        "id": "first_container",
        "name": "Primer contenedor",
        "description": "Crea tu primer contenedor.",
        "icon": "📦",
        "stat": "total_containers",
        "target": 1,
    },
    {
        "id": "first_card",
        "name": "Primera carta",
        "description": "Guarda al menos una carta en algún contenedor.",
        "icon": "🃏",
        "stat": "total_cards",
        "target": 1,
    },
    {
        "id": "complete_container",
        "name": "Contenedor completo",
        "description": "Llena por completo un contenedor.",
        "icon": "🏆",
        "stat": "complete_containers",
        "target": 1,
    },
    {
        "id": "cards_100",
        "name": "Coleccionista",
        "description": "Reúne 100 cartas.",
        "icon": "🥉",
        "stat": "total_cards",
        "target": 100,
    },
    {
        "id": "cards_500",
        "name": "Archivista",
        "description": "Reúne 500 cartas.",
        "icon": "🥈",
        "stat": "total_cards",
        "target": 500,
    },
    {
        "id": "cards_1000",
        "name": "Gran Bibliotecario",
        "description": "Reúne 1000 cartas.",
        "icon": "🥇",
        "stat": "total_cards",
        "target": 1000,
    },
]


def ensure_achievement_table(cursor) -> None:
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS user_achievements (
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            achievement_id VARCHAR(50) NOT NULL,
            unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (user_id, achievement_id)
        );
    """)


def record_milestone(cursor, user_id, achievement_id: str) -> None:
    """Persist the two one-time milestones. Caller owns the transaction."""
    ensure_achievement_table(cursor)
    cursor.execute("""
        INSERT INTO user_achievements (user_id, achievement_id)
        VALUES (%s, %s)
        ON CONFLICT (user_id, achievement_id) DO NOTHING;
    """, (user_id, achievement_id))


@router.get("/")
def get_achievements(current_user: dict = Depends(get_current_user)):
    """
    Los dos primeros hitos se conservan; los demás reflejan el estado actual.
    El progreso de los logros cuantitativos se calcula al consultar.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        user_id = current_user.get("id") if isinstance(current_user, dict) else current_user.id
        ensure_achievement_table(cursor)

        # Backfill idempotente: recupera hitos si una acción anterior no llegó a registrarlos.
        cursor.execute("SELECT 1 FROM containers WHERE user_id = %s LIMIT 1", (user_id,))
        if cursor.fetchone():
            record_milestone(cursor, user_id, "first_container")

        # Total de cartas en cualquiera de sus contenedores
        cursor.execute(
            """
            SELECT COUNT(cc.id) AS n
            FROM card_copies cc
            JOIN containers co ON cc.container_id = co.id
            WHERE co.user_id = %s;
            """,
            (user_id,)
        )
        total_cards = int(cursor.fetchone()["n"])
        if total_cards:
            record_milestone(cursor, user_id, "first_card")

        # Total de contenedores creados por el usuario
        cursor.execute(
            "SELECT COUNT(*) AS n FROM containers WHERE user_id = %s;",
            (user_id,)
        )
        total_containers = int(cursor.fetchone()["n"])

        # Contenedores completos: tienen huecos y ninguno está libre
        cursor.execute(
            """
            SELECT COUNT(*) AS n FROM (
                SELECT co.id
                FROM containers co
                JOIN container_slots s ON s.container_id = co.id
                WHERE co.user_id = %s
                GROUP BY co.id
                HAVING COUNT(*) > 0
                   AND COUNT(*) FILTER (WHERE s.is_occupied = FALSE) = 0
            ) AS complete_containers;
            """,
            (user_id,)
        )
        complete_containers = int(cursor.fetchone()["n"])

        stats = {
            "total_cards": total_cards,
            "total_containers": total_containers,
            "complete_containers": complete_containers,
        }

        cursor.execute("""
            SELECT achievement_id FROM user_achievements WHERE user_id = %s
        """, (user_id,))
        permanent = {row["achievement_id"] for row in cursor.fetchall()}

        achievements = []
        for a in ACHIEVEMENTS:
            value = stats[a["stat"]]
            is_milestone = a["id"] in ("first_container", "first_card")
            unlocked = a["id"] in permanent if is_milestone else value >= a["target"]
            achievements.append({
                "id": a["id"],
                "name": a["name"],
                "description": a["description"],
                "icon": a["icon"],
                "target": a["target"],
                "progress": a["target"] if unlocked and is_milestone else min(value, a["target"]),
                "unlocked": unlocked,
            })

        conn.commit()
        return {"stats": stats, "achievements": achievements}

    except Exception as e:
        print(f"❌ Error calculando logros: {e}")
        raise HTTPException(status_code=500, detail="Error interno al calcular los logros.")
    finally:
        cursor.close()
        conn.close()
