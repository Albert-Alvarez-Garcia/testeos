# Miniguía: recorrido por el código

**Objetivo:** enseñar cómo se conectan interfaz, API, base de datos y tiempo real. No recorrer todos los archivos.

## Antes de empezar

- Abre el proyecto en el editor y deja preparadas las rutas de abajo.
- Comprueba que la aplicación está levantada y que puedes iniciar sesión.
- Usa el README como índice de módulos y evidencia.

## Recorrido de 7–10 minutos

### 1. Arquitectura — 1 min

Muestra `docker-compose.yml` y `backend/main.py`. Resume el flujo: navegador → Nginx → FastAPI → PostgreSQL. Nginx sirve los archivos web y reenvía las peticiones API y WebSocket.

### 2. Colección — 3 min

Sigue una acción, como añadir cartas a un contenedor:

- Interfaz: `frontend/js/pages/visor-admin-25d.js`
- API y validación: `backend/routers/containers.py`
- Relaciones de datos: `database/init.sql`

Explica la diferencia entre carta, impresión y copia física. Enseña cómo el backend evita superar la capacidad y cómo la interfaz comunica el conflicto.

### 3. Inicio de sesión — 2 min

Abre `backend/routers/auth.py`, `backend/security.py` y `docker/nginx.conf`. Describe el inicio con 42, la validación de sesión y por qué Nginx conserva el host y el puerto al reenviar la petición.

### 4. Pong en tiempo real — 2–3 min

Abre `backend/routers/pong_game.py` y `pong-client/src/pong_App.jsx`. Explica dónde se conserva el estado de la partida, cómo se reconecta un jugador y cómo se distinguen espectadores y jugadores.

### 5. Cierre — 1 min

`make test` comprueba HTTPS, API y PostgreSQL. Es una prueba de humo; las funciones se demuestran con los flujos de la aplicación.

## Si queda poco tiempo

Enseña solo **Colección** y **Pong**. Para cada uno responde: qué problema resuelve, dónde está la lógica y cómo comprobarías el resultado.

Si te piden un cambio, confirma primero el comportamiento esperado y haz una modificación pequeña y observable. Explica qué archivo cambiarías y cómo verificarías el efecto.
