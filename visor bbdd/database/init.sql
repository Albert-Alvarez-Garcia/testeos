-- Habilitar la extensión para UUIDs si no está activa
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tabla principal de cartas (Datos genéricos de la carta)
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

-- Tabla de impresiones / sets / versiones (Cada arte, set o acabado foil)
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

-- Tabla de copias físicas que poseen los usuarios en sus contenedores/binders
CREATE TABLE IF NOT EXISTS card_copies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    printing_id UUID NOT NULL REFERENCES printings(id) ON DELETE CASCADE,
    container_id UUID NOT NULL, -- Referencia al contenedor o binder del usuario
    condition VARCHAR(50) DEFAULT 'Near Mint',
    language VARCHAR(10) DEFAULT 'en',
    is_foil BOOLEAN DEFAULT FALSE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Índices recomendados para acelerar las búsquedas y proteger la caché de Scryfall
CREATE INDEX IF NOT EXISTS idx_cards_name_lower ON cards (LOWER(name));
CREATE INDEX IF NOT EXISTS idx_printings_card_id ON printings (card_id);
CREATE INDEX IF NOT EXISTS idx_card_copies_container ON card_copies (container_id);