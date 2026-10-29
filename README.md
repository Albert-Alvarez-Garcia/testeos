# Card Binder Pro

Aplicación web para **gestionar una colección de cartas de Magic: The Gathering**: buscar cartas, guardarlas en contenedores (archivadores, mazos y cajas), ver informes de la colección, abrir sobres virtuales y jugar online contra otros usuarios, con perfiles, logros y chat.

Este documento explica el proyecto de forma global y técnica para que cualquier miembro del equipo pueda presentarlo y defenderlo.

---

## 1. Qué hace (visión de producto)

| Zona | Qué ofrece |
|---|---|
| **Acceso** | Registro e inicio de sesión con usuario y contraseña, o con la cuenta de 42 (OAuth). |
| **Portal** (`index.html`) | Pantalla de inicio con acceso a todas las secciones. Los usuarios de 42 ven un tema visual azul propio. |
| **Colección** | Buscador y filtros (nombre, tipo, rareza, set, foil), detalle de carta, exportar/importar la colección en JSON, informe e impresión. |
| **Contenedores** | Crear binders (2x2, 3x3, 4x3), mazos (con sideboard) y cajas; añadir cartas desde el buscador; verlas en una vista de archivador paginada o de mazo; borrar copias. |
| **Visor 2.5D** | Carta con efecto de perspectiva según el ratón y modo lupa. |
| **Gacha** | Apertura de sobres virtuales con vídeo y carta aleatoria con GIF. |
| **Juegos** | Pong isométrico online 1 contra 1 (salas y lobby) y local por teclado. |
| **Social** | Perfil con avatar y medallas, logros, amigos, usuarios bloqueados y chat con GIFs. |

---

## 2. Arquitectura

```
Navegador ──HTTPS 8443 / HTTP 8080──▶  Nginx (card_binder_web)
                                         │  sirve HTML, CSS, JS y assets estáticos
                                         │  proxy inverso: /api/  ──▶  backend:8000
                                         │                 /ws/   ──▶  WebSocket del backend
                                         ▼
                                   FastAPI (card_binder_api)
                                         │  routers: cards, containers, auth, chat,
                                         │  game, pong_game, achievements, reports, access
                                         ▼
                                  PostgreSQL 15 (card_binder_db)
                                         volumen persistente: pgdata
```

- **Tres contenedores Docker** orquestados con `docker-compose.yml`: `card_binder_web`, `card_binder_api`, `card_binder_db`.
- **Mismo origen**: el navegador solo habla con Nginx; Nginx reenvía `/api/` al backend. Así no hay problemas de CORS y la cookie de sesión viaja sola.
- **HTTPS** en localhost con certificado autofirmado (carpeta `certs/`); el acceso por IP de red local va por HTTP en el 8080.
- **Persistencia**: la base de datos y los avatares viven en volúmenes Docker (`pgdata`, `avatars`), por eso `make restart` no borra datos. `make clean` sí elimina volúmenes (ver sección 9).

## 3. Tecnologías

- **Backend**: Python, FastAPI (REST + WebSockets), PostgreSQL.
- **Frontend**: HTML, CSS y JavaScript sin framework, con Tailwind CSS v4 (CDN) para las utilidades. El Pong tiene además un cliente en React (`pong-client/`).
- **Infra**: Docker, Docker Compose, Nginx, Makefile.
- **Datos de cartas**: bulk data de Scryfall (ver sección 5).

---

## 4. Modelo de datos (PostgreSQL, `database/init.sql`)

| Tabla | Para qué sirve |
|---|---|
| `users` | Cuentas (usuario, contraseña con hash, tipo de autenticación local/42, perfil). |
| `cards` | Una fila por carta "conceptual" (nombre, tipo, coste de maná...). |
| `printings` | Cada impresión concreta de una carta (set, número, imagen). Una carta tiene muchas impresiones. |
| `containers` | Binders, mazos y cajas de un usuario (tipo, capacidad, páginas, sideboard). |
| `container_slots` | Los huecos de un contenedor (página, posición, sección main/sideboard). |
| `card_copies` | Las copias físicas que posee el usuario: impresión, estado (NM/LP/MP), foil, idioma, y en qué hueco están. |
| `chat_messages` | Mensajes del chat. |
| `friendships`, `blocked_users` | Relaciones sociales. |

Idea clave: **carta ≠ impresión ≠ copia**. La carta es el concepto, la impresión es el arte concreto, y la copia es lo que el usuario tiene en su mano y dónde la guarda.

## 5. Carga de datos de cartas

Scripts en `scripts/` (se ejecutan una vez para poblar la base de datos; `make download` y `make import` los lanzan):

1. `download_bulk.py` descarga el fichero masivo de Scryfall.
2. `parse_types.py` y `clean_types.py` normalizan los tipos de carta en una taxonomía limpia (`clean_card_types.json`) que alimenta los filtros de tipo y subtipo.
3. `import_bulk.py` inserta cartas e impresiones en PostgreSQL.

---

## 6. Autenticación y seguridad

- **Sesión**: al iniciar sesión el backend emite un **JWT firmado (HS256)** en una cookie **HttpOnly** llamada `cb_session`. Al ser HttpOnly, el JavaScript de la página no puede leerla (protege frente a robo por XSS).
- **Cierre de sesión**: `POST /api/auth/logout` borra la cookie.
- **42 OAuth**: el `redirect_uri` se calcula por petición.
- **Contraseñas**: se guardan con hash, nunca en claro.
- **Estado de transición**: el frontend aún envía la cabecera `X-Username` además de la cookie, y el backend la acepta mientras `ALLOW_LEGACY_HEADER` esté activo. Es un resto del sistema anterior y se va a eliminar (ver sección 10).
- **Contenido de usuario**: todo texto introducido por usuarios (nombres de sala, de contenedor, mensajes) se pinta con `textContent` o escapado, nunca como HTML, para evitar XSS. El chat solo acepta GIFs de `giphy.com`.
- **Secretos** (`.env`): no se suben a git. Lo gestionan las variables de entorno del `docker-compose.yml`.

---

## 7. Estructura del repositorio

```
.
├── backend/            FastAPI: main.py y un router por área (auth, cards, containers, chat, game...)
├── database/           init.sql (esquema inicial)
├── frontend/
│   ├── *.html          una página por pantalla (URLs en la raíz)
│   ├── css/            portal.css (paleta y componentes comunes) + un CSS por página
│   ├── js/shared/      código común: theme, user-menu, section-nav, chat, auth
│   ├── js/pages/       un JS por página
│   └── public/assets/  imágenes, vídeo y fondos
├── docker/             frontend.Dockerfile y nginx.conf (fuera de frontend/ para no servirlos)
├── certs/              certificado autofirmado para HTTPS local
├── scripts/            carga de datos de Scryfall
├── pong-client/        cliente React del Pong
├── docker-compose.yml
└── Makefile
```

## 8. Convenciones del frontend

- **Ningún HTML lleva CSS ni JS en línea**: cada página carga su `css/<pagina>.css` y su `js/pages/<pagina>.js`.
- **Una sola paleta**: `css/portal.css` define los colores como variables (`--c-gold`, `--c-panel`, `--c-amber-400`...) y variables semánticas (`--bg-app`, `--text-main`, `--accent`, `--danger`...). Los demás CSS solo usan variables, no colores sueltos.
- **Tema de 42**: `theme.js` añade la clase `theme-42` y carga `theme-42.css`, que solo redefine las variables de color. Cambiar el tema es cambiar la paleta, no reescribir estilos.
- **Seguridad en la capa visual**: ver sección 6.
- **Sesión en contenedores**: `js/shared/auth.js` centraliza la lectura de sesión y redirige al login si no hay sesión o el servidor responde 401.

---

## 9. Cómo arrancarlo

Requisitos: Docker, Docker Compose, `make` y Python 3 (solo para descargar los datos).

### Primera puesta en marcha

```bash
cp .env.example .env     # rellenar contraseñas y claves (no subir a git)
make up                  # construye y levanta base de datos, API y Nginx
make download            # descarga el bulk data de Scryfall a data/
make import              # importa cartas e impresiones a PostgreSQL
```

- Aplicación: `http://localhost:8080` (redirige a `https://localhost:8443` en localhost).
- `make` a secas muestra el logo y la ayuda.

### Comandos del Makefile

| Comando | Qué hace | Ojo |
|---|---|---|
| `make up` | `docker compose up --build -d`: construye y levanta los tres servicios. | Reconstruye imágenes: úsalo tras cambiar HTML, CSS, JS o código del backend. |
| `make down` | Detiene y apaga los contenedores (`--remove-orphans`). | Conserva los datos. |
| `make restart` | Apaga, elimina los contenedores `card_binder_*` y vuelve a levantar con build. | **Conserva** los volúmenes (`pgdata`, `avatars`): no se pierden usuarios ni colección. |
| `make logs` | Logs en tiempo real de todos los servicios. | |
| `make download` | Ejecuta `scripts/download_bulk.py` en tu máquina y deja el JSON en `data/`. | Se hace una vez, o para actualizar cartas. |
| `make import` | Ejecuta `scripts/import_bulk.py` **dentro del contenedor del backend** y carga los datos en PostgreSQL. | La base de datos debe estar levantada. |
| `make clean` | `docker compose down -v --rmi local`: elimina contenedores, **volúmenes** e imágenes del proyecto. | **Borra todos los datos** (usuarios, colección, avatares). Después hay que repetir `make up`, `make download` (si no existe `data/`) y `make import`. |
| `make prune` | `docker system prune -f`: purga contenedores parados, redes y caché sin usar. | Afecta a **todo Docker** en la máquina, no solo a este proyecto. No borra volúmenes. |

Los ficheros del frontend se copian a la imagen de Nginx, no se montan: cualquier cambio de interfaz necesita `make up` o `make restart` para verse.

---

## 10. Puntos débiles conocidos y hoja de ruta

Conviene conocerlos antes de la defensa: es mejor decirlos nosotros que que nos los descubran.

1. **Quitar la cabecera `X-Username`** del frontend y apagar `ALLOW_LEGACY_HEADER`, para que la identidad dependa solo de la cookie firmada.
2. **Identidad en los WebSockets del Pong**: hoy el usuario lo aporta el cliente; debe sacarse de la cookie al conectar.
3. **Claves expuestas**: regenerar el secreto de la app de 42 y la clave de Giphy (está en el JS de `gacha`); mejor, que Giphy se consulte desde el backend.
4. **Cookie sobre HTTP**: por la IP de red local no se puede marcar `Secure`; valorar HTTPS también ahí.
6. **Gestión de usuarios por token**: caducidad y renovación, cierre de sesión global y protección CSRF.

---

## 11. Preguntas que nos pueden hacer

**¿Por qué FastAPI y PostgreSQL?** FastAPI da una API rápida, tipada y con soporte nativo de WebSockets, necesario para el chat y el Pong. PostgreSQL es relacional y encaja con el modelo (usuarios, contenedores, copias, relaciones entre ellos).

**¿Por qué sin framework en el frontend?** Para mantener el proyecto ligero y entender qué hace cada pieza; el estado de cada página es simple. El Pong sí usa React por su lógica de juego en tiempo real.

**¿Cómo se protege la sesión?** Cookie HttpOnly con un JWT firmado; el JavaScript no puede leerla. Mientras dura la transición se acepta una cabecera heredada, y está en la hoja de ruta eliminarla.

**¿Qué pasa si se reinicia todo?** Los datos persisten en volúmenes Docker con `make restart`; solo `make clean` los borra.

**¿Cómo se añade una pantalla nueva?** Un HTML en `frontend/`, un CSS que use las variables de `portal.css`, un JS en `js/pages/`, y, si necesita datos, un router en `backend/`.

**¿Por qué carta, impresión y copia son tablas distintas?** Una carta tiene muchas ilustraciones y un usuario puede tener varias copias de la misma, en estados y contenedores distintos.

---

## 12. Reparto sugerido para la defensa

| Tema | Qué explicar |
|---|---|
| Producto y demo | Sección 1: recorrido por colección, contenedores, gacha y Pong. |
| Arquitectura e infraestructura | Secciones 2 y 3: Docker, Nginx como proxy, volúmenes. |
| Datos | Secciones 4 y 5: modelo y carga de Scryfall. |
| Seguridad | Sección 6 y puntos débiles de la sección 10. |
| Frontend | Sección 8: paleta única, temas, ausencia de CSS/JS en línea. |
