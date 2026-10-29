"""Proxy de Giphy: la API key vive solo en el servidor (GIPHY_API_KEY en .env)."""
import json
import os
import urllib.error
import urllib.parse
import urllib.request

from fastapi import APIRouter, Depends, HTTPException, Query
from backend.security import session_username

router = APIRouter(prefix="/api/giphy", tags=["Giphy"])

GIPHY_URL = "https://api.giphy.com/v1/gifs/search"


@router.get("/search")
def search(q: str = Query(..., min_length=1, max_length=60),
           limit: int = Query(9, ge=1, le=25),
           username: str = Depends(session_username)):
    key = os.getenv("GIPHY_API_KEY", "")
    if not key:
        raise HTTPException(503, "Giphy no configurado")
    params = urllib.parse.urlencode({"api_key": key, "q": q, "limit": limit, "lang": "es"})
    try:
        with urllib.request.urlopen(f"{GIPHY_URL}?{params}", timeout=6) as r:
            data = json.load(r)
    except (urllib.error.URLError, TimeoutError, ValueError):
        raise HTTPException(502, "Giphy no responde")
    # Solo se devuelve lo que usa el front
    return {"data": [{"images": {k: {"url": (g.get("images", {}).get(k) or {}).get("url")}
                                 for k in ("fixed_height", "fixed_height_small", "fixed_width", "original")}}
                     for g in data.get("data", [])]}
