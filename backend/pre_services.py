import requests
from urllib.parse import quote
from backend.database import get_db_connection
HEADERS = {
    "User-Agent": "CardBinderPro/1.0",
    "Accept": "application/json"
}
def search_cards_by_substring(name: str):
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        # Búsqueda parcial local usando ILIKE y comodines %
        search_pattern = f"%{name.strip()}%"
        cursor.execute("""
            SELECT c.scryfall_id, c.name, c.mana_cost, c.oracle_text, c.type_line,
                   p.scryfall_printing_id, p.set_code, p.set_name, p.collector_number, 
                   p.rarity, p.image_uri, p.foil, p.nonfoil
            FROM cards c
            JOIN printings p ON p.card_id = c.id
            WHERE LOWER(c.name) LIKE LOWER(%s)
            LIMIT 20;
        """, (search_pattern,))
        
        local_cards = cursor.fetchall()
        if local_cards:
            print(f"🎯 [Local DB] Encontradas {len(local_cards)} cartas para el patrón: {name}")
            return [dict(card) for card in local_cards]

        # Fallback opcional con Scryfall (Búsqueda difusa/parcial en la API oficial)
        print(f"🌐 [Scryfall API] Sin coincidencias locales. Consultando búsqueda fuzzy en API para: {name}...")
        response = requests.get(f"https://api.scryfall.com/cards/search?q={quote(name)}", headers=HEADERS)
        
        if response.status_code != 200:
            return []

        data = response.json()
        scryfall_cards = data.get("data", [])[:10] # Cogemos los primeros 10 resultados
        
        results = []
        for card_data in scryfall_cards:
            # Lógica de guardado al vuelo (Self-healing) por cada carta encontrada
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