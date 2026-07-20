import os
import requests

BULK_API_URL = "https://api.scryfall.com/bulk-data"
HEADERS = {
    "User-Agent": "CardBinderPro/1.0",
    "Accept": "application/json;q=0.9,*/*;q=0.8"
}
DATA_DIR = "data"
OUTPUT_FILE = os.path.join(DATA_DIR, "default-cards.json")

def download_bulk_json():
    os.makedirs(DATA_DIR, exist_ok=True)
    print("🔍 Consultando la API de Scryfall para obtener el enlace del Bulk Data...")
    response = requests.get(BULK_API_URL, headers=HEADERS)
    response.raise_for_status()
    data = response.json()

    download_uri = None
    for bulk_object in data.get("data", []):
        if bulk_object.get("type") == "default_cards":
            download_uri = bulk_object.get("download_uri")
            break

    if not download_uri:
        raise Exception("No se encontró el tipo de bulk 'default_cards'.")

    print(f"📥 Descargando archivo masivo a {OUTPUT_FILE} ... (Esto puede tardar unos segundos)")
    with requests.get(download_uri, stream=True, headers=HEADERS) as r:
        r.raise_for_status()
        with open(OUTPUT_FILE, "wb") as f:
            for chunk in r.iter_content(chunk_size=8192):
                f.write(chunk)

    print(f"✅ ¡Archivo descargado y guardado correctamente en {OUTPUT_FILE}!")

if __name__ == "__main__":
    download_bulk_json()