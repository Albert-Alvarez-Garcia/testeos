from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from backend.database import get_db_connection

router = APIRouter(prefix="/api/containers", tags=["Containers"])

class ContainerCreate(BaseModel):
    name: str
    type: str  # 'binder', 'box', 'deck'
    max_capacity: Optional[int] = None
    sideboard_capacity: Optional[int] = None

class AddCardToContainerRequest(BaseModel):
    printing_id: str
    container_id: str
    slot_id: Optional[str] = None
    condition: Optional[str] = "Near Mint"
    language: Optional[str] = "en"
    is_foil: Optional[bool] = False
    notes: Optional[str] = None

@router.post("/")
def create_container(data: ContainerCreate):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # 1. Insertar el contenedor maestro
        cursor.execute(
            """
            INSERT INTO containers (name, type, max_capacity, sideboard_capacity)
            VALUES (%s, %s, %s, %s)
            RETURNING id, name, type, max_capacity, sideboard_capacity, created_at;
            """,
            (data.name, data.type, data.max_capacity, data.sideboard_capacity)
        )
        new_container = cursor.fetchone()
        container_id = new_container["id"]

        # 2. Si es un Binder, podemos generar los slots automáticos (ej. hojas de 9 huecos)
        if data.type == 'binder' and data.max_capacity:
            slots_per_page = 9
            total_pages = (data.max_capacity + slots_per_page - 1) // slots_per_page
            
            for page in range(1, total_pages + 1):
                for slot_idx in range(1, slots_per_page + 1):
                    # Evitar superar la capacidad máxima exacta si no es múltiplo de 9
                    current_slot_number = ((page - 1) * slots_per_page) + slot_idx
                    if current_slot_number > data.max_capacity:
                        break
                    
                    cursor.execute(
                        """
                        INSERT INTO container_slots (container_id, page_number, slot_index, section)
                        VALUES (%s, %s, %s, 'main')
                        """,
                        (container_id, page, slot_idx)
                    )

        # 3. Si es un Deck, podemos generar slots para el main y el sideboard
        elif data.type == 'deck':
            main_cap = data.max_capacity or 60
            side_cap = data.sideboard_capacity or 15
            
            # Slots principales
            for slot_idx in range(1, main_cap + 1):
                cursor.execute(
                    """
                    INSERT INTO container_slots (container_id, page_number, slot_index, section)
                    VALUES (%s, 1, %s, 'main')
                    """,
                    (container_id, slot_idx)
                )
            # Slots de banquillo/reserva
            for slot_idx in range(1, side_cap + 1):
                cursor.execute(
                    """
                    INSERT INTO container_slots (container_id, page_number, slot_index, section)
                    VALUES (%s, 1, %s, 'sideboard')
                    """,
                    (container_id, slot_idx)
                )

        conn.commit()
        return dict(new_container)

    except Exception as e:
        conn.rollback()
        print(f"❌ Error al crear contenedor: {e}")
        raise HTTPException(status_code=500, detail="Error interno al crear el contenedor.")
    finally:
        cursor.close()
        conn.close()

@router.get("/")
def list_containers():
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id, name, type, max_capacity, sideboard_capacity, created_at FROM containers ORDER BY created_at DESC;")
        containers = cursor.fetchall()
        return [dict(c) for c in containers]
    finally:
        cursor.close()
        conn.close()

@router.post("/items")
def add_card_to_container(data: AddCardToContainerRequest):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        target_slot_id = data.slot_id
        # Si no se especifica slot, buscamos el primer hueco libre disponible en el contenedor
        if not target_slot_id:
            cursor.execute(
                """
                SELECT id FROM container_slots 
                WHERE container_id = %s AND is_occupied = FALSE 
                ORDER BY page_number ASC, slot_index ASC 
                LIMIT 1;
                """,
                (data.container_id,)
            )
            free_slot = cursor.fetchone()
            if free_slot:
                target_slot_id = free_slot["id"]

        # Insertar la copia física de la carta vinculada al contenedor y opcionalmente al slot
        cursor.execute(
            """
            INSERT INTO card_copies (printing_id, container_id, slot_id, condition, language, is_foil, notes)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING id, container_id, slot_id, condition, language, is_foil, created_at;
            """,
            (
                data.printing_id, 
                data.container_id, 
                target_slot_id, 
                data.condition, 
                data.language, 
                data.is_foil, 
                data.notes
            )
        )
        new_copy = cursor.fetchone()

        # Si se ocupó un slot, lo marcamos como True
        if target_slot_id:
            cursor.execute(
                """
                UPDATE container_slots 
                SET is_occupied = TRUE 
                WHERE id = %s;
                """,
                (target_slot_id,)
            )

        conn.commit()
        return {"status": "success", "copy": dict(new_copy)}

    except Exception as e:
        conn.rollback()
        print(f"❌ Error al añadir carta al contenedor: {e}")
        raise HTTPException(status_code=500, detail="Error interno al guardar la carta en el contenedor.")
    finally:
        cursor.close()
        conn.close()