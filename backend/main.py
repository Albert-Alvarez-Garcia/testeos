from backend.routers import cards, containers
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.routers import auth

app = FastAPI(title="Card Binder Pro API", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(cards.router)
app.include_router(containers.router)
app.include_router(auth.router)