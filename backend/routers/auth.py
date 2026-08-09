import os
import json
import secrets
from urllib.parse import urlencode

import bcrypt
import requests
from fastapi import APIRouter, HTTPException, status, Request
from fastapi.responses import RedirectResponse, HTMLResponse
from pydantic import BaseModel, EmailStr
from passlib.context import CryptContext

from backend.services import (
    register_new_user,
    get_user_by_username_or_email,
    get_user_by_username,
    create_42_user,
    update_user_auth_type_to_42,
)

router = APIRouter(
    prefix="/api/auth",
    tags=["Authentication"]
)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# 42 OAuth2 / OpenID-style public profile endpoints.
FORTYTWO_AUTHORIZE_URL = "https://api.intra.42.fr/oauth/authorize"
FORTYTWO_TOKEN_URL = "https://api.intra.42.fr/oauth/token"
FORTYTWO_ME_URL = "https://api.intra.42.fr/v2/me"

FORTYTWO_CLIENT_ID = os.getenv("FORTYTWO_CLIENT_ID")
FORTYTWO_CLIENT_SECRET = os.getenv("FORTYTWO_CLIENT_SECRET")
FORTYTWO_REDIRECT_URI = os.getenv(
    "FORTYTWO_REDIRECT_URI",
    "http://localhost:8000/api/auth/42/callback"
)


class UserRegister(BaseModel):
    username: str
    email: EmailStr
    password: str


class UserLogin(BaseModel):
    username_or_email: str
    password: str


# Función para encriptar la contraseña
def get_password_hash(password: str) -> str:
    password_bytes = password.encode('utf-8')[:72]
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password_bytes, salt)
    return hashed.decode('utf-8')


def verify_password(plain_password: str, hashed_password: str) -> bool:
    password_bytes = plain_password.encode('utf-8')[:72]
    return bcrypt.checkpw(password_bytes, hashed_password.encode('utf-8'))


@router.post("/register")
async def register_user(user: UserRegister):
    hashed_pass = get_password_hash(user.password)
    result = register_new_user(user.username, user.email, hashed_pass)

    if not result["success"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El nombre de usuario o el correo electrónico ya están registrados."
        )

    return {
        "message": "¡Cuenta civil creada con éxito!",
        "user": result["user"]
    }


@router.post("/login")
async def login_user(credentials: UserLogin):
    user = get_user_by_username_or_email(credentials.username_or_email)

    if not user or not user.get("password_hash"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales incorrectas. Revisa tu usuario/email y contraseña."
        )

    if not verify_password(credentials.password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales incorrectas. Revisa tu usuario/email y contraseña."
        )

    return {
        "message": "¡Inicio de sesión exitoso!",
        "username": user["username"],
        "badge": user["badge_type"],
        "redirect": "index.html"
    }


@router.get("/42/login")
async def login_with_42():
    """Inicia OAuth2 Authorization Code Flow contra 42."""
    if not FORTYTWO_CLIENT_ID or not FORTYTWO_CLIENT_SECRET:
        raise HTTPException(
            status_code=500,
            detail="Faltan FORTYTWO_CLIENT_ID y/o FORTYTWO_CLIENT_SECRET en el entorno."
        )

    state = secrets.token_urlsafe(32)
    params = {
        "client_id": FORTYTWO_CLIENT_ID,
        "redirect_uri": FORTYTWO_REDIRECT_URI,
        "response_type": "code",
        "scope": "public",
        "state": state,
    }

    response = RedirectResponse(
        url=f"{FORTYTWO_AUTHORIZE_URL}?{urlencode(params)}",
        status_code=302,
    )
    response.set_cookie(
        key="oauth42_state",
        value=state,
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=600,
        path="/api/auth/42",
    )
    return response


@router.get("/42/callback")
async def callback_42(
    request: Request,
    code: str = None,
    state: str = None,
    error: str = None,
):
    """Recibe el callback de 42, identifica al usuario y crea/inicia su cuenta."""
    if error:
        raise HTTPException(status_code=400, detail=f"42 rechazó la autorización: {error}")

    if not code:
        raise HTTPException(status_code=400, detail="42 no devolvió ningún code.")

    expected_state = request.cookies.get("oauth42_state")
    if not state or not expected_state or not secrets.compare_digest(state, expected_state):
        raise HTTPException(
            status_code=400,
            detail="Estado OAuth inválido o caducado. Vuelve a iniciar sesión con 42."
        )

    if not FORTYTWO_CLIENT_ID or not FORTYTWO_CLIENT_SECRET:
        raise HTTPException(status_code=500, detail="Faltan las credenciales OAuth de 42 en el entorno.")

    token_response = requests.post(
        FORTYTWO_TOKEN_URL,
        data={
            "grant_type": "authorization_code",
            "client_id": FORTYTWO_CLIENT_ID,
            "client_secret": FORTYTWO_CLIENT_SECRET,
            "code": code,
            "redirect_uri": FORTYTWO_REDIRECT_URI,
        },
        headers={"Accept": "application/json"},
        timeout=15,
    )

    if token_response.status_code != 200:
        print("❌ Error token 42:", token_response.status_code, token_response.text)
        raise HTTPException(status_code=502, detail="No se pudo obtener el token de acceso de 42.")

    token_data = token_response.json()
    access_token = token_data.get("access_token")
    if not access_token:
        raise HTTPException(status_code=502, detail="42 no devolvió un access_token válido.")

    me_response = requests.get(
        FORTYTWO_ME_URL,
        headers={
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/json",
        },
        timeout=15,
    )

    if me_response.status_code != 200:
        print("❌ Error /v2/me 42:", me_response.status_code, me_response.text)
        raise HTTPException(status_code=502, detail="No se pudo obtener el perfil del usuario de 42.")

    profile = me_response.json()
    username = (profile.get("login") or "").strip()
    email = (profile.get("email") or "").strip().lower()

    if not username:
        raise HTTPException(status_code=502, detail="42 no devolvió el login del usuario.")

    user = get_user_by_username(username)

    if user:
        if user.get("auth_type") == "42":
            final_user = user
        elif email and user.get("email", "").strip().lower() == email:
            final_user = update_user_auth_type_to_42(username)
            if not final_user:
                raise HTTPException(status_code=500, detail="No se pudo vincular la cuenta existente con 42.")
        else:
            # Evita que un login 42 pueda apropiarse de una cuenta local solo por coincidir el alias.
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Ya existe una cuenta local con el usuario '{username}'. "
                    "Inicia sesión con tu contraseña o vincúlala explícitamente con 42."
                ),
            )
    else:
        generated_password = secrets.token_urlsafe(48)
        password_hash = get_password_hash(generated_password)
        if not email:
            email = f"{username}@42.local"

        result = create_42_user(username, email, password_hash)
        if not result["success"]:
            raise HTTPException(
                status_code=400,
                detail="No se pudo crear la cuenta de Card Binder para el usuario de 42.",
            )
        final_user = result["user"]

    # El frontend actual usa localStorage.cardbinder_user. Esta página puente
    # lo escribe en el navegador y vuelve al index sin modificar login.html.
    payload = {
        "username": final_user["username"],
        "badge": final_user.get("badge_type", "42_student"),
    }

    payload_json = json.dumps(payload).replace("<", "\\u003c")

    html = f"""<!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <title>Card Binder — Autenticando con 42</title>
    </head>
    <body>
    <script>
    const user = {payload_json};
    const params = new URLSearchParams();
    params.set('auth42', btoa(unescape(encodeURIComponent(JSON.stringify(user)))));

    window.location.replace('http://localhost/index.html?' + params.toString());
    </script>

    <p>Autenticación correcta. Redirigiendo...</p>
    </body>
    </html>"""

    response = HTMLResponse(content=html, status_code=200)
    response.delete_cookie("oauth42_state", path="/api/auth/42")
    return response