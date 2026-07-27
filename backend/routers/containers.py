from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from backend.database import get_db_connection

router = APIRouter(prefix="/api/containers", tags=["Containers"])

class ContainerCreate(BaseModel):
    name: str
    type: str  # Recibirá 'binder', 'binder_s', 'binder_m', 'binder_xl', 'deck', 'box'
    max_capacity: Optional[int] = None
    slots_per_page: Optional[int] = 9
    total_pages: Optional[int] = None
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
        # 1. Insertar el contenedor maestro respetando estrictamente el esquema SQL
        cursor.execute(
            """
            INSERT INTO containers (name, type, max_capacity, slots_per_page, total_pages, sideboard_capacity)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id, name, type, max_capacity, slots_per_page, total_pages, sideboard_capacity, created_at;
            """,
            (
                data.name, 
                data.type, 
                data.max_capacity, 
                data.slots_per_page, 
                data.total_pages, 
                data.sideboard_capacity
            )
        )
        new_container = cursor.fetchone()
        container_id = new_container["id"]

        # Función auxiliar interna para insertar slots
        def insert_slots(count: int, section: str, page: int = 1):
            for slot_idx in range(1, count + 1):
                cursor.execute(
                    """
                    INSERT INTO container_slots (container_id, page_number, slot_index, section, is_occupied)
                    VALUES (%s, %s, %s, %s, FALSE)
                    """,
                    (container_id, page, slot_idx, section)
                )

        # 2. Generación automática de slots robusta para 2x2 (4), 3x3 (9) y 4x3 (12)
        is_binder = data.type == 'binder' or data.type.startswith('binder_')
        
        if is_binder and data.total_pages:
            # Mapeo exacto según la variante enviada o el slots_per_page recibido
            slots_map = {
                'binder_s': 4,   # Formato 2x2
                'binder_m': 9,   # Formato 3x3
                'binder_xl': 12  # Formato 4x3
            }
            
            slots_per_page = slots_map.get(data.type, data.slots_per_page if data.slots_per_page in [4, 9, 12] else 9)
            
            for page in range(1, data.total_pages + 1):
                insert_slots(slots_per_page, 'main', page=page)

        elif data.type == 'deck':
            main_cap = data.max_capacity or 60
            side_cap = data.sideboard_capacity or 15
            insert_slots(main_cap, 'main')
            insert_slots(side_cap, 'sideboard')

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
        cursor.execute("SELECT id, name, type, max_capacity, slots_per_page, total_pages, sideboard_capacity, created_at FROM containers ORDER BY created_at DESC;")
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
        cursor.execute(
            """
            SELECT p.id 
            FROM printings p
            JOIN cards c ON p.card_id = c.id
            WHERE c.scryfall_id::text = %s OR p.id::text = %s
            LIMIT 1;
            """,
            (data.printing_id, data.printing_id)
        )
        printing_row = cursor.fetchone()
        
        if not printing_row:
            raise HTTPException(
                status_code=404,
                detail=f"No se ha encontrado ninguna impresión asociada al identificador: {data.printing_id}"
            )
        
        internal_printing_id = printing_row["id"]

        target_slot_id = data.slot_id
        if not target_slot_id:
            cursor.execute(
                """
                SELECT id FROM container_slots 
                WHERE container_id = %s AND is_occupied = FALSE 
                ORDER BY 
                    CASE WHEN section = 'main' THEN 1 ELSE 2 END ASC,
                    page_number ASC, 
                    slot_index ASC 
                LIMIT 1;
                """,
                (data.container_id,)
            )
            free_slot = cursor.fetchone()
            if free_slot:
                target_slot_id = free_slot["id"]

        if not target_slot_id:
            raise HTTPException(
                status_code=400, 
                detail="No hay huecos libres disponibles en este contenedor o no se han generado."
            )

        cursor.execute(
            """
            INSERT INTO card_copies (printing_id, container_id, slot_id, condition, language, is_foil, notes)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING id, container_id, slot_id, condition, language, is_foil, created_at;
            """,
            (
                internal_printing_id, 
                data.container_id, 
                target_slot_id, 
                data.condition, 
                data.language, 
                data.is_foil, 
                data.notes
            )
        )
        new_copy = cursor.fetchone()

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

    except HTTPException as he:
        conn.rollback()
        raise he
    except Exception as e:
        conn.rollback()
        print(f"❌ Error al añadir carta al contenedor: {e}")
        raise HTTPException(status_code=500, detail="Error interno al guardar la carta en el contenedor.")
    finally:
        cursor.close()
        conn.close()

@router.get("/{container_id}/slots")
def get_container_slots_with_cards(container_id: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            SELECT 
                s.id AS slot_id,
                s.container_id,
                s.page_number,
                s.slot_index,
                s.section,
                s.is_occupied,
                c.id AS copy_id,
                c.condition,
                c.language,
                c.is_foil,
                c.notes,
                sc.id AS card_id,
                sc.name AS card_name,
                sc.mana_cost,
                sc.type_line,
                p.image_uri
            FROM container_slots s
            LEFT JOIN card_copies c ON c.slot_id = s.id
            LEFT JOIN printings p ON c.printing_id = p.id
            LEFT JOIN cards sc ON p.card_id = sc.id
            WHERE s.container_id = %s
            ORDER BY s.page_number ASC, s.slot_index ASC;
            """,
            (container_id,)
        )
        slots = cursor.fetchall()
        return [dict(slot) for slot in slots]

    except Exception as e:
        print(f"❌ Error al obtener los slots del contenedor: {e}")
        raise HTTPException(status_code=500, detail="Error interno al cargar la estructura del contenedor.")
    finally:
        cursor.close()
        conn.close()