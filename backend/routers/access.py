"""
Control de acceso por tipo de cuenta.

Endpoints (prefijo /api/access):
  GET /pong   200 si la cuenta es de 42, 403 si no lo es, 401 si no hay sesión válida.

Cómo proteger otras rutas del Pong (las del servidor del juego online):
  - Rutas HTTP: usa `require_42_user` como dependencia de FastAPI.
        @router.post("/pong/rooms")
        def create_room(current_user: dict = Depends(require_42_user)): ...
  - WebSocket (el navegador no puede enviar cabeceras): comprueba al conectar.
        @router.websocket("/ws/pong")
        async def pong_ws(websocket: WebSocket, username: str):
            if not user_for_websocket(username):
                await websocket.close(code=4403)
                return
            await websocket.accept()

Nota: la identidad llega en la cabecera X-Username, igual que en el resto de la API, y esa
cabecera la puede escribir cualquiera. Este control evita que entren usuarios normales por la web,
pero no protege frente a alguien que fabrique peticiones a mano. Para blindarlo hace falta
firmar la sesión (tokens JWT; ya tienes python-jose en requirements.txt).
"""
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException

from backend.services import get_user_by_username_or_email

router = APIRouter(prefix="/api/access", tags=["Access"])


def get_current_user(x_username: str = Header(None)):
    if not x_username:
        raise HTTPException(
            status_code=401,
            detail="No se ha proporcionado el usuario en la cabecera (Falta X-Username)."
        )
    user = get_user_by_username_or_email(x_username)
    if not user:
        raise HTTPException(
            status_code=401,
            detail="Usuario no encontrado en la base de datos."
        )
    return user


def is_42_user(user: Optional[dict]) -> bool:
    """Una cuenta es de 42 cuando se registró o se vinculó con el login de 42 (users.auth_type = '42')."""
    return bool(user) and str(user.get("auth_type") or "").lower() == "42"


def require_42_user(current_user: dict = Depends(get_current_user)):
    if not is_42_user(current_user):
        raise HTTPException(
            status_code=403,
            detail="Este juego es solo para usuarios de 42."
        )
    return current_user


def user_for_websocket(identifier: Optional[str]) -> Optional[dict]:
    """Devuelve el usuario si existe y es de 42; en cualquier otro caso, None."""
    if not identifier:
        return None
    user = get_user_by_username_or_email(identifier)
    return user if is_42_user(user) else None


@router.get("/pong")
def pong_access(current_user: dict = Depends(require_42_user)):
    return {"allowed": True, "username": current_user.get("username")}
