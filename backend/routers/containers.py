from fastapi import APIRouter, HTTPException, Depends, Header
from pydantic import BaseModel
from typing import Optional
from backend.database import get_db_connection
from backend.services import get_user_by_username_or_email

router = APIRouter(prefix="/api/containers", tags=["Containers"])

# Dependencia para obtener el usuario actual mediante la cabecera X-Username
async def get_current_user(x_username: str = Header(None)):
    if not x_username:
        raise HTTPException(
            status_code=401, 
            detail="No se ha proporcionado el usuario en la cabecera (Falta X-Username)."
        )
    
    user = get_user_by_username_or_email(x_username)
    if not user:
        raise HTTPException(
            status_code=401, 
            detail="Usuario no encontrado en la base de datos."
        )
    return user

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

class MoveCardRequest(BaseModel):
    copy_id: str
    from_slot_id: str
    to_slot_id: str

class MoveCardBetweenContainersRequest(BaseModel):
    copy_id: str
    target_container_id: str
    target_slot_id: Optional[str] = None # Si es null, busca el primer hueco libre automáticamente

@router.post("/")
def create_container(data: ContainerCreate, current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        user_id = current_user.get("id") if isinstance(current_user, dict) else current_user.id

        cursor.execute(
            """
            INSERT INTO containers (user_id, name, type, max_capacity, slots_per_page, total_pages, sideboard_capacity)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING id, user_id, name, type, max_capacity, slots_per_page, total_pages, sideboard_capacity, created_at;
            """,
            (
                user_id,
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

        def insert_slots(count: int, section: str = 'main', page: int = 1):
            for slot_idx in range(1, count + 1):
                cursor.execute(
                    """
                    INSERT INTO container_slots (container_id, page_number, slot_index, section, is_occupied)
                    VALUES (%s, %s, %s, %s, FALSE)
                    """,
                    (container_id, page, slot_idx, section)
                )

        tipo = data.type.lower()
        is_binder = 'binder' in tipo

        if is_binder:
            slots_map = {
                'binder_s': 4,   # Formato 2x2
                'binder_m': 9,   # Formato 3x3
                'binder_xl': 12  # Formato 4x3
            }
            slots_per_page = slots_map.get(tipo, data.slots_per_page if data.slots_per_page in [4, 9, 12] else 9)
            total_pages = data.total_pages or 40
            
            for page in range(1, total_pages + 1):
                insert_slots(slots_per_page, section='main', page=page)

        elif tipo == 'deck':
            main_cap = data.max_capacity or 60
            side_cap = data.sideboard_capacity or 15
            insert_slots(main_cap, section='main')
            insert_slots(side_cap, section='sideboard')

        else:  # Para cajas u otros tipos libres ('box')
            box_cap = data.max_capacity or 1000
            insert_slots(box_cap, section='main')

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
def list_containers(current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        user_id = current_user.get("id") if isinstance(current_user, dict) else current_user.id
        
        # Filtramos estrictamente por el user_id del usuario autenticado
        cursor.execute(
            """
            SELECT id, user_id, name, type, max_capacity, slots_per_page, total_pages, sideboard_capacity, created_at 
            FROM containers 
            WHERE user_id = %s 
            ORDER BY created_at DESC;
            """,
            (user_id,)
        )
        containers = cursor.fetchall()
        return [dict(c) for c in containers]
    finally:
        cursor.close()
        conn.close()

@router.post("/items")
def add_card_to_container(data: AddCardToContainerRequest, current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        user_id = current_user.get("id") if isinstance(current_user, dict) else current_user.id
        cursor.execute("SELECT id FROM containers WHERE id = %s AND user_id = %s;", (data.container_id, user_id))
        if not cursor.fetchone():
            raise HTTPException(status_code=403, detail="No tienes permisos sobre este contenedor o no existe.")

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
def get_container_slots_with_cards(container_id: str, current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        user_id = current_user.get("id") if isinstance(current_user, dict) else current_user.id
        cursor.execute("SELECT id FROM containers WHERE id = %s AND user_id = %s;", (container_id, user_id))
        if not cursor.fetchone():
            raise HTTPException(status_code=403, detail="No tienes permisos para ver este contenedor.")

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

    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"❌ Error al obtener los slots del contenedor: {e}")
        raise HTTPException(status_code=500, detail="Error interno al cargar la estructura del contenedor.")
    finally:
        cursor.close()
        conn.close()

@router.put("/{container_id}/slots")
def update_container_slots_layout(container_id: str, slots_data: list[dict], current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        user_id = current_user.get("id") if isinstance(current_user, dict) else current_user.id
        cursor.execute("SELECT id FROM containers WHERE id = %s AND user_id = %s;", (container_id, user_id))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Contenedor no encontrado o sin permisos.")

        cursor.execute(
            """
            UPDATE card_copies 
            SET slot_id = NULL 
            WHERE container_id = %s;
            """,
            (container_id,)
        )

        cursor.execute(
            """
            UPDATE container_slots 
            SET is_occupied = FALSE 
            WHERE container_id = %s;
            """,
            (container_id,)
        )

        for slot in slots_data:
            slot_index = slot.get("slot_index")
            page_number = slot.get("page_number", 1)
            is_occupied = slot.get("is_occupied", False)
            copy_id = slot.get("copy_id")

            cursor.execute(
                """
                SELECT id FROM container_slots 
                WHERE container_id = %s AND page_number = %s AND slot_index = %s
                LIMIT 1;
                """,
                (container_id, page_number, slot_index)
            )
            slot_row = cursor.fetchone()

            if slot_row:
                target_slot_id = slot_row["id"]

                if is_occupied:
                    cursor.execute(
                        """
                        UPDATE container_slots 
                        SET is_occupied = TRUE 
                        WHERE id = %s;
                        """,
                        (target_slot_id,)
                    )

                    if copy_id:
                        cursor.execute(
                            """
                            UPDATE card_copies 
                            SET slot_id = %s 
                            WHERE id = %s AND container_id = %s;
                            """,
                            (target_slot_id, copy_id, container_id)
                        )

        conn.commit()
        return {"status": "success", "message": "Distribución del contenedor actualizada correctamente."}

    except HTTPException as he:
        conn.rollback()
        raise he
    except Exception as e:
        conn.rollback()
        print(f"❌ Error al actualizar los slots del contenedor: {e}")
        raise HTTPException(status_code=500, detail="Error interno al actualizar la distribución.")
    finally:
        cursor.close()
        conn.close()

@router.post("/move-cross-container")
def move_card_between_containers(data: MoveCardBetweenContainersRequest, current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        user_id = current_user.get("id") if isinstance(current_user, dict) else current_user.id

        cursor.execute(
            """
            SELECT id, container_id, slot_id 
            FROM card_copies 
            WHERE id = %s;
            """,
            (data.copy_id,)
        )
        copy_row = cursor.fetchone()
        if not copy_row:
            raise HTTPException(status_code=404, detail="La copia de la carta especificada no existe.")
        
        old_slot_id = copy_row["slot_id"]

        cursor.execute("SELECT id, type FROM containers WHERE id = %s AND user_id = %s;", (data.target_container_id, user_id))
        target_container = cursor.fetchone()
        if not target_container:
            raise HTTPException(status_code=404, detail="El contenedor de destino no existe o no te pertenece.")

        target_slot_id = data.target_slot_id
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
                (data.target_container_id,)
            )
            free_slot = cursor.fetchone()
            if not free_slot:
                raise HTTPException(status_code=400, detail="El contenedor de destino está completamente lleno.")
            target_slot_id = free_slot["id"]
        else:
            cursor.execute(
                """
                SELECT is_occupied FROM container_slots 
                WHERE id = %s AND container_id = %s;
                """,
                (target_slot_id, data.target_container_id)
            )
            slot_check = cursor.fetchone()
            if not slot_check:
                raise HTTPException(status_code=404, detail="El slot de destino no es válido para este contenedor.")
            if slot_check["is_occupied"]:
                raise HTTPException(status_code=400, detail="El slot de destino seleccionado ya está ocupado.")

        if old_slot_id:
            cursor.execute(
                """
                UPDATE container_slots 
                SET is_occupied = FALSE 
                WHERE id = %s;
                """,
                (old_slot_id,)
            )

        cursor.execute(
            """
            UPDATE container_slots 
            SET is_occupied = TRUE 
            WHERE id = %s;
            """,
            (target_slot_id,)
        )

        cursor.execute(
            """
            UPDATE card_copies 
            SET container_id = %s, slot_id = %s 
            WHERE id = %s
            RETURNING id, container_id, slot_id, condition, language, is_foil;
            """,
            (data.target_container_id, target_slot_id, data.copy_id)
        )
        updated_copy = cursor.fetchone()

        conn.commit()
        return {"status": "success", "message": "Carta movida de contenedor con éxito.", "copy": dict(updated_copy)}

    except HTTPException as he:
        conn.rollback()
        raise he
    except Exception as e:
        conn.rollback()
        print(f"❌ Error al mover carta entre contenedores: {e}")
        raise HTTPException(status_code=500, detail="Error interno al trasladar la carta.")
    finally:
        cursor.close()
        conn.close()