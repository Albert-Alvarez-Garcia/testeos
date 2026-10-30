"""
security.py · Sesión por cookie firmada (HttpOnly) para toda la API.

Cómo funciona
  - Al hacer login / registro / login con 42, el servidor guarda en el navegador la cookie 'cb_session'
    (HttpOnly: el JavaScript de la página NO puede leerla, así que un XSS no puede robarla), firmada con
    JWT_SECRET. Nadie puede fabricarla para otro usuario.
  - El navegador la manda sola en cada fetch y en cada WebSocket (todo va por el mismo origen vía nginx).
  - SameSite=Lax + comprobación del Origin en POST/PUT/DELETE y en WebSockets frenan ataques desde otras webs.

Migración sin romper nada
  - ALLOW_LEGACY_HEADER=1 (por defecto): si no hay cookie válida se sigue aceptando la cabecera X-Username.
  - Cuando todo funcione con cookie, pon ALLOW_LEGACY_HEADER=0 en el .env y la cabecera deja de valer.

Configuración (.env):  JWT_SECRET=<openssl rand -hex 32>   ·   ALLOW_LEGACY_HEADER=1|0   ·   SESSION_TTL_HOURS=168
"""
import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from typing import Optional
from urllib.parse import urlparse

from fastapi import Header, HTTPException, Request, WebSocket

COOKIE_NAME = "cb_session"
SESSION_TTL_SECONDS = int(os.getenv("SESSION_TTL_HOURS", "168")) * 3600
ALLOW_LEGACY = os.getenv("ALLOW_LEGACY_HEADER", "1").strip() == "1"
_ALG = "HS256"
_SAFE_METHODS = ("GET", "HEAD", "OPTIONS")

_SECRET = os.getenv("JWT_SECRET")
if not _SECRET:
    _SECRET = secrets.token_urlsafe(48)
    print("⚠️ JWT_SECRET no está definido: se usa una clave temporal y las sesiones caducarán al reiniciar la API. "
          "Añade JWT_SECRET=<openssl rand -hex 32> a tu .env.")
if ALLOW_LEGACY:
    print("⚠️ ALLOW_LEGACY_HEADER=1: se sigue aceptando la cabecera X-Username (modo de transición).")


# ---------------------------------------------------------------------------
# Token firmado (JWT HS256 con la librería estándar, sin dependencias externas)
# ---------------------------------------------------------------------------
def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _sign(signing_input: str) -> str:
    return _b64(hmac.new(_SECRET.encode(), signing_input.encode(), hashlib.sha256).digest())


def create_token(username: str) -> str:
    now = int(time.time())
    header = _b64(json.dumps({"alg": _ALG, "typ": "JWT"}, separators=(",", ":")).encode())
    body = _b64(json.dumps({"sub": username, "iat": now, "exp": now + SESSION_TTL_SECONDS}, separators=(",", ":")).encode())
    signing_input = f"{header}.{body}"
    return f"{signing_input}.{_sign(signing_input)}"


def decode_token(token: str) -> Optional[str]:
    """Usuario del token, o None si está mal firmado, manipulado o caducado."""
    try:
        header_b64, body_b64, signature = token.split(".")
        if not hmac.compare_digest(signature, _sign(f"{header_b64}.{body_b64}")):
            return None
        if json.loads(_unb64(header_b64)).get("alg") != _ALG:   # algoritmo fijado (rechaza "none")
            return None
        claims = json.loads(_unb64(body_b64))
        if int(claims.get("exp", 0)) < time.time():
            return None
    except (ValueError, TypeError, json.JSONDecodeError):
        return None
    sub = claims.get("sub")
    return sub if isinstance(sub, str) and sub else None


# ---------------------------------------------------------------------------
# Cookie
# ---------------------------------------------------------------------------
def _is_https(request) -> bool:
    return (request.headers.get("x-forwarded-proto") or request.url.scheme) == "https"


def set_session_cookie(response, request, username: str):
    response.set_cookie(
        key=COOKIE_NAME,
        value=create_token(username),
        max_age=SESSION_TTL_SECONDS,
        httponly=True,
        samesite="lax",
        secure=_is_https(request),   # solo viaja por HTTPS cuando se entró por HTTPS
        path="/",
    )


def clear_session_cookie(response):
    response.delete_cookie(COOKIE_NAME, path="/")


# ---------------------------------------------------------------------------
# Identificar al usuario
# ---------------------------------------------------------------------------
def _same_origin(headers) -> bool:
    """Si el navegador indica Origin, debe ser la misma web (frena peticiones lanzadas desde otros sitios)."""
    origin = headers.get("origin")
    if not origin:
        return True
    return urlparse(origin).netloc == headers.get("host")


def session_username(request: Request, x_username: str = Header(None)) -> Optional[str]:
    """Dependencia de FastAPI. Devuelve el nombre de usuario verificado por cookie o, en modo transición,
    el de la cabecera X-Username. Devuelve None si no hay sesión (cada endpoint responde 401 como hasta ahora)."""
    token = request.cookies.get(COOKIE_NAME)
    name = decode_token(token) if token else None
    if name:
        if request.method not in _SAFE_METHODS and not _same_origin(request.headers):
            raise HTTPException(status_code=403, detail="Origen no permitido.")
        return name
    if ALLOW_LEGACY and x_username and x_username.strip():
        return x_username.strip()
    return None


def ws_username(websocket: WebSocket, legacy_name: Optional[str] = None) -> Optional[str]:
    """Igual que session_username pero para WebSockets. legacy_name es el nombre que mandaba el cliente
    (solo se acepta en modo transición). None = rechazar la conexión."""
    if not _same_origin(websocket.headers):
        return None
    token = websocket.cookies.get(COOKIE_NAME)
    name = decode_token(token) if token else None
    if name:
        return name
    if ALLOW_LEGACY and legacy_name and legacy_name.strip():
        return legacy_name.strip()
    return None
