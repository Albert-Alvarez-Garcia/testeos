-- Habilitar la extensión para UUIDs si no está activa
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Tabla maestra de contenedores (Debe ir primero para que otras tablas puedan referenciarla)
CREATE TABLE IF NOT EXISTS containers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL, -- 'binder', 'box', 'deck'
    max_capacity INTEGER,      -- Límite total o principal
    sideboard_capacity INTEGER, -- Específico para mazos (banquillo/reserva)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tabla principal de cartas (Datos genéricos de la carta)
CREATE TABLE IF NOT EXISTS cards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scryfall_id UUID UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    mana_cost VARCHAR(50),
    oracle_text TEXT,
    type_line VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Tabla de impresiones / sets / versiones (Cada arte, set o acabado foil)
CREATE TABLE IF NOT EXISTS printings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    scryfall_printing_id TEXT UNIQUE NOT NULL,
    set_code VARCHAR(10) NOT NULL,
    set_name VARCHAR(255) NOT NULL,
    collector_number VARCHAR(50) NOT NULL,
    rarity VARCHAR(50),
    image_uri TEXT,
    foil BOOLEAN DEFAULT FALSE,
    nonfoil BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Tabla de huecos o celdas individuales dentro del contenedor (Ideal para binders)
CREATE TABLE IF NOT EXISTS container_slots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    container_id UUID NOT NULL REFERENCES containers(id) ON DELETE CASCADE,
    page_number INTEGER,       -- Número de página (para carpetas)
    slot_index INTEGER,        -- Posición en la página (ej. 1 al 9 en una hoja de 3x3)
    section VARCHAR(50) DEFAULT 'main', -- 'main' o 'sideboard'
    is_occupied BOOLEAN DEFAULT FALSE
);

-- 5. Tabla de copias físicas vinculadas al contenedor y al hueco exacto
CREATE TABLE IF NOT EXISTS card_copies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    printing_id UUID NOT NULL REFERENCES printings(id) ON DELETE CASCADE,
    container_id UUID NOT NULL REFERENCES containers(id) ON DELETE CASCADE, -- Clave foránea directa
    slot_id UUID REFERENCES container_slots(id) ON DELETE SET NULL,         -- Enlace opcional al hueco/slot
    condition VARCHAR(50) DEFAULT 'Near Mint',
    language VARCHAR(10) DEFAULT 'en',
    is_foil BOOLEAN DEFAULT FALSE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. Índices recomendados para acelerar las búsquedas y relaciones
CREATE INDEX IF NOT EXISTS idx_cards_name_lower ON cards (LOWER(name));
CREATE INDEX IF NOT EXISTS idx_printings_card_id ON printings (card_id);
CREATE INDEX IF NOT EXISTS idx_card_copies_container ON card_copies (container_id);
CREATE INDEX IF NOT EXISTS idx_container_slots_container ON container_slots (container_id);