from backend.routers import cards
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.services import search_cards_by_substring

app = FastAPI(title="Card Binder Pro API", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"status": "online", "message": "Bienvenido a la API de Card Binder Pro"}

app.include_router(cards.router)