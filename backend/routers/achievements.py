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


@router.get("/")
def get_achievements(current_user: dict = Depends(get_current_user)):
    """
    Calcula al vuelo las estadísticas del usuario autenticado y el estado
    (desbloqueada / progreso) de cada medalla. No se guarda nada en base de datos.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        user_id = current_user.get("id") if isinstance(current_user, dict) else current_user.id

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

        achievements = []
        for a in ACHIEVEMENTS:
            value = stats[a["stat"]]
            achievements.append({
                "id": a["id"],
                "name": a["name"],
                "description": a["description"],
                "icon": a["icon"],
                "target": a["target"],
                "progress": min(value, a["target"]),
                "unlocked": value >= a["target"],
            })

        return {"stats": stats, "achievements": achievements}

    except Exception as e:
        print(f"❌ Error calculando logros: {e}")
        raise HTTPException(status_code=500, detail="Error interno al calcular los logros.")
    finally:
        cursor.close()
        conn.close()
