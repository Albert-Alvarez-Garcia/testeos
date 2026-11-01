#!/usr/bin/env python3
"""Validación en backend (Pydantic) y frontend (atributos HTML) de registro, login y contenedores.
Desde ~/testeo:  python3 validate_forms.py   |   python3 validate_forms.py --undo"""
import os, re, shutil, sys
A, C, P, H = 'backend/routers/auth.py', 'backend/routers/containers.py', 'backend/routers/profile.py', 'frontend/login.html'
if '--undo' in sys.argv:
    for f in (A, C, P, H):
        if os.path.exists(f + '.vbak'): shutil.copy(f + '.vbak', f); print('restaurado', f)
    sys.exit()
for f in (A, C, P, H):
    if not os.path.exists(f + '.vbak'): shutil.copy(f, f + '.vbak')

def sub(path, old, new, count=1):
    s = open(path).read()
    if new in s: return print('ya aplicado:', path, old[:40].strip())
    if old not in s: sys.exit(f'AVISO: ancla no encontrada en {path}: {old[:50]!r}')
    open(path, 'w').write(s.replace(old, new, count))

# ---- auth.py ----
sub(A, 'from pydantic import BaseModel, EmailStr', 'from pydantic import BaseModel, EmailStr, Field')
sub(A, '''class UserRegister(BaseModel):
    username: str
    email: EmailStr
    password: str


class UserLogin(BaseModel):
    username_or_email: str
    password: str
''', '''class UserRegister(BaseModel):
    username: str = Field(..., min_length=3, max_length=30)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)


class UserLogin(BaseModel):
    username_or_email: str = Field(..., min_length=1, max_length=254)
    password: str = Field(..., min_length=1, max_length=128)


USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]+$")
''')
sub(A, '''async def register_user(user: UserRegister, request: Request, response: Response):
''', '''async def register_user(user: UserRegister, request: Request, response: Response):
    if not USERNAME_RE.fullmatch(user.username):
        raise HTTPException(status_code=400, detail="El usuario solo puede contener letras, números, punto, guion y guion bajo.")
    if len(str(user.email)) > 254:
        raise HTTPException(status_code=400, detail="El correo es demasiado largo.")
''')
s = open(A).read()
if not re.search(r'^import re\b', s, re.M):
    open(A, 'w').write('import re\n' + s)

# ---- containers.py ----
sub(C, '''class ContainerCreate(BaseModel):
    name: str
    type: str  # Recibirá 'binder', 'binder_s', 'binder_m', 'binder_xl', 'deck', 'box'
    max_capacity: Optional[int] = None
    slots_per_page: Optional[int] = 9
    total_pages: Optional[int] = None
    sideboard_capacity: Optional[int] = None''', '''class ContainerCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=60)
    type: str = Field(..., min_length=1, max_length=20)  # 'binder', 'binder_s', 'binder_m', 'binder_xl', 'deck', 'box'
    max_capacity: Optional[int] = Field(None, ge=0, le=100000)
    slots_per_page: Optional[int] = Field(9, ge=0, le=100)
    total_pages: Optional[int] = Field(None, ge=0, le=10000)
    sideboard_capacity: Optional[int] = Field(None, ge=0, le=1000)''')
sub(C, '''    condition: Optional[str] = "Near Mint"
    language: Optional[str] = "en"
    is_foil: Optional[bool] = False
    notes: Optional[str] = None''', '''    condition: Optional[str] = Field("Near Mint", max_length=30)
    language: Optional[str] = Field("en", max_length=10)
    is_foil: Optional[bool] = False
    notes: Optional[str] = Field(None, max_length=500)''')

# ---- profile.py ----
s = open(P).read()
if 'Field' not in s.split('class TargetUser')[0]:
    s = re.sub(r'from pydantic import ([^\n]+)', lambda m: m.group(0) if 'Field' in m.group(1) else f'from pydantic import {m.group(1)}, Field', s, count=1)
    open(P, 'w').write(s)
sub(P, 'class TargetUser(BaseModel):\n    username: str', 'class TargetUser(BaseModel):\n    username: str = Field(..., min_length=1, max_length=100)')

# ---- login.html (frontend) ----
def attr(idv, extra):
    s = open(H).read()
    m = re.search(r'(<input[^>]*id="%s")' % idv, s)
    if not m: return print('AVISO: no encuentro', idv)
    if extra.split('=')[0] in m.group(0): return
    open(H, 'w').write(s.replace(m.group(1), m.group(1) + ' ' + extra, 1))
attr('regUser', 'minlength="3" maxlength="30" pattern="[A-Za-z0-9_.\\-]+" title="3-30 caracteres: letras, números, punto, guion y guion bajo" autocomplete="username"')
attr('regEmail', 'maxlength="254" autocomplete="email"')
attr('regPass', 'minlength="8" maxlength="128" autocomplete="new-password" title="Mínimo 8 caracteres"')
attr('loginUser', 'maxlength="254" autocomplete="username"')
attr('loginPass', 'maxlength="128" autocomplete="current-password"')
print('Hecho. Aplica con: make restart')
