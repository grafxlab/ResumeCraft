from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import admin, applications, auth, documents, jobs, profiles, templates
from app.config import settings
from app.database import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="ResumeCraft API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(profiles.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(templates.router, prefix="/api")
app.include_router(jobs.router, prefix="/api")
app.include_router(documents.router, prefix="/api")
app.include_router(applications.router, prefix="/api")
app.include_router(admin.router, prefix="/api")


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok"}
