from fastapi import APIRouter, HTTPException, Depends, Header
from pydantic import BaseModel, Field
from typing import Optional
from backend.database import get_db_connection
from backend.services import get_user_by_username_or_email
from fastapi import Depends
from backend.security import session_username

router = APIRouter(prefix="/api/containers", tags=["Containers"])

# Dependencia para obtener el usuario actual mediante la cabecera X-Username
async def get_current_user(x_username: str = Depends(session_username)):
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
    name: str = Field(..., min_length=1, max_length=60)
    type: str = Field(..., min_length=1, max_length=20)  # 'binder', 'binder_s', 'binder_m', 'binder_xl', 'deck', 'box'
    max_capacity: Optional[int] = Field(None, ge=0, le=100000)
    slots_per_page: Optional[int] = Field(9, ge=0, le=100)
    total_pages: Optional[int] = Field(None, ge=0, le=10000)
    sideboard_capacity: Optional[int] = Field(None, ge=0, le=1000)

class AddCardToContainerRequest(BaseModel):
    printing_id: str
    container_id: str
    slot_id: Optional[str] = None
    condition: Optional[str] = Field("Near Mint", max_length=30)
    language: Optional[str] = Field("en", max_length=10)
    is_foil: Optional[bool] = False
    notes: Optional[str] = Field(None, max_length=500)
    quantity: int = Field(1, ge=1, le=99)

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
            WHERE p.scryfall_printing_id = %s OR p.id::text = %s
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

        if data.slot_id and data.quantity > 1:
            raise HTTPException(
                status_code=400,
                detail="No se puede indicar un slot concreto al añadir más de una copia."
            )

        if data.slot_id:
            target_slot_ids = [data.slot_id]
        else:
            # Bloqueamos los huecos libres para que dos peticiones simultáneas no se pisen
            cursor.execute(
                """
                SELECT id FROM container_slots
                WHERE container_id = %s AND is_occupied = FALSE
                ORDER BY
                    CASE WHEN section = 'main' THEN 1 ELSE 2 END ASC,
                    page_number ASC,
                    slot_index ASC
                LIMIT %s
                FOR UPDATE;
                """,
                (data.container_id, data.quantity)
            )
            target_slot_ids = [str(row["id"]) for row in cursor.fetchall()]

            if len(target_slot_ids) < data.quantity:
                libres = len(target_slot_ids)
                raise HTTPException(
                    status_code=409,
                    detail=(
                        f"No caben {data.quantity} copias en este contenedor. "
                        f"Solo hay {libres} hueco(s) libre(s)."
                    )
                )

        new_copies = []
        for slot_id in target_slot_ids:
            cursor.execute(
                """
                INSERT INTO card_copies (printing_id, container_id, slot_id, condition, language, is_foil, notes)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING id, container_id, slot_id, condition, language, is_foil, created_at;
                """,
                (
                    internal_printing_id,
                    data.container_id,
                    slot_id,
                    data.condition,
                    data.language,
                    data.is_foil,
                    data.notes
                )
            )
            new_copies.append(dict(cursor.fetchone()))

        cursor.execute(
            "UPDATE container_slots SET is_occupied = TRUE WHERE id = ANY(%s::uuid[]);",
            (target_slot_ids,)
        )

        conn.commit()
        return {"status": "success", "added": len(new_copies), "copies": new_copies}

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

@router.delete("/items/{copy_id}")
def delete_card_copy(copy_id: str, current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        user_id = current_user.get("id") if isinstance(current_user, dict) else current_user.id

        # Verificar que la copia existe y pertenece a un contenedor del usuario
        cursor.execute(
            """
            SELECT cc.id, cc.slot_id 
            FROM card_copies cc
            JOIN containers co ON cc.container_id = co.id
            WHERE cc.id = %s AND co.user_id = %s;
            """,
            (copy_id, user_id)
        )
        copy_row = cursor.fetchone()
        if not copy_row:
            raise HTTPException(status_code=404, detail="La copia de la carta especificada no existe o no tienes permisos.")

        slot_id = copy_row["slot_id"]

        # 1. Liberar el slot exacto
        if slot_id:
            cursor.execute(
                """
                UPDATE container_slots 
                SET is_occupied = FALSE 
                WHERE id = %s;
                """,
                (slot_id,)
            )

        # 2. Eliminar la copia física de la base de datos
        cursor.execute(
            """
            DELETE FROM card_copies 
            WHERE id = %s;
            """,
            (copy_id,)
        )

        conn.commit()
        return {"status": "success", "message": "Copia de carta eliminada y slot liberado con éxito."}

    except HTTPException as he:
        conn.rollback()
        raise he
    except Exception as e:
        conn.rollback()
        print(f"❌ Error al eliminar la copia de la carta: {e}")
        raise HTTPException(status_code=500, detail="Error interno al eliminar la carta.")
    finally:
        cursor.close()
        conn.close()