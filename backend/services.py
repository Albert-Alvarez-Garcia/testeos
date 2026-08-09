import requests
from urllib.parse import quote
from backend.database import get_db_connection

# Definimos HEADERS aquí arriba para que no vuelva a fallar por "not defined"
HEADERS = {
    "User-Agent": "CardBinderPro/1.0",
    "Accept": "application/json"
}

def search_cards_by_substring(name: str, card_type: str = None):
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        # Búsqueda parcial local usando ILIKE, combinando nombre y opcionalmente tipo
        search_pattern = f"%{name.strip()}%" if name and name.strip() else "%%"
        query = """
            SELECT c.scryfall_id, c.name, c.mana_cost, c.oracle_text, c.type_line,
                   p.scryfall_printing_id, p.set_code, p.set_name, p.collector_number, 
                   p.rarity, p.image_uri, p.foil, p.nonfoil
            FROM cards c
            JOIN printings p ON p.card_id = c.id
            WHERE LOWER(c.name) LIKE LOWER(%s)
        """
        params = [search_pattern]

        # Si el usuario añade un filtro de tipo, lo acoplamos dinámicamente
        if card_type and card_type.strip():
            query += " AND LOWER(c.type_line) LIKE LOWER(%s)"
            params.append(f"%{card_type.strip()}%")
        
        query += ";"
        cursor.execute(query, tuple(params))
        
        local_cards = cursor.fetchall()
        if local_cards:
            print(f"🎯 [Local DB] Encontradas {len(local_cards)} cartas para el patrón: {name}")
            return [dict(card) for card in local_cards]

        # Fallback con Scryfall solicitando explícitamente todas las impresiones (unique=prints)
        print(f"🌐 [Scryfall API] Sin coincidencias locales. Consultando todas las impresiones en API para: {name}...")
        scryfall_url = f"https://api.scryfall.com/cards/search?q={quote(name)}&unique=prints"
        response = requests.get(scryfall_url, headers=HEADERS)
        
        if response.status_code != 200:
            return []

        data = response.json()
        scryfall_cards = data.get("data", [])  # Trae todas las impresiones y artes disponibles sin recortar
        
        results = []
        for card_data in scryfall_cards:
            # Lógica de guardado al vuelo (Self-healing) por cada impresión encontrada
            scryfall_id = card_data.get("id")
            oracle_id = card_data.get("oracle_id", scryfall_id)
            card_name = card_data.get("name")
            mana_cost = card_data.get("mana_cost", "")
            oracle_text = card_data.get("oracle_text", "")
            type_line = card_data.get("type_line", "")

            cursor.execute("""
                INSERT INTO cards (scryfall_id, name, mana_cost, oracle_text, type_line)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (scryfall_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
                RETURNING id;
            """, (oracle_id, card_name, mana_cost, oracle_text, type_line))
            
            card_db_id = cursor.fetchone()["id"]

            set_code = card_data.get("set", "")
            set_name = card_data.get("set_name", "")
            collector_number = card_data.get("collector_number", "")
            rarity = card_data.get("rarity", "")
            
            image_uri = ""
            if "image_uris" in card_data:
                image_uri = card_data["image_uris"].get("normal", "")
            elif "card_faces" in card_data and "image_uris" in card_data["card_faces"][0]:
                image_uri = card_data["card_faces"][0]["image_uris"].get("normal", "")

            foil = card_data.get("foil", False)
            nonfoil = card_data.get("nonfoil", True)
            printing_unique_id = scryfall_id

            cursor.execute("""
                INSERT INTO printings (card_id, scryfall_printing_id, set_code, set_name, collector_number, rarity, image_uri, foil, nonfoil)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (scryfall_printing_id) DO NOTHING;
            """, (card_db_id, printing_unique_id, set_code, set_name, collector_number, rarity, image_uri, foil, nonfoil))

            results.append({
                "scryfall_id": oracle_id,
                "name": card_name,
                "mana_cost": mana_cost,
                "oracle_text": oracle_text,
                "type_line": type_line,
                "scryfall_printing_id": printing_unique_id,
                "set_code": set_code,
                "set_name": set_name,
                "collector_number": collector_number,
                "rarity": rarity,
                "image_uri": image_uri,
                "foil": foil,
                "nonfoil": nonfoil
            })

        conn.commit()
        return results

    except Exception as e:
        conn.rollback()
        print(f"❌ Error en el servicio de búsqueda parcial: {e}")
        return []
    finally:
        cursor.close()
        conn.close()

def register_new_user(username: str, email: str, password_hash: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            INSERT INTO users (username, email, password_hash, auth_type, badge_type)
            VALUES (%s, %s, %s, 'local', 'civil_homebrewer')
            RETURNING id, username, email, badge_type;
        """, (username.strip(), email.strip().lower(), password_hash))
        
        new_user = cursor.dict_fetch() if hasattr(cursor, 'dict_fetch') else cursor.fetchone()
        conn.commit()
        return {"success": True, "user": dict(new_user) if new_user else None}
    except Exception as e:
        conn.rollback()
        print(f"❌ Error al registrar usuario en BBDD: {e}")
        return {"success": False, "error": str(e)}
    finally:
        cursor.close()
        conn.close()

def get_user_by_username_or_email(identifier: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        query = """
            SELECT id, username, email, password_hash, badge_type, auth_type
            FROM users
            WHERE LOWER(username) = LOWER(%s) OR LOWER(email) = LOWER(%s);
        """
        cursor.execute(query, (identifier.strip(), identifier.strip()))
        user = cursor.dict_fetch() if hasattr(cursor, 'dict_fetch') else cursor.fetchone()
        return dict(user) if user else None
    except Exception as e:
        print(f"❌ Error al buscar usuario para login: {e}")
        return None
    finally:
        cursor.close()
        conn.close()

def get_user_by_username(username: str):
    """Busca un usuario exclusivamente por username."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT id, username, email, password_hash, badge_type, auth_type
            FROM users
            WHERE LOWER(username) = LOWER(%s);
        """, (username.strip(),))
        user = cursor.dict_fetch() if hasattr(cursor, 'dict_fetch') else cursor.fetchone()
        return dict(user) if user else None
    finally:
        cursor.close()
        conn.close()

def create_42_user(username: str, email: str, password_hash: str):
    """Crea un usuario autenticado mediante 42."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            INSERT INTO users (username, email, password_hash, auth_type, badge_type)
            VALUES (%s, %s, %s, '42', '42_student')
            RETURNING id, username, email, badge_type, auth_type;
        """, (username.strip(), email.strip().lower(), password_hash))
        new_user = cursor.dict_fetch() if hasattr(cursor, 'dict_fetch') else cursor.fetchone()
        conn.commit()
        return {"success": True, "user": dict(new_user) if new_user else None}
    except Exception as e:
        conn.rollback()
        print(f"❌ Error al crear usuario 42 en BBDD: {e}")
        return {"success": False, "error": str(e)}
    finally:
        cursor.close()
        conn.close()

def update_user_auth_type_to_42(username: str):
    """Vincula una cuenta local existente con 42."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            UPDATE users
            SET auth_type = '42', badge_type = '42_student'
            WHERE LOWER(username) = LOWER(%s)
            RETURNING id, username, email, badge_type, auth_type;
        """, (username.strip(),))
        user = cursor.dict_fetch() if hasattr(cursor, 'dict_fetch') else cursor.fetchone()
        conn.commit()
        return dict(user) if user else None
    except Exception as e:
        conn.rollback()
        print(f"❌ Error al vincular usuario 42: {e}")
        return None
    finally:
        cursor.close()
        conn.close()