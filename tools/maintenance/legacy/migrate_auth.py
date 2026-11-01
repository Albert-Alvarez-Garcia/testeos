#!/usr/bin/env python3
"""
migrate_auth.py · Pasa la identificación de X-Username a una cookie de sesión firmada.

Uso (desde ~/testeo, después de copiar security.py a backend/ y chat.py a backend/routers/):
    python3 migrate_auth.py

Qué hace (copia .bak de cada fichero que modifica; se puede repetir sin problema):
  backend/routers/*.py   Los parámetros `x_username: str = Header(None)` pasan a `Depends(session_username)`:
                         el nombre llega ya verificado por cookie (o por la cabecera mientras dure la transición).
  auth.py                login / registro / login con 42 guardan la cookie, y nuevo POST /api/auth/logout.
  game.py                los WebSockets del lobby y del juego usan el usuario de la cookie, no el de la URL.
  frontend/              al cerrar sesión se avisa al servidor para borrar la cookie; index.html vuelve al login si
                         el servidor ya no reconoce la sesión.
  .env                   añade JWT_SECRET (si falta) y ALLOW_LEGACY_HEADER=1.
"""
import re
import secrets
import shutil
import sys
from pathlib import Path

ROOT = Path(".")
ROUTERS = ROOT / "backend" / "routers"
problems = []


def save(path: Path, old: str, new: str, label=""):
    if new == old:
        return False
    shutil.copy2(path, str(path) + ".bak")
    path.write_text(new, encoding="utf-8")
    print(f"✔ {path}" + (f"  ({label})" if label else ""))
    return True


IMPORT_LINES = ("from fastapi import Depends", "from backend.security import session_username")


def ensure_imports(text: str):
    """Deja los dos imports justo después del último import de nivel superior del fichero (antes de cualquier
    código que los use). Quita antes los que una ejecución anterior hubiera puesto en otro sitio."""
    import ast
    lines = [l for l in text.split("\n") if l.strip() not in IMPORT_LINES]
    clean = "\n".join(lines)
    try:
        tree = ast.parse(clean)
    except SyntaxError:
        return None
    last = 0
    for node in tree.body:
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            last = node.end_lineno
    out = clean.split("\n")
    out[last:last] = list(IMPORT_LINES)
    return "\n".join(out)


# ---- 1. Dependencias x_username en los routers --------------------------------------------------------------
HEADER_PARAM = "x_username: str = Header(None)"
for p in sorted(ROUTERS.glob("*.py")):
    if p.name in {"auth.py", "chat.py"}:
        continue
    old = p.read_text(encoding="utf-8")
    if HEADER_PARAM not in old and "Depends(session_username)" not in old:
        continue
    new = old.replace(HEADER_PARAM, "x_username: str = Depends(session_username)")
    new = ensure_imports(new)
    if new is None:
        problems.append(f"{p}: no he podido analizar el fichero; añade a mano al principio: "
                        "from fastapi import Depends / from backend.security import session_username")
        continue
    n = old.count(HEADER_PARAM)
    save(p, old, new, f"{n} parámetro(s)" if n else "imports reordenados")

# ---- 2. auth.py: cookie al entrar, logout ---------------------------------------------------------------------
auth = ROUTERS / "auth.py"
if auth.exists():
    old = auth.read_text(encoding="utf-8")
    if "set_session_cookie" in old:
        print("= auth.py ya migrado")
    else:
        t = old
        try:
            def sub1(pattern, repl, text, what):
                new, n = re.subn(pattern, repl, text, count=1, flags=re.S | re.M)
                if n != 1:
                    raise ValueError(what)
                return new

            t = sub1(r"^router\s*=", "from fastapi import Response\nfrom backend.security import set_session_cookie, clear_session_cookie\n\nrouter =", t, "router = APIRouter")
            t = sub1(r"async def login_user\(credentials: UserLogin\):",
                     "async def login_user(credentials: UserLogin, request: Request, response: Response):", t, "login_user")
            t = sub1(r'(\n)(    return \{\n        "message": "¡Inicio de sesión exitoso!")',
                     r'\1    set_session_cookie(response, request, user["username"])\n\2', t, "return del login")
            t = sub1(r"async def register_user\(user: UserRegister\):",
                     "async def register_user(user: UserRegister, request: Request, response: Response):", t, "register_user")
            t = sub1(r'(\n)(    return \{\n        "message": "¡Cuenta civil creada con éxito!")',
                     r'\1    set_session_cookie(response, request, (result.get("user") or {}).get("username") or user.username)\n\2', t, "return del registro")
            t = sub1(r"(    response = HTMLResponse\(content=html, status_code=200\)\n)",
                     r'\1    set_session_cookie(response, request, final_user["username"])\n', t, "respuesta del callback de 42")
            t = t.rstrip("\n") + '''


@router.post("/logout")
async def logout_user(response: Response):
    """Borra la cookie de sesión."""
    clear_session_cookie(response)
    return {"message": "Sesión cerrada."}
'''
            save(auth, old, t, "login, registro, 42 y logout")
        except ValueError as e:
            problems.append(f"auth.py: no encuentro «{e}». No se ha modificado; pásame el fichero.")
else:
    problems.append("No encuentro backend/routers/auth.py")

# ---- 3. game.py: WebSockets ----------------------------------------------------------------------------------
game = ROUTERS / "game.py"
if game.exists():
    old = game.read_text(encoding="utf-8")
    if "ws_username" in old:
        print("= game.py ya migrado")
    else:
        t = old
        ok = True
        for default, fn in (("Conjurador", "connect_lobby"), ("Jugador", "connect_game")):
            pat = re.compile(r'    username = websocket\.query_params\.get\("username", "%s"\)\n' % default)
            if not pat.search(t):
                ok = False
                problems.append(f'game.py: no encuentro el username de {fn}; no se ha modificado.')
                break
            t = pat.sub(
                '    username = ws_username(websocket, websocket.query_params.get("username", "%s"))\n'
                '    if not username:\n'
                '        await websocket.close(code=4401)\n'
                '        return\n' % default, t, count=1)
        if ok:
            t = t.replace('"username": data.get("username", username),', '"username": username,')
            t = t.replace("from backend.database import get_db_connection\n",
                          "from backend.database import get_db_connection\nfrom backend.security import ws_username\n", 1)
            save(game, old, t, "lobby y juego")
else:
    print("· game.py no encontrado (se omite)")

# ---- 3b. pong_game.py: WebSockets del Pong ---------------------------------------------------------------
pong = ROUTERS / "pong_game.py"
if pong.exists():
    old = pong.read_text(encoding="utf-8")
    if "ws_username" in old:
        print("= pong_game.py ya migrado")
    else:
        t = old
        ok = True
        for default in ("Conjurador", "Jugador"):
            pat = re.compile(r'    username = clean_username\(websocket\.query_params\.get\("username"\), "%s"\)\n' % default)
            if not pat.search(t):
                ok = False
                problems.append(f'pong_game.py: no encuentro el username de "{default}"; no se ha modificado.')
                break
            t = pat.sub(
                '    username = ws_username(websocket, websocket.query_params.get("username"))\n'
                '    if not username:\n'
                '        await websocket.close(code=4401)\n'
                '        return\n'
                '    username = clean_username(username, "%s")\n' % default, t, count=1)
        if ok:
            t = sub_import = t.replace("from fastapi import APIRouter, WebSocket, WebSocketDisconnect\n",
                          "from fastapi import APIRouter, WebSocket, WebSocketDisconnect\nfrom backend.security import ws_username\n", 1)
            save(pong, old, t, "lobby y partida del Pong")
else:
    print("· pong_game.py no encontrado (se omite)")

# ---- 4. Frontend ----------------------------------------------------------------------------------------------
FRONT_REFACTORED = (ROOT / "frontend" / "js" / "shared" / "user-menu.js").exists()
BEACON = "(navigator.sendBeacon && navigator.sendBeacon('/api/auth/logout'), localStorage.removeItem('cardbinder_user'))"
SKIP = re.compile(r"old|^pre|actual|\.bak", re.I)
for p in ([] if FRONT_REFACTORED else sorted((ROOT / "frontend").glob("*"))):
    if p.suffix not in {".html", ".js"} or SKIP.search(p.name):
        continue
    old = p.read_text(encoding="utf-8")
    new = old.replace("localStorage.removeItem('cardbinder_user')", BEACON) if "sendBeacon('/api/auth/logout')" not in old else old
    if p.name == "index.html" and "cb-401" not in new:
        pat = re.compile(r"(fetch\(API_BASE \+ '/api/profile/me'.*?\n\s*if \(!res\.ok\) )return;", re.S)
        if pat.search(new):
            new = pat.sub(r"\1{ if (res.status === 401) { /* cb-401 */ " + BEACON + "; window.location.href = 'login.html'; } return; }", new, count=1)
        else:
            problems.append("index.html: no encuentro la comprobación de /api/profile/me para el aviso de sesión caducada (opcional).")
    save(p, old, new, "cierre de sesión")

# ---- 5. .env --------------------------------------------------------------------------------------------------
env = ROOT / ".env"
text = env.read_text(encoding="utf-8") if env.exists() else ""
add = ""
if not re.search(r"^JWT_SECRET=", text, re.M):
    add += f"JWT_SECRET={secrets.token_hex(32)}\n"
if not re.search(r"^ALLOW_LEGACY_HEADER=", text, re.M):
    add += "ALLOW_LEGACY_HEADER=1\n"
if add:
    if env.exists():
        shutil.copy2(env, str(env) + ".bak")
    env.write_text(text + ("" if text.endswith("\n") or not text else "\n") + add, encoding="utf-8")
    print("✔ .env actualizado: " + ", ".join(l.split("=")[0] for l in add.strip().splitlines()))

print()
if problems:
    print("⚠ Revisar:")
    for q in problems:
        print("  -", q)
print("""Siguiente:
  1) docker compose up -d --build       (recoge el .env y el código nuevo)
  2) Cierra sesión y vuelve a entrar (login normal y con 42) para recibir la cookie. Prueba contenedores, perfil, chat y juegos.
  3) Cuando todo vaya bien: pon ALLOW_LEGACY_HEADER=0 en el .env y 'docker compose up -d'. Desde ese momento
     la cabecera X-Username ya no sirve: solo vale la cookie.""")
sys.exit(1 if problems else 0)
