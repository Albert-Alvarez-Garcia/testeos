import json
from collections import defaultdict

# Supertipos comunes en Magic que ensucian la categoría principal
SUPER_TYPES = {"Legendary", "Basic", "Snow", "World", "Ongoing", "Host"}

def clean_and_parse_line(line):
    # Si tiene caras dobles (//), procesamos cada cara por separado
    faces = line.split("//")
    parsed_faces = []
    
    for face in faces:
        face = face.strip()
        if not face:
            continue
            
        # Separar tipo principal y subtipo por el guion largo '—' o '-'
        parts = face.split("—") if "—" in face else face.split("-")
        
        type_part = parts[0].strip()
        subtype_part = parts[1].strip() if len(parts) > 1 else ""
        
        # Limpiar supertipos y normalizar espacios/mayúsculas
        words = type_part.split()
        core_types = []
        supertypes_found = []
        
        for w in words:
            # Capitalizar correctamente por si hay "instant" sueltos
            w_cap = w.capitalize()
            if w_cap in SUPER_TYPES or w in SUPER_TYPES:
                supertypes_found.append(w_cap)
            else:
                core_types.append(w_cap)
                
        main_type = " ".join(core_types) if core_types else "Card"
        
        # Procesar subtipos (pueden ser varios separados por espacios)
        subtypes = [s.strip().title() for s in subtype_part.split() if s.strip()]
        
        parsed_faces.append({
            "supertypes": supertypes_found,
            "main_type": main_type,
            "subtypes": subtypes
        })
        
    return parsed_faces

# Estructuras para acumular resultados limpios
macro_categories = defaultdict(set)
taxonomy = defaultdict(lambda: defaultdict(set))

with open('card_types.txt', 'r', encoding='utf-8') as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
            
        faces = clean_and_parse_line(line)
        for face in faces:
            m_type = face["main_type"]
            if not m_type:
                continue
                
            macro_categories[m_type].update(face["subtypes"])
            for sub in face["subtypes"]:
                taxonomy[m_type][sub].add(line)

# Mostrar un resumen limpio por consola
print("\n=== MACRO-CATEGORÍAS LIMPIAS Y SUS SUBTIPOS ===\n")
for main_t, subs in sorted(macro_categories.items()):
    print(f"📁 {main_t} ({len(subs)} subtipos únicos)")
    if subs:
        sample = sorted(list(subs))[:8]
        print(f"   Subtipos: {', '.join(sample)}{' ...' if len(subs) > 8 else ''}")
    print()

# Opcional: Guardarlo en un JSON limpio para que tu backend/frontend lo consuma fácilmente
output_data = {
    main: sorted(list(subs)) for main, subs in macro_categories.items()
}

with open('clean_card_types.json', 'w', encoding='utf-8') as f:
    json.dump(output_data, f, ensure_ascii=False, indent=2)

print("💾 ¡Estructura limpia guardada en 'clean_card_types.json'!")
