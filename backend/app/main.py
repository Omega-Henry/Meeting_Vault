from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings

app = FastAPI(title="MeetingVault API")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict this to the frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health_check():
    return {"status": "ok"}

from app.api import upload, assistant, chats

app.include_router(upload.router, prefix="/api")
app.include_router(assistant.router, prefix="/api")
app.include_router(chats.router, prefix="/api")


