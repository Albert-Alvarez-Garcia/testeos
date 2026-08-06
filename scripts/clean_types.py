import json
from collections import defaultdict
import subprocess
from tqdm import tqdm

# Supertipos comunes en Magic que ensucian la categoría principal
SUPER_TYPES = {"Legendary", "Basic", "Snow", "World", "Ongoing", "Host"}

def clean_and_parse_line(line):
    faces = line.split("//")
    parsed_faces = []
    
    for face in faces:
        face = face.strip()
        if not face:
            continue
            
        parts = face.split("—") if "—" in face else face.split("-")
        type_part = parts[0].strip()
        subtype_part = parts[1].strip() if len(parts) > 1 else ""
        
        words = type_part.split()
        core_types = []
        supertypes_found = []
        
        for w in words:
            w_cap = w.capitalize()
            if w_cap in SUPER_TYPES or w in SUPER_TYPES:
                supertypes_found.append(w_cap)
            else:
                core_types.append(w_cap)
                
        main_type = " ".join(core_types) if core_types else "Card"
        subtypes = [s.strip().title() for s in subtype_part.split() if s.strip()]
        
        parsed_faces.append({
            "supertypes": supertypes_found,
            "main_type": main_type,
            "subtypes": subtypes
        })
        
    return parsed_faces

def fetch_types_from_db():
    print("🔌 Extrayendo tipos directamente desde el contenedor de Docker...")
    try:
        # Usamos docker exec para consultar la base de datos por dentro, sin líos de puertos ni contraseñas externas
        cmd = [
            "docker", "exec", "-i", "card_binder_db",
            "psql", "-U", "binder_user", "-d", "card_binder_db",
            "-t", "-c", "SELECT DISTINCT type_line FROM cards WHERE type_line IS NOT NULL;"
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        lines = [line.strip() for line in result.stdout.splitlines() if line.strip()]
        return lines
    except subprocess.CalledProcessError as e:
        print(f"❌ Error al ejecutar el comando en Docker: {e.stderr}")
        return []

def main():
    lines = fetch_types_from_db()
    if not lines:
        print("⚠️ No se han encontrado líneas de tipos en la base de datos.")
        return

    macro_categories = defaultdict(set)
    taxonomy = defaultdict(lambda: defaultdict(set))

    print("⚙️ Procesando tipos y subtipos...")
    for line in tqdm(lines, desc="Analizando cartas", unit="líneas"):
        faces = clean_and_parse_line(line)
        for face in faces:
            m_type = face["main_type"]
            if not m_type:
                continue
                
            macro_categories[m_type].update(face["subtypes"])
            for sub in face["subtypes"]:
                taxonomy[m_type][sub].add(line)

    print("\n=== MACRO-CATEGORÍAS LIMPIAS Y SUS SUBTIPOS ===\n")
    for main_t, subs in sorted(macro_categories.items()):
        print(f"📁 {main_t} ({len(subs)} subtipos únicos)")
        if subs:
            sample = sorted(list(subs))[:8]
            print(f"   Subtipos: {', '.join(sample)}{' ...' if len(subs) > 8 else ''}")
        print()

    output_data = {
        main: sorted(list(subs)) for main, subs in macro_categories.items()
    }

    with open('clean_card_types.json', 'w', encoding='utf-8') as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)

    print("💾 ¡Estructura limpia guardada en 'clean_card_types.json'!")

if __name__ == "__main__":
    main()