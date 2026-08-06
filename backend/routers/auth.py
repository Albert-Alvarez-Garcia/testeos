from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr
from passlib.context import CryptContext
from backend.services import register_new_user, get_user_by_username_or_email

router = APIRouter(
    prefix="/api/auth",
    tags=["Authentication"]
)

# Configuración de passlib para hashear contraseñas con bcrypt
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# --- ESQUEMAS PYDANTIC ---
class UserRegister(BaseModel):
    username: str
    email: EmailStr
    password: str

class UserLogin(BaseModel):
    username_or_email: str
    password: str

import bcrypt

# Función para encriptar la contraseña
def get_password_hash(password: str) -> str:
    # Truncar a 72 bytes por seguridad y codificar
    password_bytes = password.encode('utf-8')[:72]
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password_bytes, salt)
    return hashed.decode('utf-8')

# Función para verificar la contraseña (si la necesitas en el login)
def verify_password(plain_password: str, hashed_password: str) -> bool:
    password_bytes = plain_password.encode('utf-8')[:72]
    return bcrypt.checkpw(password_bytes, hashed_password.encode('utf-8'))
# --- ENDPOINTS ---

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
    # Buscamos al usuario por nombre de usuario o email en la BBDD
    user = get_user_by_username_or_email(credentials.username_or_email)
    
    # Validamos si existe el usuario y si la contraseña coincide con el hash almacenado
    if not user or not verify_password(credentials.password, user["password_hash"]):
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