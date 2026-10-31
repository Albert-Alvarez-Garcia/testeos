-- Habilitar la extensión para UUIDs si no está activa
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 0. Tabla de usuarios (Soporte multiusuario, cuentas locales/42, sellos y avatares)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),               -- Nulo si entra exclusivamente por OAuth de 42
    intra_id VARCHAR(50) UNIQUE,              -- ID único oficial de la Intra de 42 (si aplica)
    auth_type VARCHAR(20) DEFAULT 'local',    -- 'local' o '42'
    badge_type VARCHAR(30) DEFAULT 'civil_homebrewer', -- 'official_42', 'civil_homebrewer', etc.
    avatar_path VARCHAR(255) DEFAULT 'avatar1.jpg', -- Avatar por defecto (predeterminado o subido)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 1. Tabla maestra de contenedores (Actualizada con propiedad de usuario)
CREATE TABLE IF NOT EXISTS containers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE, -- Propietario del contenedor
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL, -- 'binder', 'box', 'deck'
    max_capacity INTEGER,      -- Límite total o principal
    slots_per_page INTEGER DEFAULT 9, -- Estructura por página para archivadores (ej. 9, 4, 12)
    total_pages INTEGER,       -- Número total de páginas calculado
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
CREATE INDEX IF NOT EXISTS idx_containers_user_id ON containers (user_id);

-- 7. Tabla para el historial de la sala de chat global
CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(100) NOT NULL,
    user_login VARCHAR(100) NOT NULL,
    badge_type VARCHAR(30) DEFAULT 'civil_homebrewer',
    message TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages (created_at DESC);

-- 8. Tabla de Amistades (Solicitudes: 'pending', 'accepted')
CREATE TABLE IF NOT EXISTS friendships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    friend_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_friendship UNIQUE (user_id, friend_id),
    CONSTRAINT check_different_users CHECK (user_id <> friend_id)
);

-- 9. Tabla de Usuarios Bloqueados (Unidireccional)
CREATE TABLE IF NOT EXISTS blocked_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,      -- Usuario que bloquea
    blocked_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- Usuario bloqueado
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_block UNIQUE (user_id, blocked_id),
    CONSTRAINT check_different_block CHECK (user_id <> blocked_id)
);

-- Hitos permanentes del sistema de logros; otros progresos se calculan al vuelo.
CREATE TABLE IF NOT EXISTS user_achievements (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    achievement_id VARCHAR(50) NOT NULL,
    unlocked_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, achievement_id)
);

-- Índices para acelerar el sistema social y de bloqueos
CREATE INDEX IF NOT EXISTS idx_friendships_user ON friendships (user_id, status);
CREATE INDEX IF NOT EXISTS idx_friendships_friend ON friendships (friend_id, status);
CREATE INDEX IF NOT EXISTS idx_blocked_users_user ON blocked_users (user_id);
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocked ON blocked_users (blocked_id);
