"""
pong_main.py  ·  Punto de entrada del backend de Pong Isométrico

Ejecutar (desde la carpeta de este fichero):
    pip install fastapi "uvicorn[standard]"
    python pong_main.py
o bien:
    uvicorn pong_main:app --host 0.0.0.0 --port 8000 --reload

Si ya tienes una app FastAPI (p. ej. la del juego de cartas), no necesitas este
fichero: basta con   app.include_router(pong_game.router)   en tu main existente.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

try:
    from backend.routers.pong_game import router as pong_router   # si lo colocas dentro del paquete `backend`
except ImportError:
    from backend.routers.pong_game import router as pong_router           # si está junto a este fichero

app = FastAPI(title="Pong Isométrico", version="1.0.0")

# Orígenes del frontend en desarrollo (Vite = 5173, CRA = 3000). Ajusta en producción.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(pong_router)


@app.get("/")
def root():
    return {"service": "Pong Isométrico", "status": "ok", "docs": "/docs"}


@app.get("/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("pong_main:app", host="0.0.0.0", port=8000, reload=True)
