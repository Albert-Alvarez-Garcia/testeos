import os
import json
import psycopg2
from psycopg2.extras import execute_values

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "card_binder_db")
DB_USER = os.getenv("DB_USER", "binder_user")
DB_PASSWORD = os.getenv("DB_PASSWORD", "binder_password")

DATA_FILE = os.path.join("data", "default-cards.json")

def import_from_local_json():
    if not os.path.exists(DATA_FILE):
        print(f"❌ No se encuentra el archivo local {DATA_FILE}. Ejecuta primero la descarga.")
        return

    print(f"📂 Leyendo el archivo local {DATA_FILE}...")
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        cards_data = json.load(f)

    print(f"⚙️ Procesando cartas y todas sus impresiones usando Oracle ID...")

    conn = psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        database=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD
    )
    cursor = conn.cursor()

    cards_map = {}
    printings_batch = []
    seen_printings = set()

    for card in cards_data:
        if card.get("layout") in ["token", "card_back"]:
            continue

        # Usamos el oracle_id para agrupar todas las impresiones de una misma carta lógica
        oracle_id = card.get("oracle_id")
        scryfall_id = card.get("id") # Este pasa a ser el identificador único de esta impresión específica
        
        if not oracle_id:
            # Fallback por si alguna carta antigua no viniera con oracle_id
            oracle_id = scryfall_id

        name = card.get("name")
        mana_cost = card.get("mana_cost", "")
        oracle_text = card.get("oracle_text", "")
        type_line = card.get("type_line", "")

        # Guardamos la carta lógica única basada en su oracle_id
        if oracle_id not in cards_map:
            cards_map[oracle_id] = (oracle_id, name, mana_cost, oracle_text, type_line)

        # Datos de la impresión actual
        set_code = card.get("set", "")
        set_name = card.get("set_name", "")
        collector_number = card.get("collector_number", "")
        rarity = card.get("rarity", "")
        
        image_uri = ""
        if "image_uris" in card:
            image_uri = card["image_uris"].get("normal", "")
        elif "card_faces" in card and "image_uris" in card["card_faces"][0]:
            image_uri = card["card_faces"][0]["image_uris"].get("normal", "")

        foil = card.get("foil", False)
        nonfoil = card.get("nonfoil", True)

        printing_unique_id = scryfall_id

        if printing_unique_id not in seen_printings:
            printings_batch.append((
                oracle_id, # Referencia temporal a la carta lógica
                printing_unique_id,
                set_code,
                set_name,
                collector_number,
                rarity,
                image_uri,
                foil,
                nonfoil
            ))
            seen_printings.add(printing_unique_id)

    cards_batch = list(cards_map.values())

    try:
        print(f"💾 Guardando {len(cards_batch)} cartas base únicas...")
        execute_values(cursor, """
            INSERT INTO cards (scryfall_id, name, mana_cost, oracle_text, type_line)
            VALUES %s
            ON CONFLICT (scryfall_id) DO UPDATE SET
                name = EXCLUDED.name,
                mana_cost = EXCLUDED.mana_cost,
                oracle_text = EXCLUDED.oracle_text,
                type_line = EXCLUDED.type_line,
                updated_at = CURRENT_TIMESTAMP
        """, cards_batch)

        print(f"💾 Guardando el lote completo de impresiones ({len(printings_batch)} registros)...")
        execute_values(cursor, """
            INSERT INTO printings (card_id, scryfall_printing_id, set_code, set_name, collector_number, rarity, image_uri, foil, nonfoil)
            SELECT c.id, v.scryfall_printing_id, v.set_code, v.set_name, v.collector_number, v.rarity, v.image_uri, v.foil, v.nonfoil
            FROM (VALUES %s) AS v(card_oracle_id, scryfall_printing_id, set_code, set_name, collector_number, rarity, image_uri, foil, nonfoil)
            JOIN cards c ON c.scryfall_id = v.card_oracle_id::uuid
            ON CONFLICT (scryfall_printing_id) DO NOTHING
        """, printings_batch)

        conn.commit()
        print("✅ ¡Importación masiva estructurada correctamente con éxito!")

    except Exception as e:
        conn.rollback()
        print(f"❌ Error durante la inserción en la base de datos: {e}")
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    import_from_local_json()