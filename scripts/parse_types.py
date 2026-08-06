from collections import defaultdict

categories = defaultdict(set)

try:
    with open('card_types.txt', 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            
            # Separar tipo principal y subtipos por el guion largo '—' (o normal '-')
            parts = line.split('—') if '—' in line else line.split('-')
            main_type = parts[0].strip()
            
            if len(parts) > 1:
                subtype = parts[1].strip()
                categories[main_type].add(subtype)
            else:
                # Si no tiene subtipo, lo registramos como vacío o sin subtipo específico
                categories[main_type]

    # Mostrar resumen de categorías y algunos subtipos de ejemplo
    print(f"\n--- RESUMEN DE TIPOS DE CARTAS ---\n")
    for main, subs in sorted(categories.items()):
        print(f"🔹 Categoría Principal: '{main}' ({len(subs)} subtipos únicos)")
        if subs:
            sample = list(subs)[:5]
            print(f"   Subtipos de ejemplo: {', '.join(sample)}{' ...' if len(subs) > 5 else ''}")
        print()

except FileNotFoundError:
    print("❌ No se encuentra el fichero 'card_types.txt'. Asegúrate de estar en el mismo directorio.")
